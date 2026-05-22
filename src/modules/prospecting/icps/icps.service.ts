import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { CreateIcpDto, UpdateIcpDto } from './dtos/icp.dto';

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

export interface IcpRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  is_active: boolean;
  criteria: Record<string, unknown>;
  weights: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface ProspectPersonForScoring {
  seniority: string | null;
  departments: string[] | null;
  title: string | null;
  country: string | null;
  company_id: string | null;
}

interface CompanyForScoring {
  industry: string | null;
  employee_count: number | null;
  country: string | null;
  technologies: string[] | null;
}

/**
 * Score ICP: 0-100 baseado em quão bem o prospect bate com critérios + pesos.
 *
 * Cada critério dá um "match parcial" (0 ou 1) e contribui com seu PESO
 * proporcional pro score total. Se o ICP não define um critério, ele é
 * ignorado (não penaliza nem ajuda).
 *
 * Exemplo: ICP define industry='SaaS' (peso 30) + seniority='c_suite' (peso 20).
 * Pessoa CTO de empresa SaaS → score = (30+20)/(30+20) * 100 = 100.
 * Pessoa CTO de empresa Retail → score = 20/(30+20) * 100 = 40.
 */
@Injectable()
export class ProspectingIcpsService {
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
      throw new ForbiddenException('Sem permissão para gerenciar ICPs');
    }
  }

  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para consultar ICPs');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async list(user: AuthUserPayload, includeInactive = false): Promise<IcpRow[]> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);
    const query = this.knex<IcpRow>('prospect_icps')
      .where({ organization_id: organizationId })
      .orderBy([
        { column: 'is_default', order: 'desc' },
        { column: 'is_active', order: 'desc' },
        { column: 'name', order: 'asc' },
      ]);
    if (!includeInactive) query.andWhere({ is_active: true });
    return query;
  }

  async getById(id: string, user: AuthUserPayload): Promise<IcpRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);
    const row = await this.knex<IcpRow>('prospect_icps')
      .where({ id, organization_id: organizationId })
      .first();
    if (!row) throw new NotFoundException('ICP não encontrado');
    return row;
  }

  async create(dto: CreateIcpDto, user: AuthUserPayload): Promise<IcpRow> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      // Se vai ser default, desmarca outros defaults
      if (dto.isDefault) {
        await trx('prospect_icps')
          .where({ organization_id: organizationId, is_default: true })
          .update({ is_default: false });
      }

      const id = randomUUID();
      const now = new Date();
      await trx('prospect_icps').insert({
        id,
        organization_id: organizationId,
        name: dto.name,
        description: dto.description ?? null,
        color: dto.color ?? '#10B981',
        is_default: dto.isDefault ?? false,
        is_active: dto.isActive ?? true,
        criteria: JSON.stringify(dto.criteria ?? {}),
        weights: JSON.stringify(dto.weights ?? {}),
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      });

      return trx<IcpRow>('prospect_icps').where({ id }).first() as Promise<IcpRow>;
    });
  }

  async update(id: string, dto: UpdateIcpDto, user: AuthUserPayload): Promise<IcpRow> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const existing = await trx<IcpRow>('prospect_icps')
        .where({ id, organization_id: organizationId })
        .first();
      if (!existing) throw new NotFoundException('ICP não encontrado');

      if (dto.isDefault) {
        await trx('prospect_icps')
          .where({ organization_id: organizationId, is_default: true })
          .whereNot({ id })
          .update({ is_default: false });
      }

      await trx('prospect_icps')
        .where({ id, organization_id: organizationId })
        .update({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description ?? null }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.isDefault !== undefined && { is_default: dto.isDefault }),
          ...(dto.isActive !== undefined && { is_active: dto.isActive }),
          ...(dto.criteria !== undefined && { criteria: JSON.stringify(dto.criteria) }),
          ...(dto.weights !== undefined && { weights: JSON.stringify(dto.weights) }),
          updated_by: userId,
          updated_at: new Date(),
        });

      return trx<IcpRow>('prospect_icps').where({ id }).first() as Promise<IcpRow>;
    });
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);
    const deleted = await this.knex('prospect_icps')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('ICP não encontrado');
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SCORING ENGINE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Recalcula o fit_score de uma pessoa específica usando o ICP default.
   * Retorna o score atualizado (ou null se não há ICP ativo).
   */
  async recalculatePerson(
    personId: string,
    user: AuthUserPayload,
  ): Promise<{ score: number | null; icpId: string | null }> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    const defaultIcp = await this.knex<IcpRow>('prospect_icps')
      .where({ organization_id: organizationId, is_default: true, is_active: true })
      .first();
    if (!defaultIcp) return { score: null, icpId: null };

    const person = await this.knex<ProspectPersonForScoring & { id: string }>('prospect_people')
      .where({ id: personId, organization_id: organizationId })
      .select('id', 'seniority', 'departments', 'title', 'country', 'company_id')
      .first();
    if (!person) throw new NotFoundException('Pessoa não encontrada');

    let company: CompanyForScoring | undefined;
    if (person.company_id) {
      const c = await this.knex<CompanyForScoring>('prospect_companies')
        .where({ id: person.company_id, organization_id: organizationId })
        .select('industry', 'employee_count', 'country', 'technologies')
        .first();
      company = c;
    }

    const score = this.computeScore(defaultIcp, person, company);

    await this.knex('prospect_people').where({ id: personId }).update({
      fit_score: score,
      fit_score_icp_id: defaultIcp.id,
      fit_score_at: new Date(),
    });

    return { score, icpId: defaultIcp.id };
  }

  /**
   * Recalcula scores de TODAS as pessoas da org usando o ICP default.
   * Usado quando muda o ICP default ou quando uma org importa muitos prospects.
   * Retorna stats da operação.
   */
  async recalculateAll(user: AuthUserPayload): Promise<{
    icpUsed: string | null;
    peopleScored: number;
    avgScore: number;
  }> {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    const defaultIcp = await this.knex<IcpRow>('prospect_icps')
      .where({ organization_id: organizationId, is_default: true, is_active: true })
      .first();
    if (!defaultIcp) return { icpUsed: null, peopleScored: 0, avgScore: 0 };

    // JOIN pra trazer dados da empresa em uma só query (sem N+1).
    const rows = await this.knex<ProspectPersonForScoring & { id: string } & CompanyForScoring>(
      'prospect_people as p',
    )
      .leftJoin('prospect_companies as c', 'p.company_id', 'c.id')
      .where('p.organization_id', organizationId)
      .select(
        'p.id',
        'p.seniority',
        'p.departments',
        'p.title',
        'p.country',
        'p.company_id',
        'c.industry',
        'c.employee_count',
        { 'company_country': 'c.country' },
        'c.technologies',
      );

    if (rows.length === 0) {
      return { icpUsed: defaultIcp.id, peopleScored: 0, avgScore: 0 };
    }

    let totalScore = 0;
    const now = new Date();

    // Bulk update via query individual (Postgres não tem UPDATE multi-row eficiente
    // sem CASE/WHEN trabalhoso — usamos transação com batch).
    await this.knex.transaction(async (trx) => {
      for (const row of rows) {
        const score = this.computeScore(
          defaultIcp,
          row,
          row.company_id
            ? {
                industry: row.industry,
                employee_count: row.employee_count,
                country: (row as { company_country?: string | null }).company_country ?? null,
                technologies: row.technologies,
              }
            : undefined,
        );
        totalScore += score;
        await trx('prospect_people').where({ id: row.id }).update({
          fit_score: score,
          fit_score_icp_id: defaultIcp.id,
          fit_score_at: now,
        });
      }
    });

    return {
      icpUsed: defaultIcp.id,
      peopleScored: rows.length,
      avgScore: Math.round(totalScore / rows.length),
    };
  }

  /**
   * Algoritmo público — usado tanto em recalculate quanto em UI preview ("simular score").
   */
  computeScore(
    icp: IcpRow,
    person: ProspectPersonForScoring,
    company?: CompanyForScoring,
  ): number {
    // Normaliza criteria/weights (vêm como JSON do banco).
    const c = (typeof icp.criteria === 'string' ? JSON.parse(icp.criteria) : icp.criteria) as {
      industries?: string[];
      employeeMin?: number;
      employeeMax?: number;
      countries?: string[];
      technologies?: string[];
      seniorities?: string[];
      departments?: string[];
      keywordsInTitle?: string[];
    };
    const w = (typeof icp.weights === 'string' ? JSON.parse(icp.weights) : icp.weights) as {
      industry?: number;
      employeeSize?: number;
      country?: number;
      technology?: number;
      seniority?: number;
      department?: number;
      titleKeyword?: number;
    };

    const checks: Array<{ matches: boolean; weight: number }> = [];

    // Industry
    if (c.industries?.length && company?.industry) {
      checks.push({
        matches: c.industries.some((i) =>
          company.industry!.toLowerCase().includes(i.toLowerCase()),
        ),
        weight: w.industry ?? 20,
      });
    }
    // Employee size
    if ((c.employeeMin != null || c.employeeMax != null) && company?.employee_count != null) {
      const min = c.employeeMin ?? 0;
      const max = c.employeeMax ?? Number.MAX_SAFE_INTEGER;
      checks.push({
        matches: company.employee_count >= min && company.employee_count <= max,
        weight: w.employeeSize ?? 15,
      });
    }
    // Country (preferência: country da pessoa, fallback empresa)
    if (c.countries?.length) {
      const target = (person.country ?? company?.country ?? '').toLowerCase();
      if (target) {
        checks.push({
          matches: c.countries.some((co) => target.includes(co.toLowerCase())),
          weight: w.country ?? 10,
        });
      }
    }
    // Technologies
    if (c.technologies?.length && company?.technologies?.length) {
      checks.push({
        matches: c.technologies.some((tech) =>
          company.technologies!.some((t) => t.toLowerCase().includes(tech.toLowerCase())),
        ),
        weight: w.technology ?? 15,
      });
    }
    // Seniority
    if (c.seniorities?.length && person.seniority) {
      checks.push({
        matches: c.seniorities.includes(person.seniority),
        weight: w.seniority ?? 15,
      });
    }
    // Department
    if (c.departments?.length && person.departments?.length) {
      checks.push({
        matches: c.departments.some((d) => person.departments!.includes(d)),
        weight: w.department ?? 10,
      });
    }
    // Title keywords
    if (c.keywordsInTitle?.length && person.title) {
      const t = person.title.toLowerCase();
      checks.push({
        matches: c.keywordsInTitle.some((k) => t.includes(k.toLowerCase())),
        weight: w.titleKeyword ?? 15,
      });
    }

    if (checks.length === 0) return 50; // ICP sem critérios aplicáveis = neutral

    const totalWeight = checks.reduce((s, x) => s + x.weight, 0);
    const matchedWeight = checks.filter((x) => x.matches).reduce((s, x) => s + x.weight, 0);
    if (totalWeight === 0) return 50;
    return Math.round((matchedWeight / totalWeight) * 100);
  }
}
