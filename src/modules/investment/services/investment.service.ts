import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

type BrapiQuoteResponse = {
  results?: Array<{
    symbol?: string;
    regularMarketPrice?: number;
  }>;
};

type BrapiCryptoResponse = {
  coins?: Array<{
    coin?: string;
    regularMarketPrice?: number;
  }>;
};

@Injectable()
export class InvestmentService {
  constructor(@Inject('knex') private readonly knex: Knex) {}
  private readonly brapiToken = process.env.BRAPI_TOKEN || 'nqCTAyoKAbHLUAgPQzcyWn';

  private hasOrganizationWideAccess(user: any): boolean {
    const role = String(user?.role || '').toLowerCase();
    return role === 'admin' || role === 'master';
  }

  private applyPortfolioVisibility(query: Knex.QueryBuilder, user: any, userId: string, userColumn = 'p.user_id') {
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

  private calculateMetrics(input: {
    quantity?: number;
    averagePrice?: number;
    currentPrice?: number;
    totalInvested?: number;
  }) {
    const quantity = Number(input.quantity ?? 0);
    const averagePrice = Number(input.averagePrice ?? 0);
    const currentPrice = Number(input.currentPrice ?? averagePrice);
    const totalInvested = input.totalInvested !== undefined
      ? Number(input.totalInvested)
      : quantity * averagePrice;
    const currentValue = quantity * currentPrice;
    const profit = currentValue - totalInvested;
    const profitPercentage = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;

    return {
      quantity,
      averagePrice,
      currentPrice,
      totalInvested,
      currentValue,
      profit,
      profitPercentage,
    };
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  private async fetchCurrentPrices(assets: Array<{ asset_name: string; asset_type: string }>) {
    const stockSymbols = Array.from(new Set(
      assets
        .filter((asset) => asset.asset_type !== 'cripto')
        .map((asset) => asset.asset_name?.trim().toUpperCase())
        .filter(Boolean),
    ));

    const cryptoSymbols = Array.from(new Set(
      assets
        .filter((asset) => asset.asset_type === 'cripto')
        .map((asset) => asset.asset_name?.trim().toUpperCase())
        .filter(Boolean),
    ));

    const prices = new Map<string, number>();

    if (stockSymbols.length > 0) {
      const stockData = await this.fetchJson<BrapiQuoteResponse>(`https://brapi.dev/api/quote/${stockSymbols.join(',')}?token=${this.brapiToken}`);
      for (const item of stockData?.results || []) {
        if (item.symbol && item.regularMarketPrice) {
          prices.set(item.symbol.toUpperCase(), Number(item.regularMarketPrice));
        }
      }
    }

    if (cryptoSymbols.length > 0) {
      const cryptoData = await this.fetchJson<BrapiCryptoResponse>(`https://brapi.dev/api/v2/crypto?coin=${cryptoSymbols.join(',')}&currency=BRL&token=${this.brapiToken}`);
      for (const item of cryptoData?.coins || []) {
        if (item.coin && item.regularMarketPrice) {
          prices.set(item.coin.toUpperCase(), Number(item.regularMarketPrice));
        }
      }
    }

    return prices;
  }

  private async ensurePortfolioBelongsToOrganization(portfolioId: string, organizationId: string, userId: string, user: any) {
    const portfolioQuery = this.knex('portfolios')
      .where({ id: portfolioId, organization_id: organizationId })
      ;

    this.applyPortfolioVisibility(portfolioQuery, user, userId, 'user_id');

    const portfolio = await portfolioQuery.first();

    if (!portfolio) {
      throw new NotFoundException('Carteira não encontrada');
    }

    return portfolio;
  }

  async createInvestment(data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);
    await this.ensurePortfolioBelongsToOrganization(data.portfolioId, organizationId, userId, user);

    const metrics = this.calculateMetrics({
      quantity: data.quantity,
      averagePrice: data.averagePrice,
      currentPrice: data.currentPrice,
      totalInvested: data.totalInvested,
    });

    const [investment] = await this.knex('investments')
      .insert({
        id: randomUUID(),
        portfolio_id: data.portfolioId,
        asset_name: data.assetName,
        asset_type: data.assetType,
        category: data.category ?? null,
        broker: data.broker ?? null,
        quantity: metrics.quantity,
        average_price: metrics.averagePrice,
        current_price: metrics.currentPrice,
        total_invested: metrics.totalInvested,
        current_value: metrics.currentValue,
        profit: metrics.profit,
        profit_percentage: metrics.profitPercentage,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    return investment;
  }

  async listInvestments(portfolioId: string | undefined, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('investments as inv')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('p.organization_id', organizationId)
      .select('inv.*', 'p.name as portfolio_name')
      .orderBy('inv.created_at', 'desc');

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');

    if (portfolioId) {
      query.andWhere('inv.portfolio_id', portfolioId);
    }

    return query;
  }

  async getInvestmentById(id: string, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('investments as inv')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('inv.id', id)
      .andWhere('p.organization_id', organizationId)
      .select('inv.*', 'p.name as portfolio_name')
      ;

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');
    const investment = await query.first();

    if (!investment) {
      throw new NotFoundException('Ativo não encontrado');
    }

    return investment;
  }

  async updateInvestment(id: string, data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('investments as inv')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('inv.id', id)
      .andWhere('p.organization_id', organizationId)
      .select('inv.*')
      ;

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');
    const existing = await query.first();

    if (!existing) {
      throw new NotFoundException('Ativo não encontrado');
    }

    if (data.portfolioId !== undefined) {
      await this.ensurePortfolioBelongsToOrganization(data.portfolioId, organizationId, userId, user);
    }

    const payload: any = {
      updated_at: new Date(),
    };

    if (data.portfolioId !== undefined) payload.portfolio_id = data.portfolioId;
    if (data.assetName !== undefined) payload.asset_name = data.assetName;
    if (data.assetType !== undefined) payload.asset_type = data.assetType;
    if (data.category !== undefined) payload.category = data.category;
    if (data.broker !== undefined) payload.broker = data.broker;

    const metrics = this.calculateMetrics({
      quantity: data.quantity !== undefined ? Number(data.quantity) : Number(existing.quantity),
      averagePrice: data.averagePrice !== undefined ? Number(data.averagePrice) : Number(existing.average_price),
      currentPrice: data.currentPrice !== undefined ? Number(data.currentPrice) : Number(existing.current_price ?? existing.average_price),
      totalInvested: data.totalInvested !== undefined ? Number(data.totalInvested) : undefined,
    });

    payload.quantity = metrics.quantity;
    payload.average_price = metrics.averagePrice;
    payload.current_price = metrics.currentPrice;
    payload.total_invested = metrics.totalInvested;
    payload.current_value = metrics.currentValue;
    payload.profit = metrics.profit;
    payload.profit_percentage = metrics.profitPercentage;

    const [investment] = await this.knex('investments')
      .where({ id: existing.id })
      .update(payload)
      .returning('*');

    return investment;
  }

  async deleteInvestment(id: string, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('investments as inv')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('inv.id', id)
      .andWhere('p.organization_id', organizationId)
      .select('inv.id')
      ;

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');
    const existing = await query.first();

    if (!existing) {
      throw new NotFoundException('Ativo não encontrado');
    }

    await this.knex('investments')
      .where({ id: existing.id })
      .delete();

    return { success: true };
  }

  async refreshPrices(user: any) {
    const { organizationId, userId } = this.getScope(user);

    const query = this.knex('investments as inv')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('p.organization_id', organizationId)
      .select('inv.id', 'inv.asset_name', 'inv.asset_type', 'inv.quantity', 'inv.average_price', 'inv.total_invested');

    this.applyPortfolioVisibility(query, user, userId, 'p.user_id');

    const investments = await query;

    if (investments.length === 0) {
      return { updated: 0 };
    }

    const prices = await this.fetchCurrentPrices(investments as Array<{ asset_name: string; asset_type: string }>);
    let updated = 0;

    for (const investment of investments) {
      const price = prices.get(String(investment.asset_name).toUpperCase());
      if (!price) continue;

      const metrics = this.calculateMetrics({
        quantity: Number(investment.quantity),
        averagePrice: Number(investment.average_price),
        currentPrice: price,
        totalInvested: Number(investment.total_invested),
      });

      await this.knex('investments')
        .where({ id: investment.id })
        .update({
          current_price: metrics.currentPrice,
          current_value: metrics.currentValue,
          profit: metrics.profit,
          profit_percentage: metrics.profitPercentage,
          updated_at: new Date(),
        });

      updated += 1;
    }

    return { updated };
  }

  async refreshAllPrices(): Promise<{ updated: number }> {
    const investments = await this.knex('investments').select(
      'id',
      'asset_name',
      'asset_type',
      'quantity',
      'average_price',
      'total_invested',
    );

    if (investments.length === 0) {
      return { updated: 0 };
    }

    const prices = await this.fetchCurrentPrices(
      investments as Array<{ asset_name: string; asset_type: string }>,
    );
    let updated = 0;

    for (const investment of investments) {
      const price = prices.get(String(investment.asset_name).toUpperCase());
      if (!price) continue;

      const metrics = this.calculateMetrics({
        quantity: Number(investment.quantity),
        averagePrice: Number(investment.average_price),
        currentPrice: price,
        totalInvested: Number(investment.total_invested),
      });

      await this.knex('investments').where({ id: investment.id }).update({
        current_price: metrics.currentPrice,
        current_value: metrics.currentValue,
        profit: metrics.profit,
        profit_percentage: metrics.profitPercentage,
        updated_at: new Date(),
      });

      updated += 1;
    }

    return { updated };
  }
}
