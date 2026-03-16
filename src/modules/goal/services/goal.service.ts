import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class GoalService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: any): { organizationId: string; userId: string } {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuário sem organização vinculada');
    }

    return { organizationId: user.organizationId, userId: user.userId };
  }

  async createGoal(data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const [goal] = await this.knex('financial_goals')
      .insert({
        id: randomUUID(),
        user_id: userId,
        organization_id: organizationId,
        name: data.name,
        category: data.category,
        target_amount: Number(data.targetAmount ?? 0),
        current_amount: Number(data.currentAmount ?? 0),
        target_date: data.targetDate ? new Date(data.targetDate) : null,
        description: data.description ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    return goal;
  }

  async listGoals(user: any) {
    const { organizationId, userId } = this.getScope(user);

    return this.knex('financial_goals')
      .where({ organization_id: organizationId, user_id: userId })
      .orderBy('created_at', 'desc');
  }

  async updateGoal(id: string, data: any, user: any) {
    const { organizationId, userId } = this.getScope(user);

    const [goal] = await this.knex('financial_goals')
      .where({ id, organization_id: organizationId, user_id: userId })
      .update({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.targetAmount !== undefined ? { target_amount: Number(data.targetAmount) } : {}),
        ...(data.currentAmount !== undefined ? { current_amount: Number(data.currentAmount) } : {}),
        ...(data.targetDate !== undefined ? { target_date: data.targetDate ? new Date(data.targetDate) : null } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        updated_at: new Date(),
      })
      .returning('*');

    if (!goal) {
      throw new NotFoundException('Meta não encontrada');
    }

    return goal;
  }

  async deleteGoal(id: string, user: any) {
    const { organizationId, userId } = this.getScope(user);
    const deleted = await this.knex('financial_goals').where({ id, organization_id: organizationId, user_id: userId }).delete();

    if (!deleted) {
      throw new NotFoundException('Meta não encontrada');
    }

    return { success: true };
  }
}