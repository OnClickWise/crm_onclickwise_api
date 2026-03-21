import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class DividendService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private hasOrganizationWideAccess(user: any): boolean {
    const role = String(user?.role || '').toLowerCase();
    return role === 'admin' || role === 'master';
  }

  private applyPortfolioVisibility(query: Knex.QueryBuilder, user: any, userId: string, userColumn: string) {
    if (!this.hasOrganizationWideAccess(user)) {
      query.andWhere(userColumn, userId);
    }
    return query;
  }

  private getScope(user: any): { organizationId: string; userId: string } {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuário sem organização vinculada');
    }

    return { organizationId: user.organizationId, userId: user.userId };
  }

  private async ensureInvestmentAccess(investmentId: string, organizationId: string, userId: string, user: any) {
    const query = this.knex('investments as inv')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('inv.id', investmentId)
      .andWhere('p.organization_id', organizationId)
      .select('inv.id')
      ;

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');

    const investment = await query.first();

    if (!investment) {
      throw new NotFoundException('Ativo não encontrado');
    }
  }

  async createDividend(data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);
    await this.ensureInvestmentAccess(data.investmentId, organizationId, userId, user);

    const [dividend] = await this.knex('dividends')
      .insert({
        id: randomUUID(),
        investment_id: data.investmentId,
        value: Number(data.value ?? 0),
        date: data.date ? new Date(data.date) : new Date(),
        type: data.type ?? 'dividendo',
        notes: data.notes ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    return dividend;
  }

  async listDividends(user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('dividends as d')
      .join('investments as inv', 'inv.id', 'd.investment_id')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('p.organization_id', organizationId)
      .select('d.*', 'inv.asset_name', 'p.name as portfolio_name')
      .orderBy('d.date', 'desc');

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');

    return query;
  }

  async deleteDividend(id: string, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('dividends as d')
      .join('investments as inv', 'inv.id', 'd.investment_id')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('d.id', id)
      .andWhere('p.organization_id', organizationId)
      .select('d.id')
      ;

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');

    const existing = await query.first();

    if (!existing) {
      throw new NotFoundException('Dividendo não encontrado');
    }

    await this.knex('dividends').where({ id: existing.id }).delete();
    return { success: true };
  }

  async updateDividend(id: string, data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('dividends as d')
      .join('investments as inv', 'inv.id', 'd.investment_id')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('d.id', id)
      .andWhere('p.organization_id', organizationId)
      .select('d.id')
      ;

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');

    const existing = await query.first();

    if (!existing) {
      throw new NotFoundException('Dividendo não encontrado');
    }

    const payload: Record<string, unknown> = { updated_at: new Date() };
    if (data.value !== undefined) payload.value = Number(data.value);
    if (data.date !== undefined) payload.date = new Date(data.date);
    if (data.type !== undefined) payload.type = data.type;
    if (data.notes !== undefined) payload.notes = data.notes;

    const [dividend] = await this.knex('dividends')
      .where({ id: existing.id })
      .update(payload)
      .returning('*');

    return dividend;
  }
}