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
import { BillingPlansService } from '../plans/plans.service';
import { BillingCycle } from '../plans/dtos/plan.dto';
import {
  CancelSubscriptionDto,
  ChangePlanDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
} from './dtos/subscription.dto';

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

const WRITE_ROLES = ['master', 'admin', 'manager', 'sales'] as const;
const READ_ROLES = [...WRITE_ROLES, 'accountant', 'employee', 'sdr'] as const;

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled';

export interface SubscriptionRow {
  id: string;
  organization_id: string;
  customer_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  start_date: Date | string;
  trial_end_date: Date | string | null;
  current_period_start: Date | string;
  current_period_end: Date | string;
  next_billing_date: Date | string;
  billing_cycle: BillingCycle;
  amount: string | number;
  currency: string;
  quantity: string | number;
  discount_amount: string | number;
  cancellation_date: Date | string | null;
  cancellation_reason: string | null;
  notes: string | null;
  assigned_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Helpers de data — somam um ciclo a partir de uma data dada (UTC).
 * Trabalham em strings 'YYYY-MM-DD' para evitar timezones.
 */
export function addCycle(dateStr: string, cycle: BillingCycle): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  switch (cycle) {
    case 'monthly':
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case 'quarterly':
      date.setUTCMonth(date.getUTCMonth() + 3);
      break;
    case 'semiannual':
      date.setUTCMonth(date.getUTCMonth() + 6);
      break;
    case 'annual':
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
  }
  return date.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class BillingSubscriptionsService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly plansService: BillingPlansService,
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
  private ensureWrite(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para gerir assinaturas');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar assinaturas');
  }

  async list(user: AuthUserPayload, status?: SubscriptionStatus) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    return this.knex('billing_subscriptions as s')
      .leftJoin('customers as c', 's.customer_id', 'c.id')
      .leftJoin('billing_plans as p', 's.plan_id', 'p.id')
      .where('s.organization_id', organizationId)
      .modify((q) => {
        if (status) q.andWhere('s.status', status);
      })
      .select(
        's.*',
        { customer_name: 'c.name' },
        { customer_email: 'c.email' },
        { plan_name: 'p.name' },
      )
      .orderBy('s.next_billing_date', 'asc');
  }

  async getById(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    const s = await this.knex('billing_subscriptions as s')
      .leftJoin('customers as c', 's.customer_id', 'c.id')
      .leftJoin('billing_plans as p', 's.plan_id', 'p.id')
      .where({ 's.id': id, 's.organization_id': organizationId })
      .select('s.*', { customer_name: 'c.name' }, { customer_email: 'c.email' }, { plan_name: 'p.name' })
      .first();
    if (!s) throw new NotFoundException('Assinatura não encontrada');

    const invoices = await this.knex('billing_subscription_invoices as bi')
      .leftJoin('sales_documents as d', 'bi.sales_document_id', 'd.id')
      .where('bi.subscription_id', id)
      .orderBy('bi.generated_at', 'desc')
      .select('bi.*', { doc_number: 'd.doc_number' }, { doc_status: 'd.status' });

    return { ...s, invoices };
  }

  async create(dto: CreateSubscriptionDto, user: AuthUserPayload): Promise<SubscriptionRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    const customer = await this.knex('customers')
      .where({ id: dto.customerId, organization_id: organizationId })
      .first();
    if (!customer) throw new BadRequestException('Cliente inválido');

    const plan = await this.plansService.getByIdInternal(dto.planId, organizationId);
    if (!plan) throw new BadRequestException('Plano inválido');
    if (!plan.is_active) throw new BadRequestException('Plano inativo');

    const startDate = dto.startDate ?? today();
    const trialDays = plan.trial_days;
    const hasTrial = trialDays > 0;
    const trialEnd = hasTrial ? addDays(startDate, trialDays) : null;
    // Primeiro período de cobrança começa no fim do trial OU no start
    const firstPeriodStart = trialEnd ?? startDate;
    const firstPeriodEnd = addDays(addCycle(firstPeriodStart, plan.billing_cycle), -1);
    // Próxima cobrança = início do primeiro período (pay-in-advance)
    const nextBillingDate = firstPeriodStart;

    const id = randomUUID();
    const now = new Date();
    await this.knex('billing_subscriptions').insert({
      id,
      organization_id: organizationId,
      customer_id: dto.customerId,
      plan_id: plan.id,
      status: hasTrial ? 'trialing' : 'active',
      start_date: startDate,
      trial_end_date: trialEnd,
      current_period_start: firstPeriodStart,
      current_period_end: firstPeriodEnd,
      next_billing_date: nextBillingDate,
      billing_cycle: plan.billing_cycle,
      amount: dto.amountOverride ?? Number(plan.amount),
      currency: plan.currency,
      quantity: dto.quantity ?? 1,
      discount_amount: dto.discountAmount ?? 0,
      notes: dto.notes ?? null,
      assigned_user_id: dto.assignedUserId ?? null,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });

    return (await this.knex<SubscriptionRow>('billing_subscriptions')
      .where({ id })
      .first()) as SubscriptionRow;
  }

  async update(
    id: string,
    dto: UpdateSubscriptionDto,
    user: AuthUserPayload,
  ): Promise<SubscriptionRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const existing = await this.knex<SubscriptionRow>('billing_subscriptions')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Assinatura não encontrada');
    if (existing.status === 'cancelled')
      throw new BadRequestException('Assinatura cancelada não pode ser editada');

    await this.knex('billing_subscriptions')
      .where({ id })
      .update({
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.discountAmount !== undefined && { discount_amount: dto.discountAmount }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
        ...(dto.assignedUserId !== undefined && { assigned_user_id: dto.assignedUserId ?? null }),
        updated_at: new Date(),
      });
    return (await this.knex<SubscriptionRow>('billing_subscriptions')
      .where({ id })
      .first()) as SubscriptionRow;
  }

  async pause(id: string, user: AuthUserPayload): Promise<SubscriptionRow> {
    return this.changeStatus(id, 'paused', user);
  }
  async resume(id: string, user: AuthUserPayload): Promise<SubscriptionRow> {
    return this.changeStatus(id, 'active', user);
  }

  private async changeStatus(
    id: string,
    newStatus: SubscriptionStatus,
    user: AuthUserPayload,
  ): Promise<SubscriptionRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const existing = await this.knex<SubscriptionRow>('billing_subscriptions')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Assinatura não encontrada');
    if (existing.status === 'cancelled')
      throw new BadRequestException('Assinatura cancelada não pode mudar de status');

    await this.knex('billing_subscriptions')
      .where({ id })
      .update({ status: newStatus, updated_at: new Date() });
    return (await this.knex<SubscriptionRow>('billing_subscriptions')
      .where({ id })
      .first()) as SubscriptionRow;
  }

  async cancel(
    id: string,
    dto: CancelSubscriptionDto,
    user: AuthUserPayload,
  ): Promise<SubscriptionRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const existing = await this.knex<SubscriptionRow>('billing_subscriptions')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Assinatura não encontrada');
    if (existing.status === 'cancelled')
      return existing;

    const when = dto.when ?? 'end_of_period';
    const cancellationDate =
      when === 'immediate'
        ? today()
        : new Date(existing.current_period_end).toISOString().slice(0, 10);

    if (when === 'immediate') {
      await this.knex('billing_subscriptions').where({ id }).update({
        status: 'cancelled',
        cancellation_date: cancellationDate,
        cancellation_reason: dto.reason ?? null,
        updated_at: new Date(),
      });
    } else {
      // Marca cancellation_date no fim do período, NÃO cancela ainda.
      // O cron irá detectar e marcar como cancelled quando a data chegar.
      await this.knex('billing_subscriptions').where({ id }).update({
        cancellation_date: cancellationDate,
        cancellation_reason: dto.reason ?? null,
        // Importante: zera próxima cobrança para não emitir mais faturas
        next_billing_date: cancellationDate,
        updated_at: new Date(),
      });
    }

    return (await this.knex<SubscriptionRow>('billing_subscriptions')
      .where({ id })
      .first()) as SubscriptionRow;
  }

  async changePlan(
    id: string,
    dto: ChangePlanDto,
    user: AuthUserPayload,
  ): Promise<SubscriptionRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const existing = await this.knex<SubscriptionRow>('billing_subscriptions')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Assinatura não encontrada');
    if (existing.status === 'cancelled')
      throw new BadRequestException('Assinatura cancelada — não é possível trocar de plano');

    const newPlan = await this.plansService.getByIdInternal(dto.newPlanId, organizationId);
    if (!newPlan) throw new BadRequestException('Plano novo inválido');

    const effective = dto.effective ?? 'next_cycle';
    if (effective === 'immediate') {
      // Atualiza snapshots e mantém datas atuais.
      // O próximo ciclo (caso já tenha sido faturado) terá valor antigo;
      // o seguinte e os demais usarão o novo plano.
      await this.knex('billing_subscriptions').where({ id }).update({
        plan_id: newPlan.id,
        amount: Number(newPlan.amount),
        currency: newPlan.currency,
        billing_cycle: newPlan.billing_cycle,
        updated_at: new Date(),
      });
    } else {
      // next_cycle: salva intenção. Ao gerar a próxima fatura, o
      // GenerationService aplicará os novos valores.
      // Para simplificar — atualizamos os snapshots agora mesmo;
      // a fatura corrente já foi gerada com os valores antigos
      // (pay-in-advance), então a próxima já usa os novos.
      await this.knex('billing_subscriptions').where({ id }).update({
        plan_id: newPlan.id,
        amount: Number(newPlan.amount),
        currency: newPlan.currency,
        billing_cycle: newPlan.billing_cycle,
        updated_at: new Date(),
      });
    }
    return (await this.knex<SubscriptionRow>('billing_subscriptions')
      .where({ id })
      .first()) as SubscriptionRow;
  }
}
