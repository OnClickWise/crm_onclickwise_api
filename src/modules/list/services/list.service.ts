import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class ListService {
  constructor(
    @Inject('knex') private readonly knex: Knex
  ) {}

  async createList(data: any, user: any) {
    const [list] = await this.knex('kanban_columns')
      .insert({
        id: randomUUID(),
        title: data.title || data.name,
        board_id: data.boardId,
        position: data.position ?? data.order ?? 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    return list;
  }

  async getListById(id: string, user: any) {
    return await this.knex('kanban_columns').where({ id }).first();
  }

  async listLists(boardId: string, user: any) {
    return await this.knex('kanban_columns')
      .where({ board_id: boardId })
      .orderBy('position', 'asc');
  }

  async updateList(id: string, data: any, user: any) {
    const payload: any = { updated_at: new Date() };
    if (data.title || data.name) payload.title = data.title || data.name;
    if (data.position !== undefined) payload.position = data.position;
    const [list] = await this.knex('kanban_columns')
      .where({ id })
      .update(payload)
      .returning('*');
    return list;
  }

  async deleteList(id: string, user: any) {
    return await this.knex('kanban_columns').where({ id }).delete();
  }
}
