import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

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

const VIEWER_ROLES = ['master', 'admin', 'manager', 'accountant'] as const;

export interface AuditRecordInput {
  organizationId?: string | null;
  userId?: string | null;
  userName?: string | null;
  userRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  httpMethod?: string | null;
  httpRoute?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  changes?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogRow {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  http_method: string | null;
  http_route: string | null;
  http_status: number | null;
  duration_ms: number | null;
  changes: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

/**
 * Trilha de auditoria. `record()` é à prova de falhas — nunca lança exceção
 * que possa quebrar a requisição que está sendo auditada.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject('knex') private readonly knex: Knex) {}

  /** Grava uma entrada de auditoria. Silencioso em caso de erro. */
  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.knex('audit_logs').insert({
        id: randomUUID(),
        organization_id: input.organizationId ?? null,
        user_id: input.userId ?? null,
        user_name: input.userName ?? null,
        user_role: input.userRole ?? null,
        action: input.action,
        entity_type: input.entityType ?? null,
        entity_id: this.asUuidOrNull(input.entityId),
        http_method: input.httpMethod ?? null,
        http_route: input.httpRoute ? input.httpRoute.slice(0, 500) : null,
        http_status: input.httpStatus ?? null,
        duration_ms: input.durationMs ?? null,
        changes:
          input.changes === undefined ? null : JSON.stringify(input.changes ?? null),
        ip_address: input.ipAddress ? input.ipAddress.slice(0, 64) : null,
        user_agent: input.userAgent ? input.userAgent.slice(0, 500) : null,
        created_at: new Date(),
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao gravar auditoria: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private asUuidOrNull(value: string | null | undefined): string | null {
    if (!value) return null;
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRe.test(value) ? value : null;
  }

  private scope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId)
      throw new UnauthorizedException('Usuário sem organização vinculada');
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }
  private ensureViewer(role: string) {
    if (!VIEWER_ROLES.includes(role as (typeof VIEWER_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar a auditoria');
  }

  /** Lista paginada com filtros. */
  async list(
    user: AuthUserPayload,
    opts: {
      action?: string;
      entityType?: string;
      entityId?: string;
      userId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<{ rows: AuditLogRow[]; total: number; page: number; pageSize: number }> {
    const { organizationId, role } = this.scope(user);
    this.ensureViewer(role);

    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(200, Math.max(10, opts.pageSize ?? 50));

    const baseQuery = () =>
      this.knex<AuditLogRow>('audit_logs')
        .where({ organization_id: organizationId })
        .modify((q) => {
          if (opts.action) q.andWhere({ action: opts.action });
          if (opts.entityType) q.andWhere('entity_type', 'like', `${opts.entityType}%`);
          if (opts.entityId) q.andWhere({ entity_id: opts.entityId });
          if (opts.userId) q.andWhere({ user_id: opts.userId });
          if (opts.from) q.andWhere('created_at', '>=', opts.from);
          if (opts.to) q.andWhere('created_at', '<=', opts.to);
        });

    const countRow = await baseQuery().count<{ c: string }[]>('* as c').first();
    const total = Number(countRow?.c ?? 0);

    const rows = await baseQuery()
      .orderBy('created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { rows, total, page, pageSize };
  }

  /** Trilha completa de uma entidade específica. */
  async listForEntity(
    user: AuthUserPayload,
    entityType: string,
    entityId: string,
  ): Promise<AuditLogRow[]> {
    const { organizationId, role } = this.scope(user);
    this.ensureViewer(role);
    return this.knex<AuditLogRow>('audit_logs')
      .where({ organization_id: organizationId, entity_id: entityId })
      .andWhere('entity_type', 'like', `${entityType}%`)
      .orderBy('created_at', 'desc')
      .limit(500);
  }
}
