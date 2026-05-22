import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { ApolloCacheService } from './apollo-cache.service';

/**
 * Tipos públicos do Apollo (formato resumido — campos completos vivem em `raw_data`).
 */
export interface ApolloOrganization {
  id: string;
  name: string;
  website_url?: string | null;
  primary_domain?: string | null;
  linkedin_url?: string | null;
  twitter_url?: string | null;
  facebook_url?: string | null;
  phone?: string | null;
  industry?: string | null;
  keywords?: string[] | null;
  founded_year?: number | null;
  estimated_num_employees?: number | null;
  organization_revenue_printed?: string | null;
  organization_revenue?: number | null;
  publicly_traded_symbol?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  postal_code?: string | null;
  street_address?: string | null;
  technologies?: string[] | null;
  technology_names?: string[] | null;
  short_description?: string | null;
  long_description?: string | null;
  logo_url?: string | null;
  latest_funding_stage?: string | null;
  total_funding?: number | null;
  latest_funding_round_date?: string | null;
}

export interface ApolloPerson {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  headline?: string | null;
  seniority?: string | null;
  departments?: string[] | null;
  subdepartments?: string[] | null;
  functions?: string[] | null;
  email?: string | null;
  email_status?: string | null;
  phone_numbers?: Array<{ raw_number: string; sanitized_number?: string; type?: string }> | null;
  linkedin_url?: string | null;
  twitter_url?: string | null;
  github_url?: string | null;
  photo_url?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  organization?: ApolloOrganization | null;
  organization_id?: string | null;
}

export interface ApolloPagination {
  page: number;
  per_page: number;
  total_entries: number;
  total_pages: number;
}

export interface CompanySearchFilters {
  q_keywords?: string;
  organization_locations?: string[];
  organization_num_employees_ranges?: string[]; // ["1,10", "11,50"]
  organization_industry_tag_ids?: string[];
  technologies?: string[];
  page?: number;
  per_page?: number;
}

export interface PeopleSearchFilters {
  q_keywords?: string;
  person_titles?: string[];
  person_seniorities?: string[]; // ['c_suite', 'vp', ...]
  person_locations?: string[];
  organization_domains?: string[];
  organization_locations?: string[];
  organization_num_employees_ranges?: string[];
  person_departments?: string[];
  page?: number;
  per_page?: number;
}

/**
 * Cliente Apollo.io.
 *
 * Decisões:
 *  - Axios com baseURL e timeout 30s. Apollo às vezes leva 10-15s em buscas pesadas.
 *  - Retry exponencial em 502/503/504 (até 3 tentativas).
 *  - Honra `Retry-After` em 429 (rate limit).
 *  - Cache em todos os endpoints (search e enrich) — search cache 24h, enrich 30d.
 *    Nota: search devolve catálogo público, atualiza-se rápido. Enrich tem dados
 *    de contato que mudam menos.
 *  - NUNCA mistura org em cache: cache key é apenas {endpoint + params}, e o
 *    dado retornado é o mesmo independente da org que consulta (são dados públicos
 *    do Apollo).
 *  - Mock mode: se `APOLLO_API_KEY` não estiver setado, retorna dados estruturados
 *    de mock — permite desenvolvimento e demo sem gastar créditos.
 */
