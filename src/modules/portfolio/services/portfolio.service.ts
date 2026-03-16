import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class PortfolioService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: any): { organizationId: string; userId: string } {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuário sem organização vinculada');
    }

    return {
      organizationId: user.organizationId,
      userId: user.userId,
    };
  }

  async createPortfolio(data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const [portfolio] = await this.knex('portfolios')
      .insert({
        id: randomUUID(),
        organization_id: organizationId,
        user_id: userId,
        investor_id: data.investorId ?? null,
        name: data.name,
        description: data.description || null,
        initial_amount: data.initialAmount ?? 0,
        is_active: data.isActive ?? true,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    return portfolio;
  }

  async listPortfolios(investorId: string | undefined, user: any) {
    const { organizationId, userId } = this.getScope(user);
    const investmentsSumSubquery = this.knex('investments')
      .select('portfolio_id')
      .sum({ invested_total: 'total_invested' })
      .sum({ current_assets_total: 'current_value' })
      .sum({ profit_total: 'profit' })
      .groupBy('portfolio_id')
      .as('inv_sum');

    const query = this.knex('portfolios as p')
      .leftJoin('users as u', 'u.id', 'p.user_id')
      .leftJoin('investors as i', 'i.id', 'p.investor_id')
      .leftJoin(investmentsSumSubquery, 'inv_sum.portfolio_id', 'p.id')
      .where('p.organization_id', organizationId)
      .andWhere((builder) => {
        builder.where('p.user_id', userId).orWhereNull('p.user_id');
      })
      .select(
        'p.*',
        'u.name as owner_name',
        'u.email as owner_email',
        'i.name as investor_name',
        this.knex.raw('COALESCE(inv_sum.invested_total, 0) as invested_total'),
        this.knex.raw('COALESCE(inv_sum.current_assets_total, 0) as current_assets_total'),
        this.knex.raw('COALESCE(inv_sum.profit_total, 0) as profit_total'),
        this.knex.raw('COALESCE(p.initial_amount, 0) + COALESCE(inv_sum.current_assets_total, 0) as current_total'),
      )
      .orderBy('p.created_at', 'desc');

    if (investorId) {
      query.andWhere('p.investor_id', investorId);
    }

    return query;
  }

  async getPortfolioById(id: string, user: any) {
    const { organizationId, userId } = this.getScope(user);
    const investmentsSumSubquery = this.knex('investments')
      .select('portfolio_id')
      .sum({ invested_total: 'total_invested' })
      .sum({ current_assets_total: 'current_value' })
      .sum({ profit_total: 'profit' })
      .groupBy('portfolio_id')
      .as('inv_sum');

    const portfolio = await this.knex('portfolios as p')
      .leftJoin('users as u', 'u.id', 'p.user_id')
      .leftJoin('investors as i', 'i.id', 'p.investor_id')
      .leftJoin(investmentsSumSubquery, 'inv_sum.portfolio_id', 'p.id')
      .where('p.id', id)
      .andWhere('p.organization_id', organizationId)
      .andWhere((builder) => {
        builder.where('p.user_id', userId).orWhereNull('p.user_id');
      })
      .select(
        'p.*',
        'u.name as owner_name',
        'u.email as owner_email',
        'i.name as investor_name',
        this.knex.raw('COALESCE(inv_sum.invested_total, 0) as invested_total'),
        this.knex.raw('COALESCE(inv_sum.current_assets_total, 0) as current_assets_total'),
        this.knex.raw('COALESCE(inv_sum.profit_total, 0) as profit_total'),
        this.knex.raw('COALESCE(p.initial_amount, 0) + COALESCE(inv_sum.current_assets_total, 0) as current_total'),
      )
      .first();

    if (!portfolio) {
      throw new NotFoundException('Carteira não encontrada');
    }

    return portfolio;
  }

  async updatePortfolio(id: string, data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const payload: any = {
      updated_at: new Date(),
    };

    if (data.name !== undefined) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.initialAmount !== undefined) payload.initial_amount = data.initialAmount;
    if (data.isActive !== undefined) payload.is_active = data.isActive;

    const [portfolio] = await this.knex('portfolios')
      .where({ id, organization_id: organizationId })
      .andWhere((builder) => {
        builder.where('user_id', userId).orWhereNull('user_id');
      })
      .update(payload)
      .returning('*');

    if (!portfolio) {
      throw new NotFoundException('Carteira não encontrada');
    }

    return portfolio;
  }

  async deletePortfolio(id: string, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const deleted = await this.knex('portfolios')
      .where({ id, organization_id: organizationId })
      .andWhere((builder) => {
        builder.where('user_id', userId).orWhereNull('user_id');
      })
      .delete();

    if (!deleted) {
      throw new NotFoundException('Carteira não encontrada');
    }

    return { success: true };
  }
}
