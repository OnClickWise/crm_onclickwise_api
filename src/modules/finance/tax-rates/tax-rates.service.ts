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
import { CreateTaxRateDto, TaxType } from './dtos/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dtos/update-tax-rate.dto';

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

const WRITE_ROLES = ['master', 'admin', 'accountant'] as const;
const READ_ROLES = ['master', 'admin', 'accountant', 'financial_operator', 'sales', 'procurement'] as const;

export interface TaxRateRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  tax_type: TaxType;
  rate: string | number;
  country: string | null;
  account_id: string | null;
  is_default: boolean;
  is_active: boolean;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class TaxRatesService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuário sem organização vinculada');
    }
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }

  private ensureWriteRole(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para gerenciar impostos');
    }
  }

  private ensureReadRole(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para consultar impostos');
    }
  }

  /**
   * Garante que conta contábil pertença à organização e seja analítica/ativa.
   */
  private async validateAccount(
    trx: Knex.Transaction | Knex,
    organizationId: string,
    accountId: string,
  ) {
    const account = await trx('accounting_chart_accounts')
      .where({ id: accountId, organization_id: organizationId })
      .first();
    if (!account) throw new BadRequestException('Conta contábil não encontrada');
    if (!account.is_active) throw new BadRequestException(`Conta ${account.code} está inativa`);
    if (!account.allows_posting) {
      throw new BadRequestException(`Conta ${account.code} não aceita lançamentos`);
    }
  }

  async create(dto: CreateTaxRateDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const dup = await trx('tax_rates')
        .where({ organization_id: organizationId, code: dto.code })
        .first();
      if (dup) throw new BadRequestException(`Já existe imposto com código "${dto.code}"`);

      if (dto.accountId) {
        await this.validateAccount(trx, organizationId, dto.accountId);
      }

      // Se marcado como default e do mesmo tipo, desmarca outros defaults daquele tipo.
      if (dto.isDefault) {
        await trx('tax_rates')
          .where({ organization_id: organizationId, tax_type: dto.taxType, is_default: true })
          .update({ is_default: false, updated_by: userId, updated_at: new Date() });
      }

      const id = randomUUID();
      const now = new Date();
      await trx('tax_rates').insert({
        id,
        organization_id: organizationId,
        code: dto.code,
        name: dto.name,
        tax_type: dto.taxType,
        rate: Number(dto.rate).toFixed(3),
        country: dto.country?.toUpperCase() ?? null,
        account_id: dto.accountId ?? null,
        is_default: dto.isDefault ?? false,
        is_active: dto.isActive ?? true,
        description: dto.description ?? null,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      });
      return trx<TaxRateRow>('tax_rates').where({ id }).first();
    });
  }

  async list(
    user: AuthUserPayload,
    filters?: { isActive?: boolean; taxType?: string; country?: string },
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const query = this.knex<TaxRateRow>('tax_rates')
      .where({ organization_id: organizationId })
      .orderBy([
        { column: 'is_active', order: 'desc' },
        { column: 'tax_type', order: 'asc' },
        { column: 'rate', order: 'desc' },
      ]);

    if (typeof filters?.isActive === 'boolean') query.andWhere({ is_active: filters.isActive });
    if (filters?.taxType) query.andWhere({ tax_type: filters.taxType });
    if (filters?.country) query.andWhere({ country: filters.country.toUpperCase() });
    return query;
  }

  async getById(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const tax = await this.knex<TaxRateRow>('tax_rates')
      .where({ id, organization_id: organizationId })
      .first();
    if (!tax) throw new NotFoundException('Imposto não encontrado');
    return tax;
  }

  async update(id: string, dto: UpdateTaxRateDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const current = await trx<TaxRateRow>('tax_rates')
        .where({ id, organization_id: organizationId })
        .first();
      if (!current) throw new NotFoundException('Imposto não encontrado');

      if (dto.code && dto.code !== current.code) {
        const dup = await trx('tax_rates')
          .where({ organization_id: organizationId, code: dto.code })
          .whereNot({ id })
          .first();
        if (dup) throw new BadRequestException(`Já existe imposto com código "${dto.code}"`);
      }

      if (dto.accountId) {
        await this.validateAccount(trx, organizationId, dto.accountId);
      }

      const newType = dto.taxType ?? current.tax_type;
      // Se virou default neste tipo, desmarca outros defaults deste tipo.
      if (dto.isDefault) {
        await trx('tax_rates')
          .where({ organization_id: organizationId, tax_type: newType, is_default: true })
          .whereNot({ id })
          .update({ is_default: false, updated_by: userId, updated_at: new Date() });
      }

      await trx('tax_rates')
        .where({ id, organization_id: organizationId })
        .update({
          ...(dto.code !== undefined && { code: dto.code }),
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.taxType !== undefined && { tax_type: dto.taxType }),
          ...(dto.rate !== undefined && { rate: Number(dto.rate).toFixed(3) }),
          ...(dto.country !== undefined && { country: dto.country?.toUpperCase() ?? null }),
          ...(dto.accountId !== undefined && { account_id: dto.accountId ?? null }),
          ...(dto.isDefault !== undefined && { is_default: dto.isDefault }),
          ...(dto.isActive !== undefined && { is_active: dto.isActive }),
          ...(dto.description !== undefined && { description: dto.description ?? null }),
          updated_by: userId,
          updated_at: new Date(),
        });

      return trx<TaxRateRow>('tax_rates').where({ id }).first();
    });
  }

  async remove(id: string, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const tax = await trx<TaxRateRow>('tax_rates')
        .where({ id, organization_id: organizationId })
        .first();
      if (!tax) throw new NotFoundException('Imposto não encontrado');

      const inUse = await trx('accounting_journal_entry_lines')
        .where({ organization_id: organizationId, tax_rate_id: id })
        .first();
      if (inUse) {
        await trx('tax_rates')
          .where({ id, organization_id: organizationId })
          .update({ is_active: false, updated_by: userId, updated_at: new Date() });
        return { success: true, action: 'inactivated' as const };
      }

      await trx('tax_rates').where({ id, organization_id: organizationId }).delete();
      return { success: true, action: 'deleted' as const };
    });
  }
}
