import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

@Injectable()
export class CardService {
  constructor(
    @Inject('knex') private readonly knex: Knex
  ) {}

  private async ensureColumnAccess(columnId: string, user: any) {
    const column = await this.knex('kanban_columns as c')
      .join('kanban_boards as b', 'b.id', 'c.board_id')
      .join('projects as p', 'p.id', 'b.project_id')
      .join('users as owner', 'owner.id', 'p.owner_id')
      .where('c.id', columnId)
      .andWhere('owner.organization_id', user.organizationId)
      .select('c.id')
      .first();

    if (!column) {
      throw new NotFoundException('Coluna não encontrada');
    }
  }

  private async ensureCardAccess(cardId: string, user: any) {
    const card = await this.knex('kanban_cards as k')
      .join('kanban_columns as c', 'c.id', 'k.column_id')
      .join('kanban_boards as b', 'b.id', 'c.board_id')
      .join('projects as p', 'p.id', 'b.project_id')
      .join('users as owner', 'owner.id', 'p.owner_id')
      .where('k.id', cardId)
      .andWhere('owner.organization_id', user.organizationId)
      .select('k.*')
      .first();

    if (!card) {
      throw new NotFoundException('Cartão não encontrado');
    }

    return card;
  }

  async createCard(data: any, user: any) {
    const columnId = data.columnId || data.listId;
    await this.ensureColumnAccess(columnId, user);

    const [card] = await this.knex('kanban_cards')
      .insert({
        id: randomUUID(),
        title: data.title,
        description: data.description || null,
        column_id: columnId,
        position: data.position ?? data.order ?? 0,
        metadata: JSON.stringify(data.metadata || {}),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    return card;
  }

  private parseMetadata(metadata: unknown) {
    if (!metadata) return {};

    if (typeof metadata === 'string') {
      try {
        const parsed = JSON.parse(metadata);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }

    return typeof metadata === 'object' ? metadata : {};
  }

  async duplicateCard(id: string, user: any) {
    const originalCard = await this.ensureCardAccess(id, user);
    const [positionRow] = await this.knex('kanban_cards')
      .where({ column_id: originalCard.column_id })
      .max<{ max_position: number | string | null }[]>('position as max_position');

    const nextPosition = Number(positionRow?.max_position ?? -1) + 1;
    const metadata = {
      ...this.parseMetadata(originalCard.metadata),
      archived: false,
    };

    const [duplicatedCard] = await this.knex('kanban_cards')
      .insert({
        id: randomUUID(),
        title: `${originalCard.title} (cópia)`,
        description: originalCard.description || null,
        column_id: originalCard.column_id,
        position: nextPosition,
        due_date: originalCard.due_date || null,
        assigned_to: originalCard.assigned_to || null,
        metadata: JSON.stringify(metadata),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    return duplicatedCard;
  }

  async getCardById(id: string, user: any) {
    return this.ensureCardAccess(id, user);
  }

  async listCards(listId: string, user: any) {
    await this.ensureColumnAccess(listId, user);

    return await this.knex('kanban_cards')
      .where({ column_id: listId })
      .orderBy('position', 'asc');
  }

  async updateCard(id: string, data: any, user: any) {
    await this.ensureCardAccess(id, user);

    const payload: any = { updated_at: new Date() };
    if (data.title) payload.title = data.title;
    if (data.description !== undefined) payload.description = data.description;
    if (data.columnId || data.listId) {
      const nextColumnId = data.columnId || data.listId;
      await this.ensureColumnAccess(nextColumnId, user);
      payload.column_id = nextColumnId;
    }
    if (data.position !== undefined) payload.position = data.position;
    if (data.metadata) payload.metadata = JSON.stringify(data.metadata);
    const [card] = await this.knex('kanban_cards')
      .where({ id })
      .update(payload)
      .returning('*');
    return card;
  }

  async deleteCard(id: string, user: any) {
    await this.ensureCardAccess(id, user);
    return await this.knex('kanban_cards').where({ id }).delete();
  }
}
