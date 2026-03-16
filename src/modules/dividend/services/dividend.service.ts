import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class DividendService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: any): { organizationId: string; userId: string } {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuário sem organização vinculada');
    }

    return { organizationId: user.organizationId, userId: user.userId };
  }

  private async ensureInvestmentAccess(investmentId: string, organizationId: string, userId: string) {
    const investment = await this.knex('investments as inv')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('inv.id', investmentId)
      .andWhere('p.organization_id', organizationId)
      .andWhere((builder) => {
        builder.where('p.user_id', userId).orWhereNull('p.user_id');
      })
      .select('inv.id')
      .first();

    if (!investment) {
      throw new NotFoundException('Ativo não encontrado');
    }
  }

  async createDividend(data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);
    await this.ensureInvestmentAccess(data.investmentId, organizationId, userId);

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

    return this.knex('dividends as d')
      .join('investments as inv', 'inv.id', 'd.investment_id')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('p.organization_id', organizationId)
      .andWhere((builder) => {
        builder.where('p.user_id', userId).orWhereNull('p.user_id');
      })
      .select('d.*', 'inv.asset_name', 'p.name as portfolio_name')
      .orderBy('d.date', 'desc');
  }

  async deleteDividend(id: string, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const existing = await this.knex('dividends as d')
      .join('investments as inv', 'inv.id', 'd.investment_id')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('d.id', id)
      .andWhere('p.organization_id', organizationId)
      .andWhere((builder) => {
        builder.where('p.user_id', userId).orWhereNull('p.user_id');
      })
      .select('d.id')
      .first();

    if (!existing) {
      throw new NotFoundException('Dividendo não encontrado');
    }

    await this.knex('dividends').where({ id: existing.id }).delete();
    return { success: true };
  }

  async updateDividend(id: string, data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const existing = await this.knex('dividends as d')
      .join('investments as inv', 'inv.id', 'd.investment_id')
      .join('portfolios as p', 'p.id', 'inv.portfolio_id')
      .where('d.id', id)
      .andWhere('p.organization_id', organizationId)
      .andWhere((builder) => {
        builder.where('p.user_id', userId).orWhereNull('p.user_id');
      })
      .select('d.id')
      .first();

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