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
import { CreateCustomerDto } from './dtos/create-customer.dto';
import { UpdateCustomerDto } from './dtos/update-customer.dto';

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

const WRITE_ROLES = ['master', 'admin', 'accountant', 'financial_operator', 'sales'] as const;
const READ_ROLES = [...WRITE_ROLES] as const;

export interface CustomerRow {
  id: string;
  organization_id: string;
  code: string | null;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  tax_id_type: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  default_currency: string | null;
  payment_terms_days: number;
  credit_limit: string | null;
  withholding_config: Record<string, unknown> | null;
  is_active: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class CustomersService {
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
      throw new ForbiddenException('Sem permissão para gerenciar clientes');
    }
  }

  private ensureReadRole(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para consultar clientes');
    }
  }

  private dtoToRow(dto: CreateCustomerDto | UpdateCustomerDto): Partial<CustomerRow> {
    return {
      ...(dto.code !== undefined && { code: dto.code || null }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.legalName !== undefined && { legal_name: dto.legalName || null }),
      ...(dto.taxId !== undefined && { tax_id: dto.taxId || null }),
      ...(dto.taxIdType !== undefined && { tax_id_type: dto.taxIdType || null }),
      ...(dto.email !== undefined && { email: dto.email || null }),
      ...(dto.phone !== undefined && { phone: dto.phone || null }),
      ...(dto.mobile !== undefined && { mobile: dto.mobile || null }),
      ...(dto.website !== undefined && { website: dto.website || null }),
      ...(dto.addressLine1 !== undefined && { address_line1: dto.addressLine1 || null }),
      ...(dto.addressLine2 !== undefined && { address_line2: dto.addressLine2 || null }),
      ...(dto.city !== undefined && { city: dto.city || null }),
      ...(dto.state !== undefined && { state: dto.state || null }),
      ...(dto.postalCode !== undefined && { postal_code: dto.postalCode || null }),
      ...(dto.country !== undefined && { country: dto.country?.toUpperCase() || null }),
      ...(dto.defaultCurrency !== undefined && {
        default_currency: dto.defaultCurrency?.toUpperCase() || null,
      }),
      ...(dto.paymentTermsDays !== undefined && { payment_terms_days: dto.paymentTermsDays }),
      ...(dto.creditLimit !== undefined && {
        credit_limit: dto.creditLimit !== null && dto.creditLimit !== undefined
          ? dto.creditLimit.toFixed(2)
          : null,
      }),
      ...(dto.withholdingConfig !== undefined && { withholding_config: dto.withholdingConfig ?? null }),
      ...(dto.isActive !== undefined && { is_active: dto.isActive }),
      ...(dto.notes !== undefined && { notes: dto.notes || null }),
    };
  }

  async create(dto: CreateCustomerDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      // Validações de unicidade — mensagens amigáveis em vez de erro 500 do Postgres.
      if (dto.code) {
        const dup = await trx('customers')
          .where({ organization_id: organizationId, code: dto.code })
          .first();
        if (dup) throw new BadRequestException(`Já existe cliente com código "${dto.code}"`);
      }
      if (dto.taxId) {
        const dup = await trx('customers')
          .where({ organization_id: organizationId, tax_id: dto.taxId })
          .first();
        if (dup) throw new BadRequestException(`Já existe cliente com identificação fiscal "${dto.taxId}"`);
      }

      const id = randomUUID();
      const now = new Date();
      await trx('customers').insert({
        id,
        organization_id: organizationId,
        ...this.dtoToRow(dto),
        is_active: dto.isActive ?? true,
        payment_terms_days: dto.paymentTermsDays ?? 0,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      });
      return trx<CustomerRow>('customers').where({ id }).first();
    });
  }

  async list(
    user: AuthUserPayload,
    filters?: { isActive?: boolean; query?: string; country?: string; limit?: number },
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const limit = Math.max(1, Math.min(filters?.limit ?? 100, 500));

    const query = this.knex<CustomerRow>('customers')
      .where({ organization_id: organizationId })
      .orderBy([
        { column: 'is_active', order: 'desc' },
        { column: 'name', order: 'asc' },
      ])
      .limit(limit);

    if (typeof filters?.isActive === 'boolean') query.andWhere({ is_active: filters.isActive });
    if (filters?.country) query.andWhere({ country: filters.country.toUpperCase() });
    if (filters?.query?.trim()) {
      const q = `%${filters.query.trim()}%`;
      query.andWhere((qb) =>
        qb
          .whereILike('name', q)
          .orWhereILike('legal_name', q)
          .orWhereILike('tax_id', q)
          .orWhereILike('email', q)
          .orWhereILike('code', q),
      );
    }
    return query;
  }

  async getById(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const customer = await this.knex<CustomerRow>('customers')
      .where({ id, organization_id: organizationId })
      .first();
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const current = await trx<CustomerRow>('customers')
        .where({ id, organization_id: organizationId })
        .first();
      if (!current) throw new NotFoundException('Cliente não encontrado');

      if (dto.code && dto.code !== current.code) {
        const dup = await trx('customers')
          .where({ organization_id: organizationId, code: dto.code })
          .whereNot({ id })
          .first();
        if (dup) throw new BadRequestException(`Já existe cliente com código "${dto.code}"`);
      }
      if (dto.taxId && dto.taxId !== current.tax_id) {
        const dup = await trx('customers')
          .where({ organization_id: organizationId, tax_id: dto.taxId })
          .whereNot({ id })
          .first();
        if (dup) throw new BadRequestException(`Já existe cliente com identificação fiscal "${dto.taxId}"`);
      }

      await trx('customers')
        .where({ id, organization_id: organizationId })
        .update({
          ...this.dtoToRow(dto),
          updated_by: userId,
          updated_at: new Date(),
        });
      return trx<CustomerRow>('customers').where({ id }).first();
    });
  }

  async remove(id: string, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const customer = await trx<CustomerRow>('customers')
        .where({ id, organization_id: organizationId })
        .first();
      if (!customer) throw new NotFoundException('Cliente não encontrado');

      // Se há recebíveis vinculados, inativa em vez de excluir.
      const hasReceivables = await trx('accounts_receivable')
        .where({ organization_id: organizationId, customer_id: id })
        .first();
      if (hasReceivables) {
        await trx('customers')
          .where({ id, organization_id: organizationId })
          .update({ is_active: false, updated_by: userId, updated_at: new Date() });
        return { success: true, action: 'inactivated' as const };
      }

      await trx('customers').where({ id, organization_id: organizationId }).delete();
      return { success: true, action: 'deleted' as const };
    });
  }
}
