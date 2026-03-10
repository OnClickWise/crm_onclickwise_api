import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class CardService {
  constructor(
    @Inject('knex') private readonly knex: Knex
  ) {}

  async createCard(data: any, user: any) {
    const [card] = await this.knex('kanban_cards')
      .insert({
        id: randomUUID(),
        title: data.title,
        description: data.description || null,
        column_id: data.columnId || data.listId,
        position: data.position ?? data.order ?? 0,
        metadata: JSON.stringify(data.metadata || {}),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    return card;
  }

  async getCardById(id: string, user: any) {
    return await this.knex('kanban_cards').where({ id }).first();
  }

  async listCards(listId: string, user: any) {
    return await this.knex('kanban_cards')
      .where({ column_id: listId })
      .orderBy('position', 'asc');
  }

  async updateCard(id: string, data: any, user: any) {
    const payload: any = { updated_at: new Date() };
    if (data.title) payload.title = data.title;
    if (data.description !== undefined) payload.description = data.description;
    if (data.columnId || data.listId) payload.column_id = data.columnId || data.listId;
    if (data.position !== undefined) payload.position = data.position;
    if (data.metadata) payload.metadata = JSON.stringify(data.metadata);
    const [card] = await this.knex('kanban_cards')
      .where({ id })
      .update(payload)
      .returning('*');
    return card;
  }

  async deleteCard(id: string, user: any) {
    return await this.knex('kanban_cards').where({ id }).delete();
  }
}
