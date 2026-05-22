import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { CreateCostCenterDto, UpdateCostCenterDto } from './dtos/cost-center.dto';

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

const WRITE_ROLES = ['master', 'admin', 'manager', 'accountant'] as const;
const READ_ROLES = [...WRITE_ROLES, 'sales', 'sdr', 'employee'] as const;

export interface CostCenterRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  manager_user_id: string | null;
  monthly_budget: string | number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class CostCentersService {
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
      throw new ForbiddenException('Sem permissão para gerir centros de custo');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar centros de custo');
  }

  async list(user: AuthUserPayload, activeOnly = false): Promise<CostCenterRow[]> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    return this.knex<CostCenterRow>('cost_centers')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (activeOnly) q.andWhere({ is_active: true });
      })
      .orderBy('code', 'asc');
  }

  async getById(id: string, user: AuthUserPayload): Promise<CostCenterRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    const row = await this.knex<CostCenterRow>('cost_centers')
      .where({ id, organization_id: organizationId })
      .first();
    if (!row) throw new NotFoundException('Centro de custo não encontrado');
    return row;
  }

  async create(dto: CreateCostCenterDto, user: AuthUserPayload): Promise<CostCenterRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    const dup = await this.knex('cost_centers')
      .where({ organization_id: organizationId, code: dto.code })
      .first();
    if (dup) throw new ConflictException('Já existe um centro de custo com este código');

    if (dto.parentId) await this.assertSameOrg(dto.parentId, organizationId);

    const id = randomUUID();
    const now = new Date();
    await this.knex('cost_centers').insert({
      id,
      organization_id: organizationId,
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      parent_id: dto.parentId ?? null,
      manager_user_id: dto.managerUserId ?? null,
      monthly_budget: dto.monthlyBudget ?? null,
      is_active: dto.isActive ?? true,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
    return this.getById(id, user);
  }

  async update(
    id: string,
    dto: UpdateCostCenterDto,
    user: AuthUserPayload,
  ): Promise<CostCenterRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    const existing = await this.knex<CostCenterRow>('cost_centers')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Centro de custo não encontrado');

    if (dto.code && dto.code !== existing.code) {
      const dup = await this.knex('cost_centers')
        .where({ organization_id: organizationId, code: dto.code })
        .whereNot({ id })
        .first();
      if (dup) throw new ConflictException('Código já em uso');
    }
    if (dto.parentId) {
      if (dto.parentId === id)
        throw new BadRequestException('Centro de custo não pode ser pai de si mesmo');
      await this.assertSameOrg(dto.parentId, organizationId);
    }

    await this.knex('cost_centers')
      .where({ id })
      .update({
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.parentId !== undefined && { parent_id: dto.parentId ?? null }),
        ...(dto.managerUserId !== undefined && { manager_user_id: dto.managerUserId ?? null }),
        ...(dto.monthlyBudget !== undefined && { monthly_budget: dto.monthlyBudget ?? null }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        updated_at: new Date(),
      });
    return this.getById(id, user);
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    // Em uso em lançamentos? → soft-deactivate
    const inUse = await this.knex('accounting_journal_entry_lines')
      .where({ cost_center_id: id })
      .first();
    if (inUse) {
      await this.knex('cost_centers')
        .where({ id, organization_id: organizationId })
        .update({ is_active: false, updated_at: new Date() });
      return { success: true };
    }
    const deleted = await this.knex('cost_centers')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Centro de custo não encontrado');
    return { success: true };
  }

  private async assertSameOrg(costCenterId: string, organizationId: string) {
    const cc = await this.knex('cost_centers')
      .where({ id: costCenterId, organization_id: organizationId })
      .first();
    if (!cc) throw new BadRequestException('Centro de custo pai inválido');
  }
}
