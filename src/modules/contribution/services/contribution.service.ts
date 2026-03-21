import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class ContributionService {
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

    return {
      organizationId: user.organizationId,
      userId: user.userId,
    };
  }

  private async ensurePortfolioAccess(portfolioId: string, organizationId: string, userId: string, user: any) {
    const query = this.knex('portfolios')
      .where({ id: portfolioId, organization_id: organizationId });

    this.applyPortfolioVisibility(query, user, userId, 'user_id');

    const portfolio = await query.first();

    if (!portfolio) {
      throw new NotFoundException('Carteira não encontrada');
    }

    return portfolio;
  }

  async createContribution(data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);
    await this.ensurePortfolioAccess(data.portfolioId, organizationId, userId, user);

    const [contribution] = await this.knex('contributions')
      .insert({
        id: randomUUID(),
        portfolio_id: data.portfolioId,
        investment_id: data.investmentId ?? null,
        type: data.type ?? 'aporte',
        value: Number(data.value ?? 0),
        quantity: data.quantity !== undefined ? Number(data.quantity) : null,
        price: data.price !== undefined ? Number(data.price) : null,
        date: data.date ? new Date(data.date) : new Date(),
        note: data.note ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    return contribution;
  }

  async listContributions(portfolioId: string | undefined, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('contributions as c')
      .join('portfolios as p', 'p.id', 'c.portfolio_id')
      .leftJoin('investments as i', 'i.id', 'c.investment_id')
      .where('p.organization_id', organizationId)
      .select('c.*', 'p.name as portfolio_name', 'i.asset_name')
      .orderBy('c.date', 'desc');

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');

    if (portfolioId) {
      query.andWhere('c.portfolio_id', portfolioId);
    }

    return query;
  }

  async updateContribution(id: string, data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('contributions as c')
      .join('portfolios as p', 'p.id', 'c.portfolio_id')
      .where('c.id', id)
      .andWhere('p.organization_id', organizationId)
      .select('c.*')
      ;

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');
    const existing = await query.first();

    if (!existing) {
      throw new NotFoundException('Aporte não encontrado');
    }

    if (data.portfolioId !== undefined) {
      await this.ensurePortfolioAccess(data.portfolioId, organizationId, userId, user);
    }

    const payload: any = {
      updated_at: new Date(),
    };

    if (data.portfolioId !== undefined) payload.portfolio_id = data.portfolioId;
    if (data.investmentId !== undefined) payload.investment_id = data.investmentId;
    if (data.type !== undefined) payload.type = data.type;
    if (data.value !== undefined) payload.value = Number(data.value);
    if (data.quantity !== undefined) payload.quantity = Number(data.quantity);
    if (data.price !== undefined) payload.price = Number(data.price);
    if (data.date !== undefined) payload.date = new Date(data.date);
    if (data.note !== undefined) payload.note = data.note;

    const [contribution] = await this.knex('contributions')
      .where({ id })
      .update(payload)
      .returning('*');

    return contribution;
  }

  async deleteContribution(id: string, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('contributions as c')
      .join('portfolios as p', 'p.id', 'c.portfolio_id')
      .where('c.id', id)
      .andWhere('p.organization_id', organizationId)
      ;

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');
    const deleted = await query.delete('c');

    if (!deleted) {
      throw new NotFoundException('Aporte não encontrado');
    }

    return { success: true };
  }
}