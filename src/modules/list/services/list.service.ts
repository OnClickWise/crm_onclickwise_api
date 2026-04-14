import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class ListService {
  constructor(
    @Inject('knex') private readonly knex: Knex
  ) {}

  private async ensureBoardAccess(boardId: string, user: any) {
    const board = await this.knex('kanban_boards as b')
      .join('projects as p', 'p.id', 'b.project_id')
      .join('users as owner', 'owner.id', 'p.owner_id')
      .where('b.id', boardId)
      .andWhere('owner.organization_id', user.organizationId)
      .select('b.id')
      .first();

    if (!board) {
      throw new NotFoundException('Quadro não encontrado');
    }
  }

  private async ensureListAccess(listId: string, user: any) {
    const list = await this.knex('kanban_columns as c')
      .join('kanban_boards as b', 'b.id', 'c.board_id')
      .join('projects as p', 'p.id', 'b.project_id')
      .join('users as owner', 'owner.id', 'p.owner_id')
      .where('c.id', listId)
      .andWhere('owner.organization_id', user.organizationId)
      .select('c.*')
      .first();

    if (!list) {
      throw new NotFoundException('Lista não encontrada');
    }

    return list;
  }

  async createList(data: any, user: any) {
    await this.ensureBoardAccess(data.boardId, user);

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
    return this.ensureListAccess(id, user);
  }

  async listLists(boardId: string, user: any) {
    await this.ensureBoardAccess(boardId, user);

    return await this.knex('kanban_columns')
      .where({ board_id: boardId })
      .orderBy('position', 'asc');
  }

  async updateList(id: string, data: any, user: any) {
    await this.ensureListAccess(id, user);

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
    await this.ensureListAccess(id, user);
    return await this.knex('kanban_columns').where({ id }).delete();
  }
}
