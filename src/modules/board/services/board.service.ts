import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class BoardService {
  constructor(
    @Inject('knex') private readonly knex: Knex
  ) {}

  async createBoard(data: any, user: any) {
    const [board] = await this.knex('kanban_boards')
      .insert({
        id: randomUUID(),
        title: data.title || data.name,
        project_id: data.projectId || null,
        color: data.color || 'ocean',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    return board;
  }

  async getBoardById(id: string, user: any) {
    const board = await this.knex('kanban_boards')
      .where({ id })
      .first();
    if (!board) return null;
    return board;
  }

  async listBoards(projectId: string, user: any) {
    if (projectId && projectId !== 'NaN' && projectId !== 'undefined') {
      return await this.knex('kanban_boards')
        .where({ project_id: projectId })
        .orderBy('created_at', 'desc');
    }
    return await this.knex('kanban_boards').select('*').orderBy('created_at', 'desc');
  }

  async updateBoard(id: string, data: any, user: any) {
    const [board] = await this.knex('kanban_boards')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return board;
  }

  async deleteBoard(id: string, user: any) {
    return await this.knex('kanban_boards').where({ id }).delete();
  }
}
