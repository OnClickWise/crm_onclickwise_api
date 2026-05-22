import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import {
  CreateManualEventDto,
  CreateTriggerDto,
  EventStatus,
  NotifyVia,
  TriggerStatus,
  TriggerType,
  UpdateEventStatusDto,
  UpdateTriggerDto,
} from './dtos/trigger.dto';

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

const WRITE_ROLES = ['master', 'admin', 'sales', 'sdr', 'manager'] as const;
const READ_ROLES = [...WRITE_ROLES, 'employee'] as const;

export interface TriggerRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  filters: Record<string, unknown>;
  status: TriggerStatus;
  notify_via: NotifyVia;
  last_check_at: Date | null;
  total_events_fired: number;
  created_by: string | null;
  assigned_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TriggerEventRow {
  id: string;
  organization_id: string;
  trigger_id: string;
  company_id: string | null;
  person_id: string | null;
  title: string;
  summary: string | null;
  payload: Record<string, unknown> | null;
  source_url: string | null;
  status: EventStatus;
  detected_at: Date;
  seen_at: Date | null;
  acted_at: Date | null;
}

/**
 * Sales Triggers — gatilhos de prospecção.
 * Por enquanto suportamos:
 *  - 'manual': cliente cadastra eventos no banco (UI ou outra integração)
 *  - 'job_posting'/'employee_growth'/etc: estrutura pronta, mas execução
 *    automática depende de feed externo (LinkedIn/Crunchbase) — implementaremos
 *    um stub `runCheck` que itera empresas e checa keywords no `industry`/`description`
 *    pra gerar eventos de exemplo.
 */
@Injectable()
export class ProspectingTriggersService {
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

