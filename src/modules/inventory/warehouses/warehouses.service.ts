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
import { CreateWarehouseDto, UpdateWarehouseDto, WarehouseType } from './dtos/warehouse.dto';

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
const READ_ROLES = [...ADMIN_ROLES, 'sales', 'sdr', 'employee', 'accountant'] as const;

export interface WarehouseRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  manager_user_id: string | null;
  is_default: boolean;
  is_active: boolean;
  warehouse_type: WarehouseType;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class WarehousesService {
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
      throw new ForbiddenException('Sem permissão para gerir armazéns');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar armazéns');
  }

  async list(user: AuthUserPayload, activeOnly = true): Promise<WarehouseRow[]> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    return this.knex<WarehouseRow>('stock_warehouses')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (activeOnly) q.andWhere({ is_active: true });
      })
      .orderBy([
        { column: 'is_default', order: 'desc' },
        { column: 'name', order: 'asc' },
      ]);
  }

  async getById(id: string, user: AuthUserPayload): Promise<WarehouseRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    const row = await this.knex<WarehouseRow>('stock_warehouses')
      .where({ id, organization_id: organizationId })
      .first();
    if (!row) throw new NotFoundException('Armazém não encontrado');
    return row;
  }

  async getDefault(user: AuthUserPayload): Promise<WarehouseRow | null> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    const row = await this.knex<WarehouseRow>('stock_warehouses')
      .where({ organization_id: organizationId, is_default: true, is_active: true })
      .first();
    return row ?? null;
  }

  async create(dto: CreateWarehouseDto, user: AuthUserPayload): Promise<WarehouseRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    const dup = await this.knex('stock_warehouses')
      .where({ organization_id: organizationId, code: dto.code })
      .first();
    if (dup) throw new ConflictException('Código de armazém já existe');

    return this.knex.transaction(async (trx) => {
      if (dto.isDefault) {
        await trx('stock_warehouses')
          .where({ organization_id: organizationId, is_default: true })
          .update({ is_default: false });
      }

      const id = randomUUID();
      const now = new Date();
      await trx('stock_warehouses').insert({
        id,
        organization_id: organizationId,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        address: dto.address ?? null,
        city: dto.city ?? null,
        country: dto.country ?? null,
        manager_user_id: dto.managerUserId ?? null,
        is_default: dto.isDefault ?? false,
        is_active: dto.isActive ?? true,
        warehouse_type: dto.warehouseType ?? 'physical',
        created_at: now,
        updated_at: now,
      });
      return (await trx<WarehouseRow>('stock_warehouses').where({ id }).first()) as WarehouseRow;
    });
  }

  async update(id: string, dto: UpdateWarehouseDto, user: AuthUserPayload): Promise<WarehouseRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    return this.knex.transaction(async (trx) => {
      const existing = await trx<WarehouseRow>('stock_warehouses')
        .where({ id, organization_id: organizationId })
        .first();
      if (!existing) throw new NotFoundException('Armazém não encontrado');

      if (dto.isDefault) {
        await trx('stock_warehouses')
          .where({ organization_id: organizationId, is_default: true })
          .whereNot({ id })
          .update({ is_default: false });
      }

      await trx('stock_warehouses').where({ id }).update({
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.address !== undefined && { address: dto.address ?? null }),
        ...(dto.city !== undefined && { city: dto.city ?? null }),
        ...(dto.country !== undefined && { country: dto.country ?? null }),
        ...(dto.managerUserId !== undefined && { manager_user_id: dto.managerUserId ?? null }),
        ...(dto.isDefault !== undefined && { is_default: dto.isDefault }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        ...(dto.warehouseType !== undefined && { warehouse_type: dto.warehouseType }),
        updated_at: new Date(),
      });
      return (await trx<WarehouseRow>('stock_warehouses').where({ id }).first()) as WarehouseRow;
    });
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    // Não permite excluir se há balanço (soft-deactivate)
    const hasBalance = await this.knex('stock_warehouse_balances')
      .where({ warehouse_id: id, organization_id: organizationId })
      .where('quantity', '>', 0)
      .first();
    if (hasBalance) {
      await this.knex('stock_warehouses').where({ id }).update({ is_active: false });
      return { success: true };
    }

    const deleted = await this.knex('stock_warehouses')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Armazém não encontrado');
    return { success: true };
  }
}
