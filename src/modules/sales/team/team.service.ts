import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';

interface AuthScope {
  organizationId: string;
  userId: string;
  role: string;
}
interface AuthUserPayload {
  organizationId?: string;
  userId?: string;
  role?: string;
}

const ADMIN_ROLES = ['master', 'admin', 'manager'] as const;

export interface SalesTeamMemberRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  default_commission_pct: string | number | null;
}

/**
 * Gestão de equipe comercial: lista usuários da org e configura comissão
 * padrão. Restrito a admin/master/manager.
 */
@Injectable()
export class SalesTeamService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private scope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId)
      throw new UnauthorizedException('Usuário sem organização vinculada');
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }
  private ensureAdmin(role: string) {
    if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para gerir equipe comercial');
  }

  async listTeam(user: AuthUserPayload): Promise<SalesTeamMemberRow[]> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    return this.knex<SalesTeamMemberRow>('users')
      .where({ organization_id: organizationId })
      .select('id', 'name', 'email', 'role', 'default_commission_pct')
      .orderBy('name', 'asc');
  }

  async setCommissionPct(
    targetUserId: string,
    pct: number | null,
    user: AuthUserPayload,
  ): Promise<SalesTeamMemberRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    if (pct != null && (pct < 0 || pct > 100)) {
      throw new ForbiddenException('Percentual fora do range 0-100');
    }

    const target = await this.knex('users')
      .where({ id: targetUserId, organization_id: organizationId })
      .first();
    if (!target) throw new NotFoundException('Usuário não encontrado nesta organização');

    await this.knex('users').where({ id: targetUserId }).update({
      default_commission_pct: pct,
      updated_at: new Date(),
    });

    return (await this.knex<SalesTeamMemberRow>('users')
      .where({ id: targetUserId })
      .select('id', 'name', 'email', 'role', 'default_commission_pct')
      .first()) as SalesTeamMemberRow;
  }
}
