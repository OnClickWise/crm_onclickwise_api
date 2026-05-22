import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { BillingCycle, CreatePlanDto, UpdatePlanDto } from './dtos/plan.dto';

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

export interface PlanRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  amount: string | number;
  currency: string;
  billing_cycle: BillingCycle;
  trial_days: number;
  product_id: string | null;
  default_tax_rate_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class BillingPlansService {
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
  private ensureWrite(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para gerir planos');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar planos');
  }

  async list(user: AuthUserPayload, activeOnly = false): Promise<PlanRow[]> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    return this.knex<PlanRow>('billing_plans')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (activeOnly) q.andWhere({ is_active: true });
      })
      .orderBy('name', 'asc');
  }

  /** Acesso interno (SubscriptionsService) — sem checagem de role. */
  async getByIdInternal(id: string, organizationId: string): Promise<PlanRow | null> {
    const row = await this.knex<PlanRow>('billing_plans')
      .where({ id, organization_id: organizationId })
      .first();
    return row ?? null;
  }

  async getById(id: string, user: AuthUserPayload): Promise<PlanRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    const row = await this.knex<PlanRow>('billing_plans')
      .where({ id, organization_id: organizationId })
      .first();
    if (!row) throw new NotFoundException('Plano não encontrado');
    return row;
  }

  async create(dto: CreatePlanDto, user: AuthUserPayload): Promise<PlanRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    const dup = await this.knex('billing_plans')
      .where({ organization_id: organizationId, code: dto.code })
      .first();
    if (dup) throw new ConflictException('Já existe um plano com este código');

    const id = randomUUID();
    const now = new Date();
    await this.knex('billing_plans').insert({
      id,
      organization_id: organizationId,
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      amount: dto.amount,
      currency: dto.currency ?? 'BRL',
      billing_cycle: dto.billingCycle ?? 'monthly',
      trial_days: dto.trialDays ?? 0,
      product_id: dto.productId ?? null,
      default_tax_rate_id: dto.defaultTaxRateId ?? null,
      is_active: dto.isActive ?? true,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
    return this.getById(id, user);
  }

  async update(id: string, dto: UpdatePlanDto, user: AuthUserPayload): Promise<PlanRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const existing = await this.knex<PlanRow>('billing_plans')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Plano não encontrado');

    if (dto.code && dto.code !== existing.code) {
      const dup = await this.knex('billing_plans')
        .where({ organization_id: organizationId, code: dto.code })
        .whereNot({ id })
        .first();
      if (dup) throw new ConflictException('Código já em uso');
    }

    await this.knex('billing_plans')
      .where({ id })
      .update({
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.billingCycle !== undefined && { billing_cycle: dto.billingCycle }),
        ...(dto.trialDays !== undefined && { trial_days: dto.trialDays }),
        ...(dto.productId !== undefined && { product_id: dto.productId ?? null }),
        ...(dto.defaultTaxRateId !== undefined && { default_tax_rate_id: dto.defaultTaxRateId ?? null }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        updated_at: new Date(),
      });
    return this.getById(id, user);
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    // Soft-deactivate se já tem assinatura usando
    const inUse = await this.knex('billing_subscriptions')
      .where({ plan_id: id, organization_id: organizationId })
      .first();
    if (inUse) {
      await this.knex('billing_plans')
        .where({ id, organization_id: organizationId })
        .update({ is_active: false, updated_at: new Date() });
      return { success: true };
    }
    const deleted = await this.knex('billing_plans')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Plano não encontrado');
    return { success: true };
  }
}
