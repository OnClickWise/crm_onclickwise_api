import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class BoardService {
  constructor(
    @Inject('knex') private readonly knex: Knex
  ) {}

  private async ensureProjectAccess(projectId: string, user: any) {
    const project = await this.knex('projects as p')
      .join('users as owner', 'owner.id', 'p.owner_id')
      .where('p.id', projectId)
      .andWhere('owner.organization_id', user.organizationId)
      .select('p.id')
      .first();

    if (!project) {
      throw new NotFoundException('Projeto não encontrado');
    }
  }

  private async ensureBoardAccess(boardId: string, user: any) {
    const board = await this.knex('kanban_boards as b')
      .join('projects as p', 'p.id', 'b.project_id')
      .join('users as owner', 'owner.id', 'p.owner_id')
      .where('b.id', boardId)
      .andWhere('owner.organization_id', user.organizationId)
      .select('b.*')
      .first();

    if (!board) {
      throw new NotFoundException('Quadro não encontrado');
    }

    return board;
  }

  async createBoard(data: any, user: any) {
    if (!data.projectId) {
      throw new NotFoundException('Projeto não encontrado');
    }

    await this.ensureProjectAccess(data.projectId, user);

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
    return this.ensureBoardAccess(id, user);
  }

  async listBoards(projectId: string, user: any) {
    const baseQuery = this.knex('kanban_boards as b')
      .join('projects as p', 'p.id', 'b.project_id')
      .join('users as owner', 'owner.id', 'p.owner_id')
      .where('owner.organization_id', user.organizationId)
      .select('b.*')
      .orderBy('b.created_at', 'desc');

    if (projectId && projectId !== 'NaN' && projectId !== 'undefined') {
      baseQuery.andWhere('b.project_id', projectId);
    }

    return await baseQuery;
  }

  async updateBoard(id: string, data: any, user: any) {
    await this.ensureBoardAccess(id, user);

    const payload: any = { updated_at: new Date() };
    if (typeof data.title === 'string') payload.title = data.title;
    if (typeof data.name === 'string' && payload.title === undefined) payload.title = data.name;
    if (typeof data.color === 'string') payload.color = data.color;

    const [board] = await this.knex('kanban_boards')
      .where({ id })
      .update(payload)
      .returning('*');
    return board;
  }

  async deleteBoard(id: string, user: any) {
    await this.ensureBoardAccess(id, user);
    return await this.knex('kanban_boards').where({ id }).delete();
  }
}
