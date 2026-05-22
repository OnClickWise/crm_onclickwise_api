import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { ApolloApiClient, ApolloPerson } from '../apollo/apollo-api.client';
import { ProspectingCreditsService } from '../credits/credits.service';

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

/**
 * Departamentos exibidos como abas na UI. Cada um mapeia para um conjunto de
 * filtros Apollo (`person_departments` ou `person_seniorities`).
 *
 * Apollo aceita departments normalizados: executive, engineering, design,
 * marketing, sales, finance, operations, human_resources, support, legal,
 * consulting, education, information_technology, data_science,
 * product_management, business_development, media_communication.
 */
export const DEPARTMENT_BUCKETS: Record<
  string,
  { label: string; departments?: string[]; seniorities?: string[]; order: number }
> = {
  leadership: {
    label: 'Diretoria',
    seniorities: ['owner', 'founder', 'c_suite', 'partner'],
    order: 1,
  },
  sales: {
    label: 'Comercial',
    departments: ['sales', 'business_development'],
    order: 2,
  },
  marketing: {
    label: 'Marketing',
    departments: ['marketing', 'media_communication'],
    order: 3,
  },
  engineering: {
    label: 'Engenharia & TI',
    departments: ['engineering', 'information_technology', 'data_science'],
    order: 4,
  },
  product: {
    label: 'Produto & Design',
    departments: ['product_management', 'design'],
    order: 5,
  },
  finance: {
    label: 'Financeiro/Compras',
    departments: ['finance'],
    order: 6,
  },
  operations: {
    label: 'Operações',
    departments: ['operations', 'support'],
    order: 7,
  },
  hr: {
    label: 'Recursos Humanos',
    departments: ['human_resources'],
    order: 8,
  },
  legal: {
    label: 'Jurídico',
    departments: ['legal'],
    order: 9,
  },
};

export type DepartmentBucketId = keyof typeof DEPARTMENT_BUCKETS;

export interface CompanyTeamPerson {
  apollo_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  seniority: string | null;
  departments: string[];
  email_status: string;
  linkedin_url: string | null;
  photo_url: string | null;
  city: string | null;
  country: string | null;
  // Se já está no banco local, vem populado:
  local_id: string | null;
  enriched: boolean;
  email: string | null;
  phone: string | null;
  converted_to_lead: boolean;
}

export interface CompanyTeamBucket {
  id: string;
  label: string;
  count: number;
  people: CompanyTeamPerson[];
}

/**
 * Service para construir a "tela de equipe" de uma empresa (estilo Lusha):
 * mostra funcionários agrupados por departamento, com indicação de quem já
 * está enriquecido / no CRM.
 *
 * Estratégia:
 *  - 1 chamada Apollo `mixed_people/search` por bucket (paralelo).
 *  - Cache de 24h por bucket — repetir busca da mesma empresa é gratuito.
 *  - NÃO consome créditos de enrichment (só search). Email/phone só liberam
 *    quando o usuário clica em "Revelar contato" (people/match → 1 crédito).
 */
@Injectable()
export class CompanyTeamService {
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
   * Carrega o "organograma" da empresa por departamento.
   *
   * @param companyLocalId UUID local em prospect_companies
   * @param onlyBuckets    Filtra quais buckets carregar (default: todos)
   * @param perBucket      Máximo de pessoas por bucket (default: 10)
   */
  async getTeam(
    companyLocalId: string,
    user: AuthUserPayload,
    options?: { onlyBuckets?: DepartmentBucketId[]; perBucket?: number },
  ): Promise<{
    company: { id: string; name: string; domain: string | null };
    buckets: CompanyTeamBucket[];
    fromCache: boolean;
  }> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    const company = await this.knex('prospect_companies')
      .where({ id: companyLocalId, organization_id: organizationId })
      .first();
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.domain && !company.source_id) {
      throw new BadRequestException(
        'Empresa precisa de domínio ou ID externo para carregar equipe',
      );
    }

    const perBucket = Math.min(options?.perBucket ?? 10, 50);
    const bucketsToLoad = (options?.onlyBuckets ??
      (Object.keys(DEPARTMENT_BUCKETS) as DepartmentBucketId[]))
      .filter((id) => DEPARTMENT_BUCKETS[id])
      .sort((a, b) => DEPARTMENT_BUCKETS[a].order - DEPARTMENT_BUCKETS[b].order);

    // Chamadas paralelas (cache 24h reduz custo a zero em re-consultas)
    const results = await Promise.all(
      bucketsToLoad.map(async (bucketId) => {
        const cfg = DEPARTMENT_BUCKETS[bucketId];
        const filters = {
          organization_domains: company.domain ? [company.domain] : undefined,
          person_departments: cfg.departments,
          person_seniorities: cfg.seniorities,
          per_page: perBucket,
          page: 1,
        };

        try {
          const apolloResult = await this.apollo.searchPeople(filters);
          return { bucketId, label: cfg.label, people: apolloResult.people, fromCache: apolloResult.fromCache };
        } catch {
          // Plano sem acesso, rate limit, etc — retorna bucket vazio.
          return { bucketId, label: cfg.label, people: [] as ApolloPerson[], fromCache: false };
        }
      }),
    );

    // Marca quais pessoas já estão salvas localmente
    const allApolloIds = results.flatMap((r) => r.people.map((p) => p.id)).filter(Boolean);
    const localMap = new Map<string, {
      id: string;
      enriched: boolean;
      email: string | null;
      phone: string | null;
      converted_to_lead: boolean;
    }>();
    if (allApolloIds.length > 0) {
      const localRows = await this.knex('prospect_people')
        .where({ organization_id: organizationId, source: 'apollo' })
        .whereIn('source_id', allApolloIds)
        .select('id', 'source_id', 'enriched', 'email', 'phone', 'converted_to_lead');
      for (const row of localRows) {
        if (row.source_id) {
          localMap.set(row.source_id, {
            id: row.id,
            enriched: !!row.enriched,
            email: row.email,
            phone: row.phone,
            converted_to_lead: !!row.converted_to_lead,
          });
        }
      }
    }

    const buckets: CompanyTeamBucket[] = results.map((r) => ({
      id: r.bucketId,
      label: r.label,
      count: r.people.length,
      people: r.people.map((p) => {
        const local = localMap.get(p.id);
        return {
          apollo_id: p.id,
          full_name: p.name,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
          title: p.title ?? null,
          seniority: p.seniority ?? null,
          departments: p.departments ?? [],
          email_status: p.email_status ?? 'locked',
          linkedin_url: p.linkedin_url ?? null,
          photo_url: p.photo_url ?? null,
          city: p.city ?? null,
          country: p.country ?? null,
          local_id: local?.id ?? null,
          enriched: local?.enriched ?? false,
          email: local?.email ?? null,
          phone: local?.phone ?? null,
          converted_to_lead: local?.converted_to_lead ?? false,
        };
      }),
    }));

    // Audit log — apenas 1 entry agregada
    const totalPeople = buckets.reduce((s, b) => s + b.count, 0);
    const anyFromCache = results.some((r) => r.fromCache);
    await this.credits.logSearch(
      organizationId,
      userId,
      'company_team',
      { companyId: companyLocalId, buckets: bucketsToLoad, perBucket },
      totalPeople,
      0,
      anyFromCache,
    );

    return {
      company: { id: company.id, name: company.name, domain: company.domain },
      buckets,
      fromCache: anyFromCache,
    };
  }
}
