import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class FinancialFlowService {
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

  async createFlow(data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const [flow] = await this.knex('financial_flows')
      .insert({
        id: randomUUID(),
        user_id: userId,
        organization_id: organizationId,
        type: data.type,
        category: data.category,
        description: data.description ?? null,
        value: Number(data.value ?? 0),
        date: data.date ? new Date(data.date) : new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    return flow;
  }

  async listFlows(user: any) {
    const { organizationId, userId } = this.getScope(user);

    return this.knex('financial_flows')
      .where({ organization_id: organizationId, user_id: userId })
      .orderBy('date', 'desc');
  }

  async updateFlow(id: string, data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const [flow] = await this.knex('financial_flows')
      .where({ id, organization_id: organizationId, user_id: userId })
      .update({
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.value !== undefined ? { value: Number(data.value) } : {}),
        ...(data.date !== undefined ? { date: new Date(data.date) } : {}),
        updated_at: new Date(),
      })
      .returning('*');

    if (!flow) {
      throw new NotFoundException('Lançamento não encontrado');
    }

    return flow;
  }

  async deleteFlow(id: string, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const deleted = await this.knex('financial_flows')
      .where({ id, organization_id: organizationId, user_id: userId })
      .delete();

    if (!deleted) {
      throw new NotFoundException('Lançamento não encontrado');
    }

    return { success: true };
  }
}