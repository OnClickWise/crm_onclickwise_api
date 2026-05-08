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
import { CreateJournalDto } from './dtos/create-journal.dto';
import { UpdateJournalDto } from './dtos/update-journal.dto';
import { CreateJournalDocumentDto } from './dtos/create-journal-document.dto';
import { UpdateJournalDocumentDto } from './dtos/update-journal-document.dto';

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

const ALLOWED_ROLES = ['master', 'admin', 'accountant', 'financial_operator'] as const;
const ALLOWED_READ_ROLES = [...ALLOWED_ROLES, 'sales'] as const;

/**
 * Service responsável pela gestão de Diários e Documentos contábeis.
 *
 * Decisões de design:
 *  - Toda operação valida escopo (organização + usuário + role) — multi-tenancy estrita.
 *  - Operações que alteram múltiplas linhas usam transação Knex para garantir consistência.
 *  - Queries usam JOINs/agregações para evitar N+1 (vide `listJournals`).
 *  - Nunca retorna erros opacos: lança HttpException com mensagem amigável.
 */
@Injectable()
export class JournalsService {
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

  private ensureWriteRole(role: string) {
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenException('Usuário sem permissão para gerenciar diários');
    }
  }

  private ensureReadRole(role: string) {
    if (!ALLOWED_READ_ROLES.includes(role as (typeof ALLOWED_READ_ROLES)[number])) {
      throw new ForbiddenException('Usuário sem permissão para consultar diários');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIÁRIOS
  // ═══════════════════════════════════════════════════════════════════════════

  async createJournal(dto: CreateJournalDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const exists = await trx('accounting_journals')
        .where({ organization_id: organizationId, code: dto.code })
        .first();
      if (exists) {
        throw new BadRequestException(`Já existe um diário com o código ${dto.code}`);
      }

      const id = randomUUID();
      const now = new Date();

      await trx('accounting_journals').insert({
        id,
        organization_id: organizationId,
        code: dto.code,
        name: dto.name,
        journal_type: dto.journalType,
        numbering_mode: dto.numberingMode ?? 'continuous',
        is_active: dto.isActive ?? true,
        sort_order: dto.sortOrder ?? 0,
        description: dto.description ?? null,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      });

      return trx('accounting_journals').where({ id }).first();
    });
  }

  /**
   * Lista diários com contagem de documentos e contagem de lançamentos
   * em UMA única query (LEFT JOIN + COUNT) — evita N+1.
   */
  async listJournals(
    user: AuthUserPayload,
    filters?: { isActive?: boolean; journalType?: string; query?: string },
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const query = this.knex('accounting_journals as j')
      .leftJoin(
        this.knex('accounting_journal_documents')
          .select('journal_id')
          .count<{ journal_id: string; documents_count: string }>('* as documents_count')
          .where('organization_id', organizationId)
          .groupBy('journal_id')
          .as('docs'),
        'docs.journal_id',
        'j.id',
      )
      .leftJoin(
        this.knex('accounting_journal_entries')
          .select('journal_id')
          .count<{ journal_id: string; entries_count: string }>('* as entries_count')
          .where('organization_id', organizationId)
          .whereNotNull('journal_id')
          .groupBy('journal_id')
          .as('entries'),
        'entries.journal_id',
        'j.id',
      )
      .where('j.organization_id', organizationId)
      .select(
        'j.*',
        this.knex.raw('COALESCE(docs.documents_count, 0)::int AS documents_count'),
        this.knex.raw('COALESCE(entries.entries_count, 0)::int AS entries_count'),
      )
      .orderBy([
        { column: 'j.sort_order', order: 'asc' },
        { column: 'j.code', order: 'asc' },
      ]);

    if (typeof filters?.isActive === 'boolean') {
      query.andWhere('j.is_active', filters.isActive);
    }
    if (filters?.journalType) {
      query.andWhere('j.journal_type', filters.journalType);
    }
    if (filters?.query?.trim()) {
      const q = `%${filters.query.trim()}%`;
      query.andWhere((qb) => qb.whereILike('j.code', q).orWhereILike('j.name', q));
    }

    return query;
  }

  async getJournal(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const journal = await this.knex('accounting_journals')
      .where({ id, organization_id: organizationId })
      .first();
    if (!journal) {
      throw new NotFoundException('Diário não encontrado');
    }

    const documents = await this.knex('accounting_journal_documents')
      .where({ journal_id: id, organization_id: organizationId })
      .orderBy([
        { column: 'sort_order', order: 'asc' },
        { column: 'code', order: 'asc' },
      ]);

    return { ...journal, documents };
  }

  async updateJournal(id: string, dto: UpdateJournalDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const current = await trx('accounting_journals')
        .where({ id, organization_id: organizationId })
        .first();
      if (!current) {
        throw new NotFoundException('Diário não encontrado');
      }

      if (dto.code && dto.code !== current.code) {
        const conflict = await trx('accounting_journals')
          .where({ organization_id: organizationId, code: dto.code })
          .whereNot({ id })
          .first();
        if (conflict) {
          throw new BadRequestException(`Já existe um diário com o código ${dto.code}`);
        }
      }

      // Não permitir trocar numbering_mode se já há lançamentos — quebraria a sequência.
      if (dto.numberingMode && dto.numberingMode !== current.numbering_mode) {
        const used = await trx('accounting_journal_entries')
          .where({ journal_id: id, organization_id: organizationId })
          .first();
        if (used) {
          throw new BadRequestException(
            'Não é possível alterar o modo de numeração de um diário com lançamentos.',
          );
        }
      }

      await trx('accounting_journals')
        .where({ id, organization_id: organizationId })
        .update({
          code: dto.code ?? current.code,
          name: dto.name ?? current.name,
          journal_type: dto.journalType ?? current.journal_type,
          numbering_mode: dto.numberingMode ?? current.numbering_mode,
          is_active: dto.isActive ?? current.is_active,
          sort_order: dto.sortOrder ?? current.sort_order,
          description: dto.description === undefined ? current.description : dto.description,
          updated_by: userId,
          updated_at: new Date(),
        });

      return trx('accounting_journals').where({ id }).first();
    });
  }

  async removeJournal(id: string, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const journal = await trx('accounting_journals')
        .where({ id, organization_id: organizationId })
        .first();
      if (!journal) {
        throw new NotFoundException('Diário não encontrado');
      }

      const usage = await trx('accounting_journal_entries')
        .where({ journal_id: id, organization_id: organizationId })
        .first();

      // Se já foi utilizado, não apaga — apenas inativa (regra contábil).
      if (usage) {
        await trx('accounting_journals')
          .where({ id, organization_id: organizationId })
          .update({ is_active: false, updated_by: userId, updated_at: new Date() });
        return { success: true, action: 'inactivated' };
      }

      // Apaga documentos e diário em cascata (FK CASCADE já garante).
      await trx('accounting_journals').where({ id, organization_id: organizationId }).delete();
      return { success: true, action: 'deleted' };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENTOS
  // ═══════════════════════════════════════════════════════════════════════════

  async createDocument(journalId: string, dto: CreateJournalDocumentDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const journal = await trx('accounting_journals')
        .where({ id: journalId, organization_id: organizationId })
        .first();
      if (!journal) {
        throw new NotFoundException('Diário não encontrado');
      }
      if (!journal.is_active) {
        throw new BadRequestException('Diário inativo — reative para criar documentos.');
      }

      const exists = await trx('accounting_journal_documents')
        .where({ organization_id: organizationId, journal_id: journalId, code: dto.code })
        .first();
      if (exists) {
        throw new BadRequestException(
          `Já existe um documento com o código ${dto.code} neste diário`,
        );
      }

      // Valida contas padrão se fornecidas (multi-tenant + permite postar).
      await this.validateDefaultAccount(
        trx,
        organizationId,
        dto.defaultDebitAccountId,
        'débito',
      );
      await this.validateDefaultAccount(
        trx,
        organizationId,
        dto.defaultCreditAccountId,
        'crédito',
      );

      const id = randomUUID();
      const now = new Date();

      await trx('accounting_journal_documents').insert({
        id,
        journal_id: journalId,
        organization_id: organizationId,
        code: dto.code,
        name: dto.name,
        default_debit_account_id: dto.defaultDebitAccountId ?? null,
        default_credit_account_id: dto.defaultCreditAccountId ?? null,
        allows_recapitulative: dto.allowsRecapitulative ?? false,
        is_active: dto.isActive ?? true,
        sort_order: dto.sortOrder ?? 0,
        description: dto.description ?? null,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      });

      return trx('accounting_journal_documents').where({ id }).first();
    });
  }

  async listDocuments(journalId: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const journal = await this.knex('accounting_journals')
      .where({ id: journalId, organization_id: organizationId })
      .first();
    if (!journal) {
      throw new NotFoundException('Diário não encontrado');
    }

    return this.knex('accounting_journal_documents')
      .where({ journal_id: journalId, organization_id: organizationId })
      .orderBy([
        { column: 'sort_order', order: 'asc' },
        { column: 'code', order: 'asc' },
      ]);
  }

  async updateDocument(
    journalId: string,
    documentId: string,
    dto: UpdateJournalDocumentDto,
    user: AuthUserPayload,
  ) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const current = await trx('accounting_journal_documents')
        .where({ id: documentId, journal_id: journalId, organization_id: organizationId })
        .first();
      if (!current) {
        throw new NotFoundException('Documento não encontrado');
      }

      if (dto.code && dto.code !== current.code) {
        const conflict = await trx('accounting_journal_documents')
          .where({ organization_id: organizationId, journal_id: journalId, code: dto.code })
          .whereNot({ id: documentId })
          .first();
        if (conflict) {
          throw new BadRequestException(
            `Já existe um documento com o código ${dto.code} neste diário`,
          );
        }
      }

      if (dto.defaultDebitAccountId) {
        await this.validateDefaultAccount(trx, organizationId, dto.defaultDebitAccountId, 'débito');
      }
      if (dto.defaultCreditAccountId) {
        await this.validateDefaultAccount(
          trx,
          organizationId,
          dto.defaultCreditAccountId,
          'crédito',
        );
      }

      await trx('accounting_journal_documents')
        .where({ id: documentId, organization_id: organizationId })
        .update({
          code: dto.code ?? current.code,
          name: dto.name ?? current.name,
          default_debit_account_id:
            dto.defaultDebitAccountId === undefined
              ? current.default_debit_account_id
              : dto.defaultDebitAccountId,
          default_credit_account_id:
            dto.defaultCreditAccountId === undefined
              ? current.default_credit_account_id
              : dto.defaultCreditAccountId,
          allows_recapitulative:
            dto.allowsRecapitulative ?? current.allows_recapitulative,
          is_active: dto.isActive ?? current.is_active,
          sort_order: dto.sortOrder ?? current.sort_order,
          description:
            dto.description === undefined ? current.description : dto.description,
          updated_by: userId,
          updated_at: new Date(),
        });

      return trx('accounting_journal_documents').where({ id: documentId }).first();
    });
  }

  async removeDocument(
    journalId: string,
    documentId: string,
    user: AuthUserPayload,
  ) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const doc = await trx('accounting_journal_documents')
        .where({ id: documentId, journal_id: journalId, organization_id: organizationId })
        .first();
      if (!doc) {
        throw new NotFoundException('Documento não encontrado');
      }

      const usage = await trx('accounting_journal_entries')
        .where({ document_id: documentId, organization_id: organizationId })
        .first();
      if (usage) {
        // Inativa em vez de apagar — preserva integridade dos lançamentos históricos.
        await trx('accounting_journal_documents')
          .where({ id: documentId, organization_id: organizationId })
          .update({ is_active: false, updated_by: userId, updated_at: new Date() });
        return { success: true, action: 'inactivated' };
      }

      await trx('accounting_journal_documents')
        .where({ id: documentId, organization_id: organizationId })
        .delete();
      return { success: true, action: 'deleted' };
    });
  }

  private async validateDefaultAccount(
    trx: Knex.Transaction,
    organizationId: string,
    accountId: string | undefined,
    label: string,
  ) {
    if (!accountId) return;
    const account = await trx('accounting_chart_accounts')
      .where({ id: accountId, organization_id: organizationId })
      .first();
    if (!account) {
      throw new BadRequestException(`Conta padrão de ${label} não encontrada`);
    }
    if (!account.is_active) {
      throw new BadRequestException(`Conta padrão de ${label} (${account.code}) está inativa`);
    }
    if (!account.allows_posting) {
      throw new BadRequestException(
        `Conta padrão de ${label} (${account.code}) não aceita lançamentos`,
      );
    }
  }
}
