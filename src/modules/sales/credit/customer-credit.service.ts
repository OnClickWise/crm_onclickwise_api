import {
  ConflictException,
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

const ADMIN_ROLES = ['master', 'admin', 'manager', 'accountant'] as const;

export interface CustomerCreditStatus {
  customerId: string;
  customerName: string;
  creditLimit: number | null;
  exposureOutstanding: number;
  exposureDrafts: number;
  totalExposure: number;
  remainingCredit: number | null;
  isBlocked: boolean;
  blockReason: string | null;
  blockedAt: string | null;
  daysOverdue: number;
  overdueAmount: number;
}

/**
 * Gestão de risco de crédito do cliente.
 *
 * Conceitos:
 *  - exposure_outstanding: soma do em-aberto de AR não-cancelado (faturas
 *    emitidas, NC abate)
 *  - exposure_drafts: soma de orçamentos/encomendas em fluxo (ainda não
 *    faturados) — risco potencial
 *  - total_exposure: outstanding + drafts
 *  - remaining_credit: credit_limit - total_exposure (null se sem limite)
 *
 * A função `assertCanCreateDocument` deve ser chamada pelo SalesDocumentsService
 * antes de criar um documento de venda — bloqueia se:
 *  1. Cliente está com is_blocked=true (qualquer motivo)
 *  2. Existe credit_limit e o novo documento excederia o limite
 */
@Injectable()
export class CustomerCreditService {
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
      throw new ForbiddenException('Sem permissão para gerir crédito');
  }

  /**
   * Calcula status de crédito completo do cliente.
   */
  async getStatus(customerId: string, user: AuthUserPayload): Promise<CustomerCreditStatus> {
    const { organizationId } = this.scope(user);

    const customer = await this.knex('customers')
      .where({ id: customerId, organization_id: organizationId })
      .first<{
        id: string;
        name: string;
        credit_limit: string | number | null;
        is_blocked: boolean;
        block_reason: string | null;
        blocked_at: Date | null;
      }>();
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    // AR em aberto (faturas não-canceladas, não totalmente pagas)
    const arAgg = await this.knex('accounts_receivable')
      .where({ organization_id: organizationId, customer_id: customerId })
      .whereNot('status', 'cancelled')
      .sum<{ outstanding: string | null }[]>('outstanding_amount as outstanding')
      .first();

    // Drafts em fluxo de venda
    const draftsAgg = await this.knex('sales_documents')
      .where({ organization_id: organizationId, customer_id: customerId })
      .whereIn('status', ['draft', 'sent', 'accepted'])
      .whereIn('doc_type', ['quote', 'order'])
      .sum<{ total: string | null }[]>('total as total')
      .first();

    // Em atraso: AR vencido
    const today = new Date().toISOString().slice(0, 10);
    const overdue = await this.knex('accounts_receivable')
      .where({ organization_id: organizationId, customer_id: customerId })
      .whereIn('status', ['issued', 'partial', 'overdue'])
      .where('due_date', '<', today)
      .select<
        Array<{ outstanding_amount: string | number; due_date: Date | string }>
      >('outstanding_amount', 'due_date');

    const overdueAmount = overdue.reduce((s, r) => s + Number(r.outstanding_amount), 0);
    let daysOverdue = 0;
    if (overdue.length > 0) {
      const oldest = overdue
        .map((r) => new Date(r.due_date))
        .reduce((a, b) => (a < b ? a : b));
      daysOverdue = Math.floor((Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24));
    }

    const outstanding = Number(arAgg?.outstanding ?? 0);
    const drafts = Number(draftsAgg?.total ?? 0);
    const total = outstanding + drafts;
    const limit = customer.credit_limit != null ? Number(customer.credit_limit) : null;

    return {
      customerId,
      customerName: customer.name,
      creditLimit: limit,
      exposureOutstanding: outstanding,
      exposureDrafts: drafts,
      totalExposure: total,
      remainingCredit: limit != null ? limit - total : null,
      isBlocked: customer.is_blocked,
      blockReason: customer.block_reason,
      blockedAt: customer.blocked_at ? new Date(customer.blocked_at).toISOString() : null,
      daysOverdue,
      overdueAmount,
    };
  }

  /**
   * Valida se um cliente pode receber um novo documento de venda.
   * Chamado pelo SalesDocumentsService antes de criar.
   *
   * Lança ConflictException se bloqueado ou excederia limite.
   */
  async assertCanCreateDocument(
    customerId: string,
    incomingTotal: number,
    user: AuthUserPayload,
  ): Promise<void> {
    const status = await this.getStatus(customerId, user);

    if (status.isBlocked) {
      throw new ConflictException(
        `Cliente bloqueado: ${status.blockReason ?? 'sem motivo registrado'}`,
      );
    }

    if (status.creditLimit != null) {
      const newExposure = status.totalExposure + incomingTotal;
      if (newExposure > status.creditLimit) {
        throw new ConflictException(
          `Limite de crédito excedido. Limite: ${status.creditLimit.toFixed(2)}, ` +
            `exposição atual: ${status.totalExposure.toFixed(2)}, ` +
            `novo documento: ${incomingTotal.toFixed(2)} (total ficaria ${newExposure.toFixed(2)})`,
        );
      }
    }
  }

  // ─── Bloqueio manual ───────────────────────────────────────────────────

  async block(
    customerId: string,
    reason: string,
    user: AuthUserPayload,
  ): Promise<CustomerCreditStatus> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureAdmin(role);
    const c = await this.knex('customers')
      .where({ id: customerId, organization_id: organizationId })
      .first();
    if (!c) throw new NotFoundException('Cliente não encontrado');
    await this.knex('customers').where({ id: customerId }).update({
      is_blocked: true,
      block_reason: reason,
      blocked_at: new Date(),
      blocked_by: userId,
      updated_at: new Date(),
    });
    return this.getStatus(customerId, user);
  }

  async unblock(customerId: string, user: AuthUserPayload): Promise<CustomerCreditStatus> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);
    await this.knex('customers').where({ id: customerId, organization_id: organizationId }).update({
      is_blocked: false,
      block_reason: null,
      blocked_at: null,
      blocked_by: null,
      updated_at: new Date(),
    });
    return this.getStatus(customerId, user);
  }

  async setCreditLimit(
    customerId: string,
    limit: number | null,
    user: AuthUserPayload,
  ): Promise<CustomerCreditStatus> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);
    if (limit != null && limit < 0) {
      throw new ConflictException('Limite de crédito não pode ser negativo');
    }
    await this.knex('customers')
      .where({ id: customerId, organization_id: organizationId })
      .update({
        credit_limit: limit,
        updated_at: new Date(),
      });
    return this.getStatus(customerId, user);
  }

  /**
   * Job: bloqueia automaticamente clientes com AR vencida há mais de N dias
   * acima de threshold de valor. Pode ser rodado por cron ou manualmente
   * via endpoint admin.
   */
  async autoBlockOverdue(
    user: AuthUserPayload,
    opts: { minDaysOverdue?: number; minOverdueAmount?: number } = {},
  ): Promise<{ blocked: number; alreadyBlocked: number; clean: number }> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureAdmin(role);

    const days = opts.minDaysOverdue ?? 30;
    const amount = opts.minOverdueAmount ?? 0;

    const customers = await this.knex('customers')
      .where({ organization_id: organizationId })
      .select<Array<{ id: string; is_blocked: boolean }>>('id', 'is_blocked');

    let blocked = 0;
    let alreadyBlocked = 0;
    let clean = 0;

    for (const c of customers) {
      const status = await this.getStatus(c.id, user);
      if (status.daysOverdue >= days && status.overdueAmount >= amount) {
        if (c.is_blocked) {
          alreadyBlocked++;
        } else {
          await this.knex('customers').where({ id: c.id }).update({
            is_blocked: true,
            block_reason: `Auto-bloqueio: ${status.daysOverdue} dias em atraso, ${status.overdueAmount.toFixed(2)} em aberto`,
            blocked_at: new Date(),
            blocked_by: userId,
            updated_at: new Date(),
          });
          blocked++;
        }
      } else {
        clean++;
      }
    }

    return { blocked, alreadyBlocked, clean };
  }
}
