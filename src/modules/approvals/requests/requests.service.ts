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
import { ApprovalRulesService, RuleRow } from '../rules/rules.service';
import { ApprovalOperator } from '../rules/dtos/rule.dto';
import { ApprovalDecision, DecideRequestDto } from './dtos/request.dto';

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

export interface RequestRow {
  id: string;
  organization_id: string;
  rule_id: string | null;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  triggered_field: string;
  triggered_operator: ApprovalOperator;
  triggered_value: unknown;
  observed_value: unknown;
  reason: string | null;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  eligible_approver_user_ids: string[] | null;
  requested_by: string | null;
  requested_at: Date;
  updated_at: Date;
}

/**
 * Motor de aprovação. Dois pontos de entrada:
 *
 *   1. `evaluateAndCreate(entityType, entityId, entityData, label, user)`
 *      Chamado por SalesDocumentsService (e futuros: Purchases, Expenses).
 *      Lê todas as regras ativas, aplica condition contra `entityData`.
 *      Para cada regra match: cria approval_request status='pending' e
 *      retorna a lista. O caller decide o que fazer (geralmente
 *      bloquear transição e marcar approval_status='pending').
 *
 *   2. `decide(requestId, decision, reason)`
 *      Aprovador faz a decisão. Atualiza request e dispara callback
 *      pra atualizar approval_status na entidade.
 */
