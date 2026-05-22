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
import { ApolloApiClient, ApolloOrganization } from '../apollo/apollo-api.client';
import { ProspectingCreditsService } from '../credits/credits.service';
import { CompanySearchDto, EnrichCompanyDto } from './dtos/company-search.dto';

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

export interface ProspectCompanyRow {
  id: string;
  organization_id: string;
  source: string;
  source_id: string | null;
  name: string;
  domain: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  industry: string | null;
  employee_count: number | null;
  employee_range: string | null;
  country: string | null;
  city: string | null;
  technologies: string[] | null;
  enriched: boolean;
  enriched_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ProspectingCompaniesService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly apollo: ApolloApiClient,
    private readonly credits: ProspectingCreditsService,
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

  /**
   * Busca empresas no Apollo (gratuita, mas usa cache 24h pra evitar request repetida).
   * NÃO persiste todos os resultados — só guarda em cache. Persistência só acontece
   * quando o usuário clica em "salvar empresa" ou "enriquecer".
   */
  async searchCompanies(dto: CompanySearchDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    const result = await this.apollo.searchCompanies({
      q_keywords: dto.query,
      organization_locations: dto.locations,
      organization_num_employees_ranges: dto.employeeRanges,
      organization_industry_tag_ids: dto.industries,
      technologies: dto.technologies,
      page: dto.page,
      per_page: dto.perPage,
    });

    // Audit log (search é gratuita, creditsUsed = 0)
    await this.credits.logSearch(
      organizationId,
      userId,
      'company_search',
      dto as unknown as Record<string, unknown>,
      result.organizations.length,
      0,
      result.fromCache,
    );

    // Marca quais já estão salvos localmente.
    const apolloIds = result.organizations.map((o) => o.id).filter(Boolean);
    const savedSet = new Set<string>();
    if (apolloIds.length > 0) {
      const saved = await this.knex<ProspectCompanyRow>('prospect_companies')
        .where({ organization_id: organizationId, source: 'apollo' })
        .whereIn('source_id', apolloIds)
        .select('source_id');
      saved.forEach((row) => row.source_id && savedSet.add(row.source_id));
    }

    return {
      companies: result.organizations.map((o) => this.summarizeApollo(o, savedSet.has(o.id))),
      pagination: result.pagination,
      fromCache: result.fromCache,
      apolloMode: this.apollo.isMockMode() ? 'mock' : 'live',
    };
  }

  /**
   * Enriquece UMA empresa (custa 1 crédito) e persiste no banco.
   * Idempotente: se já foi enriquecida na mesma org, retorna do banco sem cobrar.
   */
  async enrichCompany(dto: EnrichCompanyDto, user: AuthUserPayload): Promise<ProspectCompanyRow> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    if (!dto.domain && !dto.apolloOrgId) {
      throw new BadRequestException('Informe domain ou apolloOrgId');
    }

    // Verifica cache local primeiro
    let existing = await this.knex<ProspectCompanyRow>('prospect_companies')
      .where({ organization_id: organizationId })
      .where((qb) => {
        if (dto.apolloOrgId) qb.where({ source: 'apollo', source_id: dto.apolloOrgId });
        else if (dto.domain) qb.orWhere({ domain: dto.domain });
      })
      .first();
    if (existing && existing.enriched) {
      return existing;
    }

    // Consome créditos ANTES de chamar Apollo (atomicamente).
    // Se Apollo cair depois, o crédito já foi gasto — aceitável dado que
    // o cache de 30d pega na próxima tentativa.
    const cost = this.apollo.creditCostOf('/api/v1/organizations/enrich');
    if (cost > 0) {
      await this.credits.consume(organizationId, cost);
    }

    const { organization: apolloOrg, fromCache } = await this.apollo.enrichOrganization({
      domain: dto.domain,
      apolloOrgId: dto.apolloOrgId,
    });

    // Se veio do cache, devolve crédito.
    if (fromCache && cost > 0) {
      // Compensação: re-credita a quota.
      await this.knex('prospect_credits')
        .where({ organization_id: organizationId })
        .decrement('used_this_period', cost);
    }

    if (!apolloOrg) {
      throw new NotFoundException('Empresa não encontrada no Apollo');
    }

    // Persiste/atualiza
    const row = await this.upsertFromApollo(organizationId, userId, apolloOrg, true, fromCache ? 0 : cost);

    await this.credits.logSearch(
      organizationId,
      userId,
      'company_enrich',
      dto as unknown as Record<string, unknown>,
      1,
      fromCache ? 0 : cost,
      fromCache,
    );

