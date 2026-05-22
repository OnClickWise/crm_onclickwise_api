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
import { ApolloApiClient, ApolloPerson } from '../apollo/apollo-api.client';
import { ProspectingCreditsService } from '../credits/credits.service';
import { ProspectingCompaniesService } from '../companies/companies.service';
import { EnrichPersonDto, PeopleSearchDto } from './dtos/people-search.dto';

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

export interface ProspectPersonRow {
  id: string;
  organization_id: string;
  source: string;
  source_id: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  seniority: string | null;
  email: string | null;
  email_status: string;
  phone: string | null;
  linkedin_url: string | null;
  photo_url: string | null;
  company_id: string | null;
  company_name: string | null;
  company_domain: string | null;
  country: string | null;
  city: string | null;
  enriched: boolean;
  enriched_at: Date | null;
  converted_to_lead: boolean;
  lead_id: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ProspectingPeopleService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly apollo: ApolloApiClient,
    private readonly credits: ProspectingCreditsService,
    private readonly companiesService: ProspectingCompaniesService,
  ) {}

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
      throw new ForbiddenException('Sem permissão para usar prospecção');
    }
  }

  async searchPeople(dto: PeopleSearchDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    const result = await this.apollo.searchPeople({
      q_keywords: dto.query,
      person_titles: dto.titles,
      person_seniorities: dto.seniorities,
      person_departments: dto.departments,
      person_locations: dto.personLocations,
      organization_domains: dto.organizationDomains,
      organization_locations: dto.organizationLocations,
      organization_num_employees_ranges: dto.organizationEmployeeRanges,
      page: dto.page,
      per_page: dto.perPage,
    });

    await this.credits.logSearch(
      organizationId,
      userId,
      'people_search',
      dto as unknown as Record<string, unknown>,
      result.people.length,
      0,
      result.fromCache,
    );

    // Quais já temos salvos?
    const apolloIds = result.people.map((p) => p.id).filter(Boolean);
    const savedSet = new Set<string>();
    if (apolloIds.length > 0) {
      const saved = await this.knex<ProspectPersonRow>('prospect_people')
        .where({ organization_id: organizationId, source: 'apollo' })
        .whereIn('source_id', apolloIds)
        .select('source_id');
      saved.forEach((r) => r.source_id && savedSet.add(r.source_id));
    }

    return {
      people: result.people.map((p) => this.summarizeApollo(p, savedSet.has(p.id))),
      pagination: result.pagination,
      fromCache: result.fromCache,
      apolloMode: this.apollo.isMockMode() ? 'mock' : 'live',
    };
  }

  /**
   * Enriquece UMA pessoa: revela email, phone, linkedin. CUSTA 1 crédito.
   * Persiste localmente e marca enriched=true.
   */
  async enrichPerson(dto: EnrichPersonDto, user: AuthUserPayload): Promise<ProspectPersonRow> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    if (!dto.apolloPersonId && !dto.email && !dto.linkedinUrl && !dto.prospectPersonId) {
      throw new BadRequestException(
        'Informe apolloPersonId, prospectPersonId, email ou linkedinUrl',
      );
    }

    // Resolve identificação Apollo a partir de prospectPersonId se necessário.
    let apolloPersonId = dto.apolloPersonId;
    let domain = dto.domain;
    let firstName = dto.firstName;
    let lastName = dto.lastName;
    let email = dto.email;
    let linkedinUrl = dto.linkedinUrl;
    let existingLocal: ProspectPersonRow | undefined;

    if (dto.prospectPersonId) {
      existingLocal = await this.knex<ProspectPersonRow>('prospect_people')
        .where({ id: dto.prospectPersonId, organization_id: organizationId })
        .first();
      if (!existingLocal) throw new NotFoundException('Prospect não encontrado');
      apolloPersonId = apolloPersonId ?? existingLocal.source_id ?? undefined;
      firstName = firstName ?? existingLocal.first_name ?? undefined;
      lastName = lastName ?? existingLocal.last_name ?? undefined;
      domain = domain ?? existingLocal.company_domain ?? undefined;
      email = email ?? existingLocal.email ?? undefined;
      linkedinUrl = linkedinUrl ?? existingLocal.linkedin_url ?? undefined;
      if (existingLocal.enriched) {
        // Já enriquecido — devolve sem cobrar de novo.
        return existingLocal;
      }
    }

    const cost = this.apollo.creditCostOf('/api/v1/people/match');
    if (cost > 0) await this.credits.consume(organizationId, cost);

    const { person, fromCache } = await this.apollo.enrichPerson({
      apolloPersonId,
      email,
      firstName,
      lastName,
      domain,
      linkedinUrl,
    });

    if (fromCache && cost > 0) {
      await this.knex('prospect_credits')
        .where({ organization_id: organizationId })
        .decrement('used_this_period', cost);
    }

    if (!person) {
      throw new NotFoundException('Pessoa não encontrada no Apollo');
    }

    // Persiste — passa pelo company_id resolution.
    const row = await this.upsertFromApollo(
      organizationId,
      userId,
      person,
      true,
      fromCache ? 0 : cost,
      existingLocal?.id,
    );

    await this.credits.logSearch(
      organizationId,
      userId,
      'person_enrich',
      dto as unknown as Record<string, unknown>,
      1,
      fromCache ? 0 : cost,
      fromCache,
    );

    return row;
  }

  async listSaved(
    user: AuthUserPayload,
    filters?: { query?: string; enrichedOnly?: boolean; convertedOnly?: boolean; limit?: number },
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);

    const limit = Math.max(1, Math.min(filters?.limit ?? 100, 500));
    const query = this.knex<ProspectPersonRow>('prospect_people')
      .where({ organization_id: organizationId })
      .orderBy('created_at', 'desc')
      .limit(limit);

    if (filters?.enrichedOnly) query.andWhere({ enriched: true });
    if (filters?.convertedOnly) query.andWhere({ converted_to_lead: true });
    if (filters?.query?.trim()) {
      const q = `%${filters.query.trim()}%`;
      query.andWhere((qb) =>
        qb
          .whereILike('full_name', q)
          .orWhereILike('email', q)
          .orWhereILike('company_name', q)
          .orWhereILike('title', q),
      );
    }
    return query;
  }

  async getById(id: string, user: AuthUserPayload): Promise<ProspectPersonRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);
    const row = await this.knex<ProspectPersonRow>('prospect_people')
      .where({ id, organization_id: organizationId })
      .first();
    if (!row) throw new NotFoundException('Pessoa não encontrada');
    return row;
  }

  /**
   * Salva pessoa Apollo localmente sem enrich (sem revelar email/phone).
   * Permite "favoritar" prospects sem gastar crédito ainda.
   */
  async saveFromSearch(apolloPersonId: string, user: AuthUserPayload, snapshot?: ApolloPerson): Promise<ProspectPersonRow> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    const existing = await this.knex<ProspectPersonRow>('prospect_people')
      .where({ organization_id: organizationId, source: 'apollo', source_id: apolloPersonId })
      .first();
    if (existing) return existing;

    if (!snapshot) {
      // Sem snapshot, precisa enrich (custa crédito) — alternativa: cliente envia o objeto da busca.
      throw new BadRequestException(
        'Para salvar sem enrich, envie o snapshot do Apollo. Ou use POST /enrich.',
      );
    }

    return this.upsertFromApollo(organizationId, userId, snapshot, false, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════

  private async upsertFromApollo(
    organizationId: string,
    userId: string,
    person: ApolloPerson,
    enriched: boolean,
    creditsUsed: number,
    existingId?: string,
  ): Promise<ProspectPersonRow> {
    return this.knex.transaction(async (trx) => {
      // 1) Resolve company local (cria/atualiza se org veio embedded)
      let companyId: string | null = null;
      if (person.organization?.id) {
        const existingCompany = await trx<{ id: string }>('prospect_companies')
          .where({
            organization_id: organizationId,
            source: 'apollo',
            source_id: person.organization.id,
          })
          .first();
        if (existingCompany) {
          companyId = existingCompany.id;
        } else {
          // Cria stub básico — sem enriquecer (sem custo).
          const newCompanyId = randomUUID();
          await trx('prospect_companies').insert({
            id: newCompanyId,
            organization_id: organizationId,
            source: 'apollo',
            source_id: person.organization.id,
            name: person.organization.name,
            domain: person.organization.primary_domain ?? null,
            website_url: person.organization.website_url ?? null,
            linkedin_url: person.organization.linkedin_url ?? null,
            industry: person.organization.industry ?? null,
            employee_count: person.organization.estimated_num_employees ?? null,
            country: person.organization.country ?? null,
            city: person.organization.city ?? null,
            enriched: false,
            enrichment_credits_used: 0,
            raw_data: JSON.stringify(person.organization),
            created_by: userId,
            created_at: new Date(),
            updated_at: new Date(),
          });
          companyId = newCompanyId;
        }
      }

      const phone =
        person.phone_numbers?.[0]?.sanitized_number ?? person.phone_numbers?.[0]?.raw_number ?? null;

      const payload = {
        full_name: person.name,
        first_name: person.first_name ?? null,
        last_name: person.last_name ?? null,
        title: person.title ?? null,
        headline: person.headline ?? null,
        seniority: person.seniority ?? null,
        departments: person.departments ?? null,
        subdepartments: person.subdepartments ?? null,
        functions: person.functions ?? null,
        company_id: companyId,
        company_name: person.organization?.name ?? null,
        company_domain: person.organization?.primary_domain ?? null,
        email: person.email ?? null,
        email_status: person.email_status ?? (enriched ? 'unavailable' : 'locked'),
        phone,
        linkedin_url: person.linkedin_url ?? null,
        twitter_url: person.twitter_url ?? null,
        github_url: person.github_url ?? null,
        photo_url: person.photo_url ?? null,
        country: person.country ?? null,
        state: person.state ?? null,
        city: person.city ?? null,
        enriched,
        enriched_at: enriched ? new Date() : null,
        raw_data: JSON.stringify(person),
        updated_at: new Date(),
      };

      // 2) Upsert pela combinação (org, source, source_id)
      const targetId =
        existingId ??
        (
          await trx<{ id: string }>('prospect_people')
            .where({ organization_id: organizationId, source: 'apollo', source_id: person.id })
            .first()
        )?.id;

      if (targetId) {
        await trx('prospect_people')
          .where({ id: targetId })
          .update({
            ...payload,
            enrichment_credits_used: enriched ? creditsUsed : 0,
          });
        return trx<ProspectPersonRow>('prospect_people').where({ id: targetId }).first() as Promise<ProspectPersonRow>;
      }

      const id = randomUUID();
      await trx('prospect_people').insert({
        id,
        organization_id: organizationId,
        source: 'apollo',
        source_id: person.id,
        ...payload,
        enrichment_credits_used: creditsUsed,
        created_by: userId,
        created_at: new Date(),
      });
      return trx<ProspectPersonRow>('prospect_people').where({ id }).first() as Promise<ProspectPersonRow>;
    });
  }

  private summarizeApollo(p: ApolloPerson, alreadySaved: boolean) {
    return {
      apollo_id: p.id,
      full_name: p.name,
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      title: p.title ?? null,
      seniority: p.seniority ?? null,
      // Email NÃO vem na search — só após enrich.
      email_status: p.email_status ?? 'locked',
      linkedin_url: p.linkedin_url ?? null,
      photo_url: p.photo_url ?? null,
      country: p.country ?? null,
      city: p.city ?? null,
      organization: p.organization
        ? {
            apollo_id: p.organization.id,
            name: p.organization.name,
            domain: p.organization.primary_domain ?? null,
            industry: p.organization.industry ?? null,
            employee_count: p.organization.estimated_num_employees ?? null,
          }
        : null,
      already_saved: alreadySaved,
    };
  }
}
