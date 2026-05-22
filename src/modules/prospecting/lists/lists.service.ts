import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { AddItemsDto, CreateListDto, UpdateListDto } from './dtos/list.dto';

interface AuthScope {
  organizationId: string;
  userId: string;
  role: string;
}

interface AuthUserPayload {
  organizationId?: string;
  userId?: string;
  role?: string;
}

const ALLOWED_ROLES = ['master', 'admin', 'sales', 'sdr', 'manager', 'employee'] as const;

export interface ProspectListRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  color: string;
  list_type: string;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ProspectingListsService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuário sem organização vinculada');
    }
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }

  private ensureRole(role: string) {
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para gerenciar listas');
    }
  }

  /**
   * Lista todas as listas com contagem de items via JOIN agregado (sem N+1).
   */
  async listLists(user: AuthUserPayload, filters?: { includeArchived?: boolean }) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);

    const query = this.knex<ProspectListRow>('prospect_lists as l')
      .leftJoin(
        this.knex('prospect_list_items')
          .select('list_id')
          .count('* as items_count')
          .where('organization_id', organizationId)
          .groupBy('list_id')
          .as('cnt'),
        'cnt.list_id',
        'l.id',
      )
      .where('l.organization_id', organizationId)
      .select(
        'l.*',
        this.knex.raw('COALESCE(cnt.items_count, 0)::int AS items_count'),
      )
      .orderBy([
        { column: 'l.is_archived', order: 'asc' },
        { column: 'l.created_at', order: 'desc' },
      ]);

    if (!filters?.includeArchived) query.andWhere('l.is_archived', false);
    return query;
  }

  async create(dto: CreateListDto, user: AuthUserPayload): Promise<ProspectListRow> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    const id = randomUUID();
    const now = new Date();
    await this.knex('prospect_lists').insert({
      id,
      organization_id: organizationId,
      name: dto.name,
      description: dto.description ?? null,
      color: dto.color ?? '#6366F1',
      list_type: dto.listType ?? 'prospects',
      is_archived: false,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
    return this.knex<ProspectListRow>('prospect_lists').where({ id }).first() as Promise<ProspectListRow>;
  }

  async update(id: string, dto: UpdateListDto, user: AuthUserPayload): Promise<ProspectListRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);

    const existing = await this.knex<ProspectListRow>('prospect_lists')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Lista não encontrada');

    await this.knex('prospect_lists')
      .where({ id, organization_id: organizationId })
      .update({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.listType !== undefined && { list_type: dto.listType }),
        ...(dto.isArchived !== undefined && { is_archived: dto.isArchived }),
        updated_at: new Date(),
      });
    return this.knex<ProspectListRow>('prospect_lists').where({ id }).first() as Promise<ProspectListRow>;
  }

  async remove(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);
    const deleted = await this.knex('prospect_lists')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Lista não encontrada');
    return { success: true };
  }

  async getDetail(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);

    const list = await this.knex<ProspectListRow>('prospect_lists')
      .where({ id, organization_id: organizationId })
      .first();
    if (!list) throw new NotFoundException('Lista não encontrada');

    // Items com JOIN às tabelas de pessoa e empresa (uma só query — sem N+1).
    // O JOIN usa item_type como discriminador para acertar a tabela correta.
    const knex = this.knex;
    const items = await knex('prospect_list_items as li')
      .leftJoin('prospect_people as p', function () {
        this.on('p.id', '=', 'li.item_id').andOn(knex.raw("li.item_type = 'person'"));
      })
      .leftJoin('prospect_companies as c', function () {
        this.on('c.id', '=', 'li.item_id').andOn(knex.raw("li.item_type = 'company'"));
      })
      .where({ 'li.list_id': id, 'li.organization_id': organizationId })
      .select(
        'li.id as item_id_local',
        'li.item_type',
        'li.item_id',
        'li.notes',
        'li.added_at',
        'p.full_name as person_name',
        'p.title as person_title',
        'p.email as person_email',
        'p.email_status as person_email_status',
        'p.company_name as person_company',
        'p.linkedin_url as person_linkedin',
        'p.enriched as person_enriched',
        'p.converted_to_lead as person_converted',
        'c.name as company_name',
        'c.domain as company_domain',
        'c.industry as company_industry',
        'c.employee_count as company_employees',
      )
      .orderBy('li.added_at', 'desc');

    return { list, items };
  }

  async addItems(listId: string, dto: AddItemsDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    const list = await this.knex<ProspectListRow>('prospect_lists')
      .where({ id: listId, organization_id: organizationId })
      .first();
    if (!list) throw new NotFoundException('Lista não encontrada');
    if (list.is_archived) throw new BadRequestException('Lista arquivada — desarquive antes de adicionar items');

    return this.knex.transaction(async (trx) => {
      // Valida que cada item realmente existe e pertence à org.
      const personIds = dto.items.filter((i) => i.itemType === 'person').map((i) => i.itemId);
      const companyIds = dto.items.filter((i) => i.itemType === 'company').map((i) => i.itemId);

      if (personIds.length > 0) {
        const found = await trx('prospect_people')
          .whereIn('id', personIds)
          .andWhere({ organization_id: organizationId })
          .select('id');
        if (found.length !== new Set(personIds).size) {
          throw new BadRequestException('Uma ou mais pessoas não foram encontradas');
        }
      }
      if (companyIds.length > 0) {
        const found = await trx('prospect_companies')
          .whereIn('id', companyIds)
          .andWhere({ organization_id: organizationId })
          .select('id');
        if (found.length !== new Set(companyIds).size) {
          throw new BadRequestException('Uma ou mais empresas não foram encontradas');
        }
      }

      // Insere com ON CONFLICT DO NOTHING (idempotente — adicionar 2x = sem erro).
      const now = new Date();
      const rows = dto.items.map((it) => ({
        id: randomUUID(),
        organization_id: organizationId,
        list_id: listId,
        item_type: it.itemType,
        item_id: it.itemId,
        notes: it.notes ?? null,
        added_by: userId,
        added_at: now,
      }));

      const inserted = await trx('prospect_list_items')
        .insert(rows)
        .onConflict(['list_id', 'item_type', 'item_id'])
        .ignore()
        .returning('id');

      return { added: inserted.length, totalRequested: dto.items.length };
    });
  }

  async removeItem(listId: string, itemLocalId: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);

    const deleted = await this.knex('prospect_list_items')
      .where({ id: itemLocalId, list_id: listId, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Item não encontrado');
    return { success: true };
  }
}