    return row;
  }

  async listSaved(
    user: AuthUserPayload,
    filters?: { query?: string; enrichedOnly?: boolean; limit?: number },
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);

    const limit = Math.max(1, Math.min(filters?.limit ?? 100, 500));
    const query = this.knex<ProspectCompanyRow>('prospect_companies')
      .where({ organization_id: organizationId })
      .orderBy('created_at', 'desc')
      .limit(limit);

    if (filters?.enrichedOnly) query.andWhere({ enriched: true });
    if (filters?.query?.trim()) {
      const q = `%${filters.query.trim()}%`;
      query.andWhere((qb) => qb.whereILike('name', q).orWhereILike('domain', q));
    }
    return query;
  }

  async getById(id: string, user: AuthUserPayload): Promise<ProspectCompanyRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);
    const row = await this.knex<ProspectCompanyRow>('prospect_companies')
      .where({ id, organization_id: organizationId })
      .first();
    if (!row) throw new NotFoundException('Empresa não encontrada');
    return row;
  }

  /**
   * Salva empresa Apollo localmente (sem enrich) usando o SNAPSHOT da busca.
   *
   * Por que não chamar enrich automaticamente?
   *  - O endpoint Apollo `organizations/enrich` EXIGE `domain` (não aceita ID puro)
   *    e custa 1 crédito. Para "favoritar" / abrir página de equipe não precisamos
   *    pagar — os dados básicos já vieram na busca.
   *
   * Aceita ApolloOrganization completo do resultado da busca. Persiste com
   * `enriched=false` (cliente pode enriquecer depois se quiser detalhes).
   */
  async saveFromSnapshot(
    snapshot: ApolloOrganization,
    user: AuthUserPayload,
  ): Promise<ProspectCompanyRow> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    if (!snapshot?.id || !snapshot.name) {
      throw new BadRequestException('Snapshot inválido: id e name são obrigatórios');
    }

    const existing = await this.knex<ProspectCompanyRow>('prospect_companies')
      .where({ organization_id: organizationId, source: 'apollo', source_id: snapshot.id })
      .first();
    if (existing) return existing;

    // Persiste localmente sem chamar enrich → sem consumir crédito.
    return this.upsertFromApollo(organizationId, userId, snapshot, false, 0);
  }

  /**
   * Mantido para compatibilidade — saveFromSearch agora apenas tenta enriquecer
   * pelo `apolloOrgId` quando o cliente NÃO tem o snapshot disponível.
   * Em prática, usar `saveFromSnapshot` é melhor.
   */
  async saveFromSearch(apolloOrgId: string, user: AuthUserPayload): Promise<ProspectCompanyRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);

    const existing = await this.knex<ProspectCompanyRow>('prospect_companies')
      .where({ organization_id: organizationId, source: 'apollo', source_id: apolloOrgId })
      .first();
    if (existing) return existing;

    // Sem snapshot e sem domain — não dá pra enriquecer sem domain.
    // Cliente deve usar saveFromSnapshot enviando o objeto da busca.
    throw new BadRequestException(
      'Para salvar a empresa, envie o snapshot completo (use POST /save com body, não :id na URL).',
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Helpers privados
  // ═══════════════════════════════════════════════════════════════════════

  private async upsertFromApollo(
    organizationId: string,
    userId: string,
    org: ApolloOrganization,
    enriched: boolean,
    creditsUsed: number,
  ): Promise<ProspectCompanyRow> {
    return this.knex.transaction(async (trx) => {
      const existing = await trx<ProspectCompanyRow>('prospect_companies')
        .where({ organization_id: organizationId, source: 'apollo', source_id: org.id })
        .first();

      const payload = {
        name: org.name,
        domain: org.primary_domain ?? null,
        website_url: org.website_url ?? null,
        linkedin_url: org.linkedin_url ?? null,
        twitter_url: org.twitter_url ?? null,
        facebook_url: org.facebook_url ?? null,
        phone: org.phone ?? null,
        industry: org.industry ?? null,
        keywords: org.keywords ?? null,
        founded_year: org.founded_year ?? null,
        employee_count: org.estimated_num_employees ?? null,
        employee_range: this.deriveEmployeeRange(org.estimated_num_employees),
        annual_revenue: org.organization_revenue ?? null,
        annual_revenue_range: org.organization_revenue_printed ?? null,
        country: org.country ?? null,
        state: org.state ?? null,
        city: org.city ?? null,
        postal_code: org.postal_code ?? null,
        address: org.street_address ?? null,
        technologies: org.technologies ?? org.technology_names ?? null,
        description: org.long_description ?? org.short_description ?? null,
        logo_url: org.logo_url ?? null,
        latest_funding_stage: org.latest_funding_stage ?? null,
        total_funding: org.total_funding ?? null,
        latest_funding_date: org.latest_funding_round_date ?? null,
        enriched,
        enriched_at: enriched ? new Date() : null,
        raw_data: JSON.stringify(org),
        updated_at: new Date(),
      };

      if (existing) {
        await trx('prospect_companies')
          .where({ id: existing.id })
          .update({
            ...payload,
            enrichment_credits_used: existing.enriched
              ? Number((existing as any).enrichment_credits_used ?? 0)
              : creditsUsed,
          });
        return trx<ProspectCompanyRow>('prospect_companies').where({ id: existing.id }).first() as Promise<ProspectCompanyRow>;
      }

      const id = randomUUID();
      await trx('prospect_companies').insert({
        id,
        organization_id: organizationId,
        source: 'apollo',
        source_id: org.id,
        ...payload,
        enrichment_credits_used: creditsUsed,
        created_by: userId,
        created_at: new Date(),
      });
      return trx<ProspectCompanyRow>('prospect_companies').where({ id }).first() as Promise<ProspectCompanyRow>;
    });
  }

  private deriveEmployeeRange(count: number | null | undefined): string | null {
    if (count == null) return null;
    if (count <= 10) return '1-10';
    if (count <= 50) return '11-50';
    if (count <= 200) return '51-200';
    if (count <= 500) return '201-500';
    if (count <= 1000) return '501-1000';
    if (count <= 5000) return '1001-5000';
    return '5000+';
  }

  /**
   * Resumo da empresa Apollo no formato que o frontend consome — sem expor raw_data.
   */
  private summarizeApollo(o: ApolloOrganization, alreadySaved: boolean) {
    return {
      apollo_id: o.id,
      name: o.name,
      domain: o.primary_domain ?? null,
      website_url: o.website_url ?? null,
      linkedin_url: o.linkedin_url ?? null,
      industry: o.industry ?? null,
      employee_count: o.estimated_num_employees ?? null,
      country: o.country ?? null,
      city: o.city ?? null,
      logo_url: o.logo_url ?? null,
      technologies: o.technologies ?? o.technology_names ?? null,
      short_description: o.short_description ?? null,
      already_saved: alreadySaved,
    };
  }
}
