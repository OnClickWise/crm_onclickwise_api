import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { CreateChartAccountDto } from './dtos/create-chart-account.dto';
import { UpdateChartAccountDto } from './dtos/update-chart-account.dto';

@Injectable()
export class ChartOfAccountsService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: any): { organizationId: string; userId: string; role: string } {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuario sem organizacao vinculada');
    }

    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user?.role || '').toLowerCase(),
    };
  }

  private ensureRole(role: string) {
    if (!['master', 'admin', 'accountant', 'financial_operator'].includes(role)) {
      throw new ForbiddenException('Usuario sem permissao para gerenciar plano de contas');
    }
  }

  private async ensureUniqueCode(organizationId: string, code: string, excludeId?: string) {
    const existing = await this.knex('accounting_chart_accounts')
      .where({ organization_id: organizationId, code })
      .modify((query) => {
        if (excludeId) {
          query.whereNot({ id: excludeId });
        }
      })
      .first();

    if (existing) {
      throw new BadRequestException(`Ja existe uma conta contabil com o codigo ${code}`);
    }
  }

  private async resolveParentLevel(organizationId: string, parentId?: string | null) {
    if (!parentId) {
      return 1;
    }

    const parent = await this.knex('accounting_chart_accounts')
      .where({ id: parentId, organization_id: organizationId })
      .first();

    if (!parent) {
      throw new NotFoundException('Conta contabil pai nao encontrada');
    }

    if (!parent.is_active) {
      throw new BadRequestException('Conta contabil pai esta inativa');
    }

    return Number(parent.level || 1) + 1;
  }

  async create(dto: CreateChartAccountDto, user: any) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    return this.knex.transaction(async (trx) => {
      await this.ensureUniqueCode(organizationId, dto.code);
      const level = await this.resolveParentLevel(organizationId, dto.parentId ?? null);

      const now = new Date();
      const id = randomUUID();

      await trx('accounting_chart_accounts').insert({
        id,
        organization_id: organizationId,
        code: dto.code,
        name: dto.name,
        account_type: dto.accountType,
        normal_balance: dto.normalBalance,
        parent_id: dto.parentId ?? null,
        level,
        is_active: dto.isActive ?? true,
        allows_posting: dto.allowsPosting ?? true,
        description: dto.description ?? null,
        created_by: userId,
        updated_by: userId,
        reference_type: dto.referenceType ?? null,
        reference_id: dto.referenceId ?? null,
        created_at: now,
        updated_at: now,
      });

      return trx('accounting_chart_accounts').where({ id }).first();
    });
  }

  async list(user: any, filters?: { accountType?: string; isActive?: boolean; query?: string; limit?: number }) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);

    const query = this.knex('accounting_chart_accounts').where({ organization_id: organizationId });

    if (filters?.accountType) {
      query.andWhere({ account_type: filters.accountType });
    }

    if (typeof filters?.isActive === 'boolean') {
      query.andWhere({ is_active: filters.isActive });
    }

    if (filters?.query) {
      query.andWhere((builder) => {
        builder.whereILike('code', `%${filters.query}%`).orWhereILike('name', `%${filters.query}%`);
      });
    }

    return query.orderBy([{ column: 'level', order: 'asc' }, { column: 'code', order: 'asc' }]).limit(Math.max(1, Math.min(filters?.limit ?? 100, 200)));
  }

  async getById(id: string, user: any) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);

    const account = await this.knex('accounting_chart_accounts').where({ id, organization_id: organizationId }).first();

    if (!account) {
      throw new NotFoundException('Conta contabil nao encontrada');
    }

    return account;
  }

  async update(id: string, dto: UpdateChartAccountDto, user: any) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    return this.knex.transaction(async (trx) => {
      const account = await trx('accounting_chart_accounts').where({ id, organization_id: organizationId }).first();

      if (!account) {
        throw new NotFoundException('Conta contabil nao encontrada');
      }

      if (dto.code && dto.code !== account.code) {
        await this.ensureUniqueCode(organizationId, dto.code, id);
      }

      let level = account.level;
      if (dto.parentId !== undefined) {
        level = await this.resolveParentLevel(organizationId, dto.parentId ?? null);
      }

      await trx('accounting_chart_accounts')
        .where({ id, organization_id: organizationId })
        .update({
          code: dto.code ?? account.code,
          name: dto.name ?? account.name,
          account_type: dto.accountType ?? account.account_type,
          normal_balance: dto.normalBalance ?? account.normal_balance,
          parent_id: dto.parentId === undefined ? account.parent_id : dto.parentId,
          level,
          is_active: dto.isActive ?? account.is_active,
          allows_posting: dto.allowsPosting ?? account.allows_posting,
          description: dto.description === undefined ? account.description : dto.description,
          updated_by: userId,
          reference_type: dto.referenceType === undefined ? account.reference_type : dto.referenceType,
          reference_id: dto.referenceId === undefined ? account.reference_id : dto.referenceId,
          updated_at: new Date(),
        });

      return trx('accounting_chart_accounts').where({ id, organization_id: organizationId }).first();
    });
  }

  async remove(id: string, user: any) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    return this.knex.transaction(async (trx) => {
      const account = await trx('accounting_chart_accounts').where({ id, organization_id: organizationId }).first();

      if (!account) {
        throw new NotFoundException('Conta contabil nao encontrada');
      }

      const child = await trx('accounting_chart_accounts')
        .where({ organization_id: organizationId, parent_id: id })
        .first();

      if (child) {
        throw new BadRequestException('Nao e possivel inativar uma conta com subcontas vinculadas');
      }

      const usage = await trx('accounting_journal_entry_lines').where({ organization_id: organizationId, account_id: id }).first();

      if (usage) {
        await trx('accounting_chart_accounts')
          .where({ id, organization_id: organizationId })
          .update({ is_active: false, updated_by: userId, updated_at: new Date() });

        return { success: true, action: 'inactivated' };
      }

      await trx('accounting_chart_accounts').where({ id, organization_id: organizationId }).delete();
      return { success: true, action: 'deleted' };
    });
  }
}