  private ensureWrite(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para gerenciar gatilhos');
    }
  }

  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para consultar gatilhos');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TRIGGERS CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async list(user: AuthUserPayload, status?: TriggerStatus): Promise<TriggerRow[]> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);
    return this.knex<TriggerRow>('prospect_triggers')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (status) q.andWhere({ status });
      })
      .orderBy('created_at', 'desc');
  }

  async getById(id: string, user: AuthUserPayload): Promise<TriggerRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);
    const row = await this.knex<TriggerRow>('prospect_triggers')
      .where({ id, organization_id: organizationId })
      .first();
    if (!row) throw new NotFoundException('Gatilho não encontrado');
    return row;
  }

  async create(dto: CreateTriggerDto, user: AuthUserPayload): Promise<TriggerRow> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    const id = randomUUID();
    const now = new Date();
    await this.knex('prospect_triggers').insert({
      id,
      organization_id: organizationId,
      name: dto.name,
      description: dto.description ?? null,
      trigger_type: dto.triggerType,
      filters: JSON.stringify(dto.filters ?? {}),
      status: dto.status ?? 'active',
      notify_via: dto.notifyVia ?? 'in_app',
      assigned_user_id: dto.assignedUserId ?? null,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
    return (await this.knex<TriggerRow>('prospect_triggers').where({ id }).first()) as TriggerRow;
  }

  async update(id: string, dto: UpdateTriggerDto, user: AuthUserPayload): Promise<TriggerRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    const existing = await this.knex<TriggerRow>('prospect_triggers')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Gatilho não encontrado');

    await this.knex('prospect_triggers')
      .where({ id, organization_id: organizationId })
      .update({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.triggerType !== undefined && { trigger_type: dto.triggerType }),
        ...(dto.filters !== undefined && { filters: JSON.stringify(dto.filters) }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.notifyVia !== undefined && { notify_via: dto.notifyVia }),
        ...(dto.assignedUserId !== undefined && { assigned_user_id: dto.assignedUserId ?? null }),
        updated_at: new Date(),
      });

    return (await this.knex<TriggerRow>('prospect_triggers').where({ id }).first()) as TriggerRow;
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);
    const deleted = await this.knex('prospect_triggers')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Gatilho não encontrado');
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EVENTS
  // ═══════════════════════════════════════════════════════════════════════

  async listEvents(
    user: AuthUserPayload,
    opts: { status?: EventStatus; triggerId?: string } = {},
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);
    return this.knex('prospect_trigger_events as ev')
      .leftJoin('prospect_triggers as tr', 'ev.trigger_id', 'tr.id')
      .leftJoin('prospect_companies as co', 'ev.company_id', 'co.id')
      .leftJoin('prospect_people as pe', 'ev.person_id', 'pe.id')
      .where('ev.organization_id', organizationId)
      .modify((q) => {
        if (opts.status) q.andWhere('ev.status', opts.status);
        if (opts.triggerId) q.andWhere('ev.trigger_id', opts.triggerId);
      })
      .select(
        'ev.*',
        { trigger_name: 'tr.name' },
        { trigger_type: 'tr.trigger_type' },
        { company_name: 'co.name' },
        { company_domain: 'co.domain' },
        { person_name: 'pe.name' },
      )
      .orderBy('ev.detected_at', 'desc')
      .limit(200);
  }

  async createManualEvent(
    triggerId: string,
    dto: CreateManualEventDto,
    user: AuthUserPayload,
  ): Promise<TriggerEventRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    const trigger = await this.knex<TriggerRow>('prospect_triggers')
      .where({ id: triggerId, organization_id: organizationId })
      .first();
    if (!trigger) throw new NotFoundException('Gatilho não encontrado');

    const id = randomUUID();
    const now = new Date();
    await this.knex('prospect_trigger_events').insert({
      id,
      organization_id: organizationId,
      trigger_id: triggerId,
      company_id: dto.companyId ?? null,
      person_id: dto.personId ?? null,
      title: dto.title,
      summary: dto.summary ?? null,
      payload: dto.payload ? JSON.stringify(dto.payload) : null,
      source_url: dto.sourceUrl ?? null,
      status: 'new',
      detected_at: now,
    });
    await this.knex('prospect_triggers')
      .where({ id: triggerId })
      .increment('total_events_fired', 1);

    return (await this.knex<TriggerEventRow>('prospect_trigger_events')
      .where({ id })
      .first()) as TriggerEventRow;
  }

  async updateEventStatus(
    eventId: string,
    dto: UpdateEventStatusDto,
    user: AuthUserPayload,
  ): Promise<TriggerEventRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    const existing = await this.knex<TriggerEventRow>('prospect_trigger_events')
      .where({ id: eventId, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Evento não encontrado');

    const now = new Date();
    const patch: Partial<TriggerEventRow> = { status: dto.status };
    if (dto.status === 'seen' && !existing.seen_at) patch.seen_at = now;
    if (dto.status === 'acted') patch.acted_at = now;
    await this.knex('prospect_trigger_events').where({ id: eventId }).update(patch);

    return (await this.knex<TriggerEventRow>('prospect_trigger_events')
      .where({ id: eventId })
      .first()) as TriggerEventRow;
  }

  /**
   * Roda um check do gatilho: percorre empresas (e job postings se houver)
   * e gera eventos baseado nos filtros do trigger. Stub simples por enquanto —
   * compara `keywords` do filtro contra `industry`/`description`/`tags` da empresa.
   *
   * Idempotência: dedup por (trigger_id, company_id, title) nas últimas 24h.
   */
  async runCheck(
    triggerId: string,
    user: AuthUserPayload,
  ): Promise<{ checked: number; eventsCreated: number }> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    const trigger = await this.knex<TriggerRow>('prospect_triggers')
      .where({ id: triggerId, organization_id: organizationId })
      .first();
    if (!trigger) throw new NotFoundException('Gatilho não encontrado');
    if (trigger.status !== 'active') {
      return { checked: 0, eventsCreated: 0 };
    }

    const filters = (typeof trigger.filters === 'string'
      ? JSON.parse(trigger.filters)
      : trigger.filters) as {
      target_companies?: string[]; // domínios
      keywords?: string[];
      department?: string;
      min_count?: number;
    };

    // Seleciona empresas alvo
    const companies = await this.knex('prospect_companies')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (filters.target_companies?.length) {
          q.whereIn('domain', filters.target_companies);
        }
      })
      .select<
        Array<{
          id: string;
          name: string | null;
          domain: string | null;
          industry: string | null;
          description: string | null;
        }>
      >('id', 'name', 'domain', 'industry', 'description');

    if (companies.length === 0) {
      await this.knex('prospect_triggers')
        .where({ id: triggerId })
        .update({ last_check_at: new Date() });
      return { checked: 0, eventsCreated: 0 };
    }

    const keywords = (filters.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
    const matches: Array<{ company: (typeof companies)[number]; matched: string[] }> = [];

    for (const c of companies) {
      if (keywords.length === 0) {
        matches.push({ company: c, matched: [] });
        continue;
      }
      const haystack = `${c.industry ?? ''} ${c.description ?? ''} ${c.name ?? ''}`.toLowerCase();
      const matched = keywords.filter((k) => haystack.includes(k));
      if (matched.length > 0) matches.push({ company: c, matched });
    }

    if (matches.length === 0) {
      await this.knex('prospect_triggers')
        .where({ id: triggerId })
        .update({ last_check_at: new Date() });
      return { checked: companies.length, eventsCreated: 0 };
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let created = 0;
    const now = new Date();

    for (const m of matches) {
      const title =
        trigger.trigger_type === 'job_posting'
          ? `Possível vaga aberta na ${m.company.name ?? m.company.domain}`
          : `Sinal detectado em ${m.company.name ?? m.company.domain}`;

      // Dedup últimas 24h
      const exists = await this.knex('prospect_trigger_events')
        .where({
          organization_id: organizationId,
          trigger_id: triggerId,
          company_id: m.company.id,
          title,
        })
        .andWhere('detected_at', '>=', since)
        .first();
      if (exists) continue;

      await this.knex('prospect_trigger_events').insert({
        id: randomUUID(),
        organization_id: organizationId,
        trigger_id: triggerId,
        company_id: m.company.id,
        person_id: null,
        title,
        summary: m.matched.length
          ? `Palavras-chave detectadas: ${m.matched.join(', ')}`
          : 'Empresa monitorada apresenta atividade relevante',
        payload: JSON.stringify({ matched: m.matched, type: trigger.trigger_type }),
        source_url: m.company.domain ? `https://${m.company.domain}` : null,
        status: 'new',
        detected_at: now,
      });
      created++;
    }

    await this.knex('prospect_triggers').where({ id: triggerId }).update({
      last_check_at: now,
      total_events_fired: trigger.total_events_fired + created,
      updated_at: now,
    });

    return { checked: companies.length, eventsCreated: created };
  }
}