@Injectable()
export class ApolloApiClient {
  private readonly logger = new Logger(ApolloApiClient.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string | undefined;
  private readonly mockMode: boolean;

  constructor(private readonly cache: ApolloCacheService) {
    this.apiKey = process.env.APOLLO_API_KEY?.trim() || undefined;
    this.mockMode = !this.apiKey;
    if (this.mockMode) {
      this.logger.warn(
        'APOLLO_API_KEY não configurado — operando em mock mode (sem chamadas reais).',
      );
    }

    this.http = axios.create({
      baseURL: 'https://api.apollo.io',
      timeout: 30_000,
      headers: {
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Ping de diagnóstico — bate num endpoint barato (search com 1 resultado)
   * pra validar a key sem gastar créditos. Retorna detalhes pro usuário entender
   * o que está errado quando 401/403.
   */
  async healthCheck(): Promise<{
    mode: 'mock' | 'live';
    apiKeyConfigured: boolean;
    apiKeyPrefix: string;
    httpStatus?: number;
    apolloMessage?: string;
    headersSent?: string[];
    success: boolean;
    suggestion?: string;
  }> {
    if (this.mockMode) {
      return {
        mode: 'mock',
        apiKeyConfigured: false,
        apiKeyPrefix: 'NOT_SET',
        success: false,
        suggestion: 'APOLLO_API_KEY não está no .env. Adicione e reinicie o backend.',
      };
    }

    const keyPrefix = `${this.apiKey!.slice(0, 4)}...${this.apiKey!.slice(-4)}`;
    try {
      // Endpoint mínimo: search com per_page=1 — gratuito.
      const config: AxiosRequestConfig = {
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Api-Key': this.apiKey!,
        },
      };
      // Usa organizations/search no health pra funcionar mesmo no plano Free.
      await this.http.post(
        '/api/v1/organizations/search',
        { page: 1, per_page: 1 },
        config,
      );
      return {
        mode: 'live',
        apiKeyConfigured: true,
        apiKeyPrefix: keyPrefix,
        httpStatus: 200,
        success: true,
        suggestion: 'Key OK ✓ — Apollo aceitou e respondeu.',
      };
    } catch (err) {
      const ax = err as AxiosError<{ error?: string; message?: string }>;
      const status = ax.response?.status;
      const data = ax.response?.data;
      const apolloMsg =
        (typeof data === 'object' &&
          data &&
          ('error' in data
            ? (data as { error?: string }).error
            : (data as { message?: string }).message)) ||
        ax.message;

      let suggestion = `Status ${status ?? '?'} — "${apolloMsg}".`;
      if (status === 401) {
        suggestion +=
          ' Verifique: chave digitada sem aspas/espaços no .env; chave não foi revogada; backend foi reiniciado após editar o .env.';
      } else if (status === 403) {
        suggestion +=
          ' Plano da fonte de dados pode não incluir este recurso. Faça upgrade ou marque os escopos necessários no painel do provedor.';
      } else if (status === 422) {
        suggestion += ' (Formato dos filtros inválido)';
      }

      return {
        mode: 'live',
        apiKeyConfigured: true,
        apiKeyPrefix: keyPrefix,
        httpStatus: status,
        apolloMessage: apolloMsg,
        success: false,
        suggestion,
      };
    }
  }

  /**
   * Apollo cobra créditos apenas em endpoints de enrich (people/match, organizations/enrich).
   * Search é gratuito mas tem rate limit.
   */
  private static CREDIT_COST: Record<string, number> = {
    '/api/v1/people/match': 1,
    '/api/v1/organizations/enrich': 1,
    '/api/v1/people/bulk_match': 1, // por pessoa enriquecida
    '/api/v1/organizations/bulk_enrich': 1,
  };

  creditCostOf(endpoint: string): number {
    return ApolloApiClient.CREDIT_COST[endpoint] ?? 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  async searchCompanies(
    filters: CompanySearchFilters,
  ): Promise<{ organizations: ApolloOrganization[]; pagination: ApolloPagination; fromCache: boolean }> {
    // Usa `organizations/search` (compatível com plano Free) em vez de
    // `mixed_companies/search` (exige plano Basic+).
    // Os filtros aceitos são equivalentes para nosso uso.
    const endpoint = '/api/v1/organizations/search';
    const body = this.buildCompanySearchBody(filters);
    return this.cachedPost(endpoint, body, 24 * 60 * 60 * 1000, () =>
      this.mockMode ? Promise.resolve(this.mockCompanySearch(filters)) : this.realPost(endpoint, body),
    ).then((res) => ({
      // organizations/search às vezes retorna em `accounts` ao invés de `organizations`.
      organizations: (res.data.organizations ?? res.data.accounts ?? []) as ApolloOrganization[],
      pagination: this.extractPagination(res.data),
      fromCache: res.fromCache,
    }));
  }

  async searchPeople(
    filters: PeopleSearchFilters,
  ): Promise<{ people: ApolloPerson[]; pagination: ApolloPagination; fromCache: boolean }> {
    const primary = '/api/v1/mixed_people/search';
    const fallback = '/api/v1/people/search';
    const body = this.buildPeopleSearchBody(filters);

    // Tenta primário; se 403/404 cair no fallback (endpoint mais novo).
    return this.cachedPost(primary, body, 24 * 60 * 60 * 1000, async () => {
      if (this.mockMode) return this.mockPeopleSearch(filters);
      try {
        return await this.realPost(primary, body);
      } catch (err) {
        const ax = err as { response?: { status?: number } };
        // Se for problema de plano/escopo no mixed_people, tenta endpoint atual.
        if (ax.response?.status === 403 || ax.response?.status === 404) {
          this.logger.warn(`${primary} indisponível, tentando ${fallback}...`);
          return await this.realPost(fallback, body);
        }
        throw err;
      }
    }).then((res) => ({
      people: (res.data.people ?? res.data.contacts ?? []) as ApolloPerson[],
      pagination: this.extractPagination(res.data),
      fromCache: res.fromCache,
    }));
  }

  /**
   * Revela email + phone de uma pessoa. CUSTA 1 crédito por pessoa.
   * Usa cache de 30d — mesma pessoa pesquisada de novo não gasta crédito.
   */
  async enrichPerson(input: {
    apolloPersonId?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    domain?: string;
    linkedinUrl?: string;
  }): Promise<{ person: ApolloPerson | null; fromCache: boolean }> {
    const endpoint = '/api/v1/people/match';
    const body: Record<string, unknown> = {
      reveal_personal_emails: true,
      reveal_phone_number: false, // ainda mais caro; deixar opt-in via param futuro
    };
    if (input.apolloPersonId) body.id = input.apolloPersonId;
    if (input.email) body.email = input.email;
    if (input.firstName) body.first_name = input.firstName;
    if (input.lastName) body.last_name = input.lastName;
    if (input.domain) body.domain = input.domain;
    if (input.linkedinUrl) body.linkedin_url = input.linkedinUrl;

    return this.cachedPost(endpoint, body, 30 * 24 * 60 * 60 * 1000, () =>
      this.mockMode ? Promise.resolve(this.mockPersonEnrich(input)) : this.realPost(endpoint, body),
    ).then((res) => ({
      person: (res.data.person as ApolloPerson) ?? null,
      fromCache: res.fromCache,
    }));
  }

  async enrichOrganization(input: {
    domain?: string;
    apolloOrgId?: string;
  }): Promise<{ organization: ApolloOrganization | null; fromCache: boolean }> {
    const endpoint = '/api/v1/organizations/enrich';
    const body: Record<string, unknown> = {};
    if (input.domain) body.domain = input.domain;
    if (input.apolloOrgId) body.id = input.apolloOrgId;

    return this.cachedPost(endpoint, body, 30 * 24 * 60 * 60 * 1000, () =>
      this.mockMode ? Promise.resolve(this.mockOrgEnrich(input)) : this.realPost(endpoint, body),
    ).then((res) => ({
      organization: (res.data.organization as ApolloOrganization) ?? null,
      fromCache: res.fromCache,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CORE — HTTP com retry/backoff
  // ═══════════════════════════════════════════════════════════════════════

  private async cachedPost(
    endpoint: string,
    body: Record<string, unknown>,
    ttlMs: number,
    fetcher: () => Promise<unknown>,
  ): Promise<{ data: Record<string, unknown>; fromCache: boolean }> {
    const result = await this.cache.withCache(endpoint, body, async () => {
      const data = await fetcher();
      return data;
    }, ttlMs);
    return { data: result.data as Record<string, unknown>, fromCache: result.fromCache };
  }

  /**
   * POST real ao Apollo com retry/backoff.
   *
   * Autenticação Apollo (testado em maio/2026):
   *  - Master Keys: enviar via header `X-Api-Key`
   *  - API Keys (per-app): mesma forma. Body com `api_key` é LEGACY e às vezes
   *    confunde o gateway (envia 401 mesmo com header válido).
   *  - Header DEVE ser case-sensitive `X-Api-Key`.
   *
   * Decidimos enviar EXCLUSIVAMENTE via header pra eliminar ambiguidade.
   */
  private async realPost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
    const maxRetries = 3;
    let attempt = 0;

    while (true) {
      try {
        const config: AxiosRequestConfig = {
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Api-Key': this.apiKey!,
          },
        };
        // NÃO inclui api_key no body — apenas header. Evita conflito.
        const { data } = await this.http.post(endpoint, body, config);
        return data;
      } catch (err) {
        attempt++;
        const ax = err as AxiosError<{ error?: string; message?: string; errors?: unknown }>;
        const status = ax.response?.status;
        const responseBody = ax.response?.data;
        const apolloMsg =
          (typeof responseBody === 'object' &&
            responseBody &&
            ('error' in responseBody
              ? (responseBody as { error?: string }).error
              : (responseBody as { message?: string }).message)) ||
          ax.message ||
          'Erro Apollo';

        // 429: respeita Retry-After
        if (status === 429 && attempt <= maxRetries) {
          const retryAfter = Number(ax.response?.headers['retry-after']) || 2 ** attempt;
          this.logger.warn(
            `Apollo rate limit (429) em ${endpoint}. Aguardando ${retryAfter}s (tentativa ${attempt}/${maxRetries}).`,
          );
          await this.sleep(retryAfter * 1000);
          continue;
        }

        // 5xx: retry com backoff exponencial
        if (status && status >= 500 && status < 600 && attempt <= maxRetries) {
          const wait = 2 ** attempt * 500;
          this.logger.warn(`Apollo ${status} em ${endpoint}. Retry em ${wait}ms (${attempt}/${maxRetries}).`);
          await this.sleep(wait);
          continue;
        }

        // Timeout/Network
        if (ax.code === 'ECONNABORTED' && attempt <= maxRetries) {
          this.logger.warn(`Apollo timeout em ${endpoint}. Retry ${attempt}/${maxRetries}.`);
          await this.sleep(1000 * attempt);
          continue;
        }

        // Erro definitivo — mensagem amigável + log detalhado pra debug.
        // Pra usuário final, falamos "fonte de dados" — não expomos "Apollo".
        if (status === 401 || status === 403) {
          this.logger.error(
            `Apollo ${status} em ${endpoint}. Resposta: ${JSON.stringify(responseBody ?? {}).slice(0, 500)}`,
          );

          const isPlanIssue =
            typeof apolloMsg === 'string' &&
            /not accessible.*plan|upgrade.*plan|free plan/i.test(apolloMsg);
          const isScopeIssue =
            typeof apolloMsg === 'string' &&
            /scope|permission|not authorized/i.test(apolloMsg);

          if (isPlanIssue) {
            throw new ServiceUnavailableException(
              'Este recurso não está disponível no seu plano atual. Faça upgrade para desbloquear ' +
                'buscas avançadas de pessoas e enriquecimento de contatos.',
            );
          }
          if (isScopeIssue || status === 403) {
            // 403 sem msg específica geralmente = key gerada antes do upgrade do plano.
            throw new ServiceUnavailableException(
              'A chave de integração da fonte de dados não tem permissão para este recurso. ' +
                'Se você fez upgrade do plano recentemente, regenere a chave de API no painel do provedor ' +
                '(Settings → Integrations → API → Generate New Key) e atualize o .env.',
            );
          }
          throw new ServiceUnavailableException(
            'Não conseguimos autenticar com a fonte de dados de prospecção. ' +
              'Revise a chave de API e reinicie o backend.',
          );
        }
        if (status === 422) {
          throw new BadGatewayException(`Apollo rejeitou os filtros: ${apolloMsg}`);
        }
        throw new BadGatewayException(`Apollo indisponível: ${apolloMsg}`);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Builders de body — converte filtros do nosso domínio pro formato Apollo
  // ═══════════════════════════════════════════════════════════════════════

  private buildCompanySearchBody(f: CompanySearchFilters): Record<string, unknown> {
    // Os campos diferem entre `organizations/search` e `mixed_companies/search`:
    //   - busca por texto: `q_organization_name` (organizations) vs `q_keywords` (mixed)
    //   - tecnologias: `currently_using_any_of_technology_uids` (organizations) vs `technologies` (mixed)
    // Enviamos AMBOS os formatos — Apollo ignora campos desconhecidos.
    return {
      ...(f.q_keywords
        ? {
            q_organization_name: f.q_keywords,
            q_organization_keyword_tags: [f.q_keywords],
            q_keywords: f.q_keywords,
          }
        : {}),
      ...(f.organization_locations?.length
        ? { organization_locations: f.organization_locations }
        : {}),
      ...(f.organization_num_employees_ranges?.length
        ? { organization_num_employees_ranges: f.organization_num_employees_ranges }
        : {}),
      ...(f.organization_industry_tag_ids?.length
        ? { organization_industry_tag_ids: f.organization_industry_tag_ids }
        : {}),
      ...(f.technologies?.length
        ? {
            currently_using_any_of_technology_uids: f.technologies,
            technologies: f.technologies,
          }
        : {}),
      page: f.page ?? 1,
      per_page: Math.min(f.per_page ?? 25, 100),
    };
  }

  private buildPeopleSearchBody(f: PeopleSearchFilters): Record<string, unknown> {
    // Apollo aceita `q_keywords` em mixed_people/search; também envia variantes
    // pra eventual fallback em endpoints alternativos.
    return {
      ...(f.q_keywords
        ? {
            q_keywords: f.q_keywords,
            q_person_name: f.q_keywords,
          }
        : {}),
      ...(f.person_titles?.length ? { person_titles: f.person_titles } : {}),
      ...(f.person_seniorities?.length ? { person_seniorities: f.person_seniorities } : {}),
      ...(f.person_locations?.length ? { person_locations: f.person_locations } : {}),
      ...(f.organization_domains?.length ? { organization_domains: f.organization_domains } : {}),
      ...(f.organization_locations?.length
        ? { organization_locations: f.organization_locations }
        : {}),
      ...(f.organization_num_employees_ranges?.length
        ? { organization_num_employees_ranges: f.organization_num_employees_ranges }
        : {}),
      ...(f.person_departments?.length ? { person_departments: f.person_departments } : {}),
      page: f.page ?? 1,
      per_page: Math.min(f.per_page ?? 25, 100),
    };
  }

  private extractPagination(data: Record<string, unknown>): ApolloPagination {
    const p = (data.pagination as Partial<ApolloPagination>) ?? {};
    return {
      page: p.page ?? 1,
      per_page: p.per_page ?? 25,
      total_entries: p.total_entries ?? 0,
      total_pages: p.total_pages ?? 1,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MOCK MODE — usado quando APOLLO_API_KEY não configurado.
  // Permite demo e testes sem custo. Retorna dados verossímeis baseados nos filtros.
  // ═══════════════════════════════════════════════════════════════════════

  private mockCompanySearch(f: CompanySearchFilters): Record<string, unknown> {
    const samples: ApolloOrganization[] = [
      {
        id: 'mock_org_1',
        name: 'Acme Corp',
        primary_domain: 'acme.com',
        website_url: 'https://acme.com',
        linkedin_url: 'https://linkedin.com/company/acme',
        industry: 'Software',
        estimated_num_employees: 120,
        country: 'United States',
        city: 'San Francisco',
        technologies: ['React', 'AWS', 'PostgreSQL'],
        short_description: 'Sample company for demo (Apollo not configured).',
      },
      {
        id: 'mock_org_2',
        name: 'Globex',
        primary_domain: 'globex.com',
        industry: 'SaaS',
        estimated_num_employees: 850,
        country: 'Brazil',
        city: 'São Paulo',
        technologies: ['Next.js', 'Node.js'],
      },
    ];
    const filtered = f.q_keywords
      ? samples.filter((s) => s.name.toLowerCase().includes(f.q_keywords!.toLowerCase()))
      : samples;
    return {
      organizations: filtered,
      pagination: { page: 1, per_page: 25, total_entries: filtered.length, total_pages: 1 },
    };
  }

  private mockPeopleSearch(f: PeopleSearchFilters): Record<string, unknown> {
    const samples: ApolloPerson[] = [
      {
        id: 'mock_person_1',
        name: 'Jane Doe',
        first_name: 'Jane',
        last_name: 'Doe',
        title: 'CTO',
        seniority: 'c_suite',
        email_status: 'locked',
        organization: {
          id: 'mock_org_1',
          name: 'Acme Corp',
          primary_domain: 'acme.com',
        },
        country: 'United States',
        city: 'San Francisco',
        linkedin_url: 'https://linkedin.com/in/janedoe',
      },
      {
        id: 'mock_person_2',
        name: 'John Smith',
        first_name: 'John',
        last_name: 'Smith',
        title: 'VP Engineering',
        seniority: 'vp',
        email_status: 'locked',
        organization: {
          id: 'mock_org_2',
          name: 'Globex',
          primary_domain: 'globex.com',
        },
        country: 'Brazil',
        city: 'São Paulo',
      },
    ];
    return {
      people: samples,
      pagination: { page: 1, per_page: 25, total_entries: samples.length, total_pages: 1 },
    };
  }

  private mockPersonEnrich(input: { apolloPersonId?: string }): Record<string, unknown> {
    return {
      person: {
        id: input.apolloPersonId ?? 'mock_person_enriched',
        name: 'Jane Doe',
        first_name: 'Jane',
        last_name: 'Doe',
        title: 'CTO',
        email: 'jane.doe@acme.com',
        email_status: 'verified',
        phone_numbers: [{ raw_number: '+1 555 0100', type: 'work' }],
        linkedin_url: 'https://linkedin.com/in/janedoe',
        organization: { id: 'mock_org_1', name: 'Acme Corp', primary_domain: 'acme.com' },
      },
    };
  }

  private mockOrgEnrich(input: { domain?: string; apolloOrgId?: string }): Record<string, unknown> {
    return {
      organization: {
        id: input.apolloOrgId ?? 'mock_org_enriched',
        name: 'Acme Corp',
        primary_domain: input.domain ?? 'acme.com',
        website_url: `https://${input.domain ?? 'acme.com'}`,
        industry: 'Software',
        estimated_num_employees: 120,
        founded_year: 2015,
        technologies: ['React', 'AWS', 'PostgreSQL', 'Node.js'],
        total_funding: 25_000_000,
        latest_funding_stage: 'Series B',
      },
    };
  }
}