@Injectable()
export class ApprovalRequestsService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly rulesService: ApprovalRulesService,
  ) {}

  private scope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId)
      throw new UnauthorizedException('Usuário sem organização vinculada');
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AVALIAÇÃO
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Avalia uma entidade contra todas as regras ativas do tipo.
   * Retorna lista de requests criados (vazia se nada disparou).
   *
   * Deve ser chamada DENTRO de uma transação do caller para garantir
   * atomicidade com a mudança que disparou a aprovação.
   */
  async evaluateAndCreate(
    entityType: string,
    entityId: string,
    entityData: Record<string, unknown>,
    entityLabel: string | null,
    organizationId: string,
    requestedByUserId: string,
    trx: Knex.Transaction,
  ): Promise<RequestRow[]> {
    const rules = await this.rulesService.listActiveForEntityType(organizationId, entityType);
    if (rules.length === 0) return [];

    // Idempotência: se já existe request pendente pra essa entidade, não duplica
    const existingPending = await trx<RequestRow>('approval_requests')
      .where({
        organization_id: organizationId,
        entity_type: entityType,
        entity_id: entityId,
        status: 'pending',
      })
      .first();
    if (existingPending) return [existingPending];

    const created: RequestRow[] = [];
    const now = new Date();

    for (const rule of rules) {
      const condition = this.normalizeJson<{
        field: string;
        operator: ApprovalOperator;
        value: unknown;
      }>(rule.trigger_condition);

      const observed = entityData[condition.field];
      if (!this.evaluate(observed, condition.operator, condition.value)) continue;

      // Calcula aprovadores elegíveis (cache)
      const approverIds = await this.resolveEligibleApprovers(organizationId, rule, trx);
      if (approverIds.length === 0) {
        // Sem aprovadores configurados — pula regra (não bloqueia operação)
        continue;
      }

      const id = randomUUID();
      await trx('approval_requests').insert({
        id,
        organization_id: organizationId,
        rule_id: rule.id,
        entity_type: entityType,
        entity_id: entityId,
        entity_label: entityLabel,
        status: 'pending',
        triggered_field: condition.field,
        triggered_operator: condition.operator,
        triggered_value: JSON.stringify(condition.value),
        observed_value: JSON.stringify(observed ?? null),
        eligible_approver_user_ids: JSON.stringify(approverIds),
        requested_by: requestedByUserId,
        requested_at: now,
        updated_at: now,
      });
      const row = (await trx<RequestRow>('approval_requests').where({ id }).first()) as RequestRow;
      created.push(row);
    }

    return created;
  }

  /**
   * Avalia operador. Suporta number, string, boolean, array (operador 'in').
   */
  private evaluate(observed: unknown, operator: ApprovalOperator, expected: unknown): boolean {
    if (observed == null) return false;

    if (operator === 'in') {
      if (!Array.isArray(expected)) return false;
      return expected.includes(observed as string);
    }

    // Comparações numéricas
    const o = Number(observed);
    const e = Number(expected);
    if (!Number.isNaN(o) && !Number.isNaN(e)) {
      switch (operator) {
        case '>':
          return o > e;
        case '>=':
          return o >= e;
        case '<':
          return o < e;
        case '<=':
          return o <= e;
        case '==':
          return o === e;
      }
    }
    // String comparison
    if (operator === '==') return String(observed) === String(expected);
    return false;
  }

  private async resolveEligibleApprovers(
    organizationId: string,
    rule: RuleRow,
    trx: Knex.Transaction,
  ): Promise<string[]> {
    const ids = new Set<string>();
    const userIds = this.normalizeJson<string[] | null>(rule.approver_user_ids);
    if (userIds?.length) {
      userIds.forEach((id) => ids.add(id));
    }
    const roles = this.normalizeJson<string[] | null>(rule.approver_roles);
    if (roles?.length) {
      const users = await trx('users')
        .where({ organization_id: organizationId })
        .whereIn('role', roles)
        .select<Array<{ id: string }>>('id');
      users.forEach((u) => ids.add(u.id));
    }
    return Array.from(ids);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INBOX / LISTAGEM
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Inbox do usuário atual: requests pendentes onde ele é aprovador elegível.
   * Filtragem feita em JS porque eligible_approver_user_ids é jsonb array.
   */
  async myInbox(user: AuthUserPayload): Promise<RequestRow[]> {
    const { organizationId, userId } = this.scope(user);

    const all = await this.knex<RequestRow>('approval_requests')
      .where({ organization_id: organizationId, status: 'pending' })
      .orderBy('requested_at', 'asc');

    return all.filter((r) => {
      const ids = this.normalizeJson<string[] | null>(r.eligible_approver_user_ids);
      return ids?.includes(userId) ?? false;
    });
  }

  /** Lista todas (admin view). */
  async list(
    user: AuthUserPayload,
    opts: { status?: string; entityType?: string } = {},
  ): Promise<RequestRow[]> {
    const { organizationId } = this.scope(user);
    return this.knex<RequestRow>('approval_requests')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (opts.status) q.andWhere({ status: opts.status });
        if (opts.entityType) q.andWhere({ entity_type: opts.entityType });
      })
      .orderBy('requested_at', 'desc')
      .limit(300);
  }

  async getByEntity(
    entityType: string,
    entityId: string,
    user: AuthUserPayload,
  ): Promise<RequestRow | null> {
    const { organizationId } = this.scope(user);
    const row = await this.knex<RequestRow>('approval_requests')
      .where({ organization_id: organizationId, entity_type: entityType, entity_id: entityId })
      .orderBy('requested_at', 'desc')
      .first();
    return row ?? null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DECISÃO
  // ═══════════════════════════════════════════════════════════════════════

  async decide(
    requestId: string,
    dto: DecideRequestDto,
    user: AuthUserPayload,
  ): Promise<RequestRow> {
    const { organizationId, userId } = this.scope(user);

    return this.knex.transaction(async (trx) => {
      const req = await trx<RequestRow>('approval_requests')
        .where({ id: requestId, organization_id: organizationId })
        .forUpdate()
        .first();
      if (!req) throw new NotFoundException('Solicitação não encontrada');
      if (req.status !== 'pending')
        throw new BadRequestException('Solicitação já foi decidida');

      const eligibleIds = this.normalizeJson<string[] | null>(req.eligible_approver_user_ids);
      if (!eligibleIds?.includes(userId)) {
        throw new ForbiddenException('Você não é um aprovador elegível para esta solicitação');
      }

      const newStatus: 'approved' | 'rejected' = dto.decision;
      const now = new Date();
      await trx('approval_requests').where({ id: requestId }).update({
        status: newStatus,
        decision_reason: dto.reason ?? null,
        decided_by: userId,
        decided_at: now,
        updated_at: now,
      });

      // Callback: atualiza approval_status na entidade
      if (req.entity_type === 'sales_document') {
        await trx('sales_documents')
          .where({ id: req.entity_id, organization_id: organizationId })
          .update({
            approval_status: newStatus,
            approval_request_id: requestId,
            updated_at: now,
          });
      }
      // Futuros: purchase_document, expense...

      return (await trx<RequestRow>('approval_requests')
        .where({ id: requestId })
        .first()) as RequestRow;
    });
  }

  async cancelRequest(
    entityType: string,
    entityId: string,
    organizationId: string,
    trx: Knex.Transaction,
  ): Promise<void> {
    await trx('approval_requests')
      .where({
        organization_id: organizationId,
        entity_type: entityType,
        entity_id: entityId,
        status: 'pending',
      })
      .update({ status: 'cancelled', updated_at: new Date() });
  }

  // Helper — Knex pode retornar jsonb como objeto JÁ parseado OU como string,
  // dependendo do driver. Normaliza pra um shape só.
  private normalizeJson<T>(value: unknown): T {
    if (value == null) return value as T;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    }
    return value as T;
  }
}
