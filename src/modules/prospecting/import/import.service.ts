import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { ProspectingPeopleService, ProspectPersonRow } from '../people/people.service';

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

const ALLOWED_ROLES = ['master', 'admin', 'sales', 'sdr', 'manager'] as const;

export interface ImportResult {
  prospectPersonId: string;
  leadId: string;
  status: 'created' | 'already_imported';
  email: string | null;
  fullName: string;
}

/**
 * Importa um prospect (pessoa) para o módulo de Leads do CRM.
 *
 * Regras:
 *  - Requer pessoa enriquecida com email (sem email não dá pra criar lead).
 *  - Se a pessoa já foi importada antes (existe `prospect_lead_links`), retorna
 *    o lead_id existente (idempotente — não cria duplicata).
 *  - Auto-enrich: se ainda não foi enriquecida, cliente deve enriquecer ANTES
 *    (não automatizamos pra que o usuário esteja ciente do consumo de crédito).
 *  - Cria lead com `source = 'prospecting'` pra rastrear origem.
 */
@Injectable()
export class ProspectingImportService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly people: ProspectingPeopleService,
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
      throw new ForbiddenException('Sem permissão para importar prospects ao CRM');
    }
  }

  async importPersonToLead(
    prospectPersonId: string,
    user: AuthUserPayload,
    options?: { assignedUserId?: string; status?: string; description?: string },
  ): Promise<ImportResult> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    return this.knex.transaction(async (trx) => {
      // 1) Carrega prospect.
      const person = await trx<ProspectPersonRow>('prospect_people')
        .where({ id: prospectPersonId, organization_id: organizationId })
        .first();
      if (!person) throw new NotFoundException('Prospect não encontrado');

      if (!person.enriched) {
        throw new BadRequestException(
          'Prospect ainda não foi enriquecido. Enriqueça antes de importar (consome crédito).',
        );
      }
      if (!person.email) {
        throw new BadRequestException(
          'Prospect não possui e-mail. Sem e-mail não é possível criar Lead no CRM.',
        );
      }

      // 2) Verifica se já foi importado (idempotência).
      const existingLink = await trx('prospect_lead_links')
        .where({ organization_id: organizationId, person_id: prospectPersonId })
        .first();
      if (existingLink) {
        return {
          prospectPersonId,
          leadId: existingLink.lead_id,
          status: 'already_imported' as const,
          email: person.email,
          fullName: person.full_name,
        };
      }

      // 3) Verifica se já existe lead com esse e-mail (CRM atual já tem).
      // Se existir, vincula ao lead existente em vez de criar duplicado.
      const existingLead = await trx('leads')
        .where({ organization_id: organizationId, email: person.email })
        .first();

      let leadId: string;
      if (existingLead) {
        leadId = existingLead.id;
      } else {
        // 4) Cria lead novo. Schema mínimo conforme CreateLeadDto.
        leadId = randomUUID();
        const now = new Date();
        await trx('leads').insert({
          id: leadId,
          organization_id: organizationId,
          name: person.full_name,
          email: person.email,
          phone: person.phone ?? null,
          assigned_user_id: options?.assignedUserId ?? userId,
          source: 'prospecting',
          status: options?.status ?? 'new',
          location: [person.city, person.country].filter(Boolean).join(', ') || null,
          interest: person.title ?? null,
          description:
            options?.description ??
            `Importado da Prospecção: ${person.title ?? ''} @ ${person.company_name ?? 'empresa desconhecida'}`,
          show_on_pipeline: true,
          created_at: now,
          updated_at: now,
        });
      }

      // 5) Cria link prospect ↔ lead + marca prospect como convertido.
      await trx('prospect_lead_links').insert({
        id: randomUUID(),
        organization_id: organizationId,
        person_id: prospectPersonId,
        lead_id: leadId,
        created_by: userId,
        created_at: new Date(),
      });

      await trx('prospect_people')
        .where({ id: prospectPersonId, organization_id: organizationId })
        .update({
          converted_to_lead: true,
          lead_id: leadId,
          updated_at: new Date(),
        });

      return {
        prospectPersonId,
        leadId,
        status: existingLead ? 'already_imported' : 'created',
        email: person.email,
        fullName: person.full_name,
      };
    });
  }

  /**
   * Importa MÚLTIPLAS pessoas de uma vez (bulk).
   * Retorna lista de resultados — não falha o batch inteiro se uma der erro.
   */
  async importManyToLeads(
    prospectPersonIds: string[],
    user: AuthUserPayload,
    options?: { assignedUserId?: string; status?: string },
  ): Promise<{
    results: Array<ImportResult | { prospectPersonId: string; status: 'failed'; reason: string }>;
    summary: { created: number; alreadyImported: number; failed: number };
  }> {
    if (!prospectPersonIds.length) {
      throw new BadRequestException('Lista de prospects vazia');
    }
    const results: Array<
      ImportResult | { prospectPersonId: string; status: 'failed'; reason: string }
    > = [];
    let created = 0;
    let alreadyImported = 0;
    let failed = 0;

    for (const id of prospectPersonIds) {
      try {
        const r = await this.importPersonToLead(id, user, options);
        results.push(r);
        if (r.status === 'created') created++;
        else alreadyImported++;
      } catch (err) {
        failed++;
        const reason = err instanceof Error ? err.message : 'Erro desconhecido';
        results.push({ prospectPersonId: id, status: 'failed', reason });
      }
    }

    return { results, summary: { created, alreadyImported, failed } };
  }
}
