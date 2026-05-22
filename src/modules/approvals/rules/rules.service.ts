import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import {
  ApprovalEntityType,
  ApprovalOperator,
  CreateRuleDto,
  UpdateRuleDto,
} from './dtos/rule.dto';

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

export interface RuleRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  entity_type: ApprovalEntityType;
  trigger_condition: { field: string; operator: ApprovalOperator; value: unknown };
  approver_roles: string[] | null;
  approver_user_ids: string[] | null;
  approvals_required: number;
  priority: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ApprovalRulesService {
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
      throw new ForbiddenException('Sem permissão para gerir regras de aprovação');
  }

  async list(user: AuthUserPayload, entityType?: ApprovalEntityType): Promise<RuleRow[]> {
    const { organizationId } = this.scope(user);
    return this.knex<RuleRow>('approval_rules')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (entityType) q.andWhere({ entity_type: entityType });
      })
      .orderBy([
        { column: 'entity_type', order: 'asc' },
        { column: 'priority', order: 'asc' },
      ]);
  }

  /** Acesso interno (RequestsService) — busca regras ativas pra um tipo. */
  async listActiveForEntityType(
    organizationId: string,
    entityType: string,
  ): Promise<RuleRow[]> {
    return this.knex<RuleRow>('approval_rules')
      .where({ organization_id: organizationId, entity_type: entityType, is_active: true })
      .orderBy('priority', 'asc');
  }

  async create(dto: CreateRuleDto, user: AuthUserPayload): Promise<RuleRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureAdmin(role);

    if (!dto.approverRoles?.length && !dto.approverUserIds?.length) {
      throw new BadRequestException(
        'Defina pelo menos approverRoles ou approverUserIds para a regra ter aprovadores',
      );
    }

    const id = randomUUID();
    const now = new Date();
    await this.knex('approval_rules').insert({
      id,
      organization_id: organizationId,
      name: dto.name,
      description: dto.description ?? null,
      entity_type: dto.entityType,
      trigger_condition: JSON.stringify(dto.triggerCondition),
      approver_roles: dto.approverRoles ? JSON.stringify(dto.approverRoles) : null,
      approver_user_ids: dto.approverUserIds ? JSON.stringify(dto.approverUserIds) : null,
      approvals_required: dto.approvalsRequired ?? 1,
      priority: dto.priority ?? 100,
      is_active: dto.isActive ?? true,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
    return (await this.knex<RuleRow>('approval_rules').where({ id }).first()) as RuleRow;
  }

  async update(id: string, dto: UpdateRuleDto, user: AuthUserPayload): Promise<RuleRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    const existing = await this.knex<RuleRow>('approval_rules')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Regra não encontrada');

    await this.knex('approval_rules')
      .where({ id })
      .update({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.triggerCondition !== undefined && {
          trigger_condition: JSON.stringify(dto.triggerCondition),
        }),
        ...(dto.approverRoles !== undefined && {
          approver_roles: dto.approverRoles ? JSON.stringify(dto.approverRoles) : null,
        }),
        ...(dto.approverUserIds !== undefined && {
          approver_user_ids: dto.approverUserIds ? JSON.stringify(dto.approverUserIds) : null,
        }),
        ...(dto.approvalsRequired !== undefined && { approvals_required: dto.approvalsRequired }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        updated_at: new Date(),
      });
    return (await this.knex<RuleRow>('approval_rules').where({ id }).first()) as RuleRow;
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);
    const deleted = await this.knex('approval_rules')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Regra não encontrada');
    return { success: true };
  }
}
