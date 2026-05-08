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
import { CreateJournalEntryDto } from '../dtos/create-journal-entry.dto';
import { ReverseJournalEntryDto } from '../dtos/reverse-journal-entry.dto';

@Injectable()
export class AccountingService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: any): { organizationId: string; userId: string; role: string } {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuario sem organizacao vinculada');
    }

    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user?.role || '').toLowerCase(),
    };
  }

  private ensureRole(role: string, allowed: string[]) {
    if (!allowed.includes(role)) {
      throw new ForbiddenException('Usuario sem permissao para operacao contabil');
    }
  }

  private toCents(value: number): number {
    return Math.round(Number(value) * 100);
  }

  private assertBalanced(lines: CreateJournalEntryDto['lines']) {
    const debitCents = lines
      .filter((line) => line.lineType === 'debit')
      .reduce((sum, line) => sum + this.toCents(line.amount), 0);

    const creditCents = lines
      .filter((line) => line.lineType === 'credit')
      .reduce((sum, line) => sum + this.toCents(line.amount), 0);

    if (debitCents <= 0 || creditCents <= 0) {
      throw new BadRequestException('Debitos e creditos devem ser maiores que zero');
    }

    if (debitCents !== creditCents) {
      throw new BadRequestException(
        `Partida dobrada invalida. Debitos (${(debitCents / 100).toFixed(2)}) e creditos (${(creditCents / 100).toFixed(2)}) devem ser iguais`,
      );
    }

    return debitCents;
  }

  private async validateAccounts(trx: Knex.Transaction, organizationId: string, accountIds: string[]) {
    const uniqueAccountIds = Array.from(new Set(accountIds));

    const accounts = await trx('accounting_chart_accounts')
      .whereIn('id', uniqueAccountIds)
      .andWhere({ organization_id: organizationId });

    if (accounts.length !== uniqueAccountIds.length) {
      throw new NotFoundException('Uma ou mais contas contabil nao foram encontradas para a organizacao');
    }

    for (const account of accounts) {
      if (!account.is_active) {
        throw new BadRequestException(`Conta contabil inativa: ${account.code}`);
      }

      if (!account.allows_posting) {
        throw new BadRequestException(`Conta contabil nao aceita lancamentos: ${account.code}`);
      }
    }
  }

  async createJournalEntry(dto: CreateJournalEntryDto, user: any) {
    const { organizationId, userId, role } = this.getScope(user);

    // Segregacao RBAC basica: operador financeiro e contador podem lancar.
    this.ensureRole(role, ['master', 'admin', 'accountant', 'financial_operator']);

    return this.knex.transaction(async (trx) => {
      const totalDebitCents = this.assertBalanced(dto.lines);
      const accountIds = dto.lines.map((line) => line.accountId);

      await this.validateAccounts(trx, organizationId, accountIds);

      const now = new Date();
      const entryId = randomUUID();
      const entryDate = dto.entryDate ? new Date(dto.entryDate) : now;

      // Resolve diário/documento + numeração sequencial (se informados).
      // Importante: tudo dentro da MESMA transação para evitar duas escritas
      // pegarem o mesmo journal_number sob concorrência.
      const journalContext = await this.resolveJournalContext(
        trx,
        organizationId,
        dto.journalId,
        dto.documentId,
        entryDate,
      );

      let transactionId = dto.transactionId;

      if (transactionId) {
        const transaction = await trx('finance_transactions')
          .where({ id: transactionId, organization_id: organizationId })
          .first();

        if (!transaction) {
          throw new NotFoundException('Transacao financeira de referencia nao encontrada');
        }
      } else {
        transactionId = randomUUID();

        await trx('finance_transactions').insert({
          id: transactionId,
          organization_id: organizationId,
          transaction_type: 'journal_adjustment',
          status: 'posted',
          occurred_at: entryDate,
          currency: 'BRL',
          amount: (totalDebitCents / 100).toFixed(2),
          description: dto.description,
          reference_type: dto.referenceType ?? null,
          reference_id: dto.referenceId ?? null,
          created_by: userId,
          updated_by: userId,
          posted_at: now,
          created_at: now,
          updated_at: now,
        });
      }

      await trx('accounting_journal_entries').insert({
        id: entryId,
        organization_id: organizationId,
        transaction_id: transactionId,
        status: 'posted',
        entry_date: entryDate,
        description: dto.description,
        reference_type: dto.referenceType ?? null,
        reference_id: dto.referenceId ?? null,
        journal_id: journalContext?.journalId ?? null,
        document_id: journalContext?.documentId ?? null,
        journal_number: journalContext?.journalNumber ?? null,
        journal_period: journalContext?.journalPeriod ?? null,
        created_by: userId,
        updated_by: userId,
        posted_by: userId,
        posted_at: now,
        created_at: now,
        updated_at: now,
      });

      const linesToInsert = dto.lines.map((line) => ({
        id: randomUUID(),
        journal_entry_id: entryId,
        organization_id: organizationId,
        account_id: line.accountId,
        line_type: line.lineType,
        amount: Number(line.amount).toFixed(2),
        memo: line.memo ?? null,
        created_by: userId,
        reference_type: dto.referenceType ?? null,
        reference_id: dto.referenceId ?? null,
        created_at: now,
      }));

      await trx('accounting_journal_entry_lines').insert(linesToInsert);

      if (dto.transactionId) {
        await trx('finance_transactions')
          .where({ id: dto.transactionId, organization_id: organizationId })
          .update({
            status: 'posted',
            posted_at: now,
            updated_by: userId,
            updated_at: now,
          });
      }

      const journalEntry = await trx('accounting_journal_entries')
        .where({ id: entryId })
        .first();

      const lines = await trx('accounting_journal_entry_lines')
        .where({ journal_entry_id: entryId })
        .orderBy('created_at', 'asc');

      return {
        journalEntry,
        lines,
        totals: {
          debit: Number((totalDebitCents / 100).toFixed(2)),
          credit: Number((totalDebitCents / 100).toFixed(2)),
        },
      };
    });
  }

  async listJournalEntries(
    user: any,
    filters: {
      limit?: number;
      startDate?: string;
      endDate?: string;
      status?: string;
      accountId?: string;
      referenceType?: string;
      journalId?: string;
      documentId?: string;
    } = {},
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role, ['master', 'admin', 'accountant', 'financial_operator']);

    const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));

    // JOIN com diário/documento em UMA query — evita N+1 ao renderizar lista.
    const query = this.knex('accounting_journal_entries as je')
      .leftJoin('accounting_journals as j', 'je.journal_id', 'j.id')
      .leftJoin('accounting_journal_documents as jd', 'je.document_id', 'jd.id')
      .where('je.organization_id', organizationId)
      .select(
        'je.*',
        'j.code as journal_code',
        'j.name as journal_name',
        'j.journal_type as journal_type',
        'jd.code as document_code',
        'jd.name as document_name',
      );

    if (filters.status) query.andWhere('je.status', filters.status);
    if (filters.startDate) query.andWhere('je.entry_date', '>=', new Date(filters.startDate));
    if (filters.endDate) query.andWhere('je.entry_date', '<=', new Date(filters.endDate));
    if (filters.referenceType) query.andWhere('je.reference_type', filters.referenceType);
    if (filters.journalId) query.andWhere('je.journal_id', filters.journalId);
    if (filters.documentId) query.andWhere('je.document_id', filters.documentId);
    if (filters.accountId) {
      query.whereIn(
        'je.id',
        this.knex('accounting_journal_entry_lines')
          .where({ account_id: filters.accountId, organization_id: organizationId })
          .select('journal_entry_id'),
      );
    }

    return query.orderBy('je.entry_date', 'desc').limit(limit);
  }

  async getJournalEntry(id: string, user: any) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role, ['master', 'admin', 'accountant', 'financial_operator']);

    // Carrega entry + diário + documento em UMA query.
    const entry = await this.knex('accounting_journal_entries as je')
      .leftJoin('accounting_journals as j', 'je.journal_id', 'j.id')
      .leftJoin('accounting_journal_documents as jd', 'je.document_id', 'jd.id')
      .where({ 'je.id': id, 'je.organization_id': organizationId })
      .select(
        'je.*',
        'j.code as journal_code',
        'j.name as journal_name',
        'j.journal_type as journal_type',
        'jd.code as document_code',
        'jd.name as document_name',
      )
      .first();

    if (!entry) throw new NotFoundException('Lançamento contábil não encontrado');

    const lines = await this.knex('accounting_journal_entry_lines as jl')
      .join('accounting_chart_accounts as ca', 'jl.account_id', 'ca.id')
      .where({ 'jl.journal_entry_id': id, 'jl.organization_id': organizationId })
      .select(
        'jl.id',
        'jl.line_type',
        'jl.amount',
        'jl.memo',
        'jl.account_id',
        'ca.code as account_code',
        'ca.name as account_name',
        'ca.account_type',
        'ca.normal_balance',
      )
      .orderByRaw("jl.line_type = 'debit' DESC");

    const totalDebit = lines
      .filter((l) => l.line_type === 'debit')
      .reduce((s, l) => s + Number(l.amount), 0);

    return { ...entry, lines, totals: { debit: totalDebit, credit: totalDebit } };
  }

  /**
   * Resolve diário/documento e calcula próximo número sequencial.
   *
   * - Se journalId não vier: retorna null (lançamento sem diário, modo livre).
   * - Se documentId vier: valida que pertence ao journalId.
   * - O período (`journal_period`) usa "YYYY-MM" para numbering_mode=monthly
   *   ou "YYYY" para continuous, permitindo MAX(journal_number) por janela.
   *
   * Importante: deve ser chamado dentro da MESMA transação que insere o entry.
   */
  private async resolveJournalContext(
    trx: Knex.Transaction,
    organizationId: string,
    journalId: string | undefined,
    documentId: string | undefined,
    entryDate: Date,
  ): Promise<{
    journalId: string;
    documentId: string | null;
    journalNumber: number;
    journalPeriod: string;
  } | null> {
    if (!journalId) {
      if (documentId) {
        throw new BadRequestException('Documento informado sem diário associado');
      }
      return null;
    }

    const journal = await trx('accounting_journals')
      .where({ id: journalId, organization_id: organizationId })
      .first();
    if (!journal) {
      throw new NotFoundException('Diário informado não encontrado');
    }
    if (!journal.is_active) {
      throw new BadRequestException(`Diário ${journal.code} está inativo`);
    }

    let resolvedDocumentId: string | null = null;
    if (documentId) {
      const document = await trx('accounting_journal_documents')
        .where({ id: documentId, organization_id: organizationId, journal_id: journalId })
        .first();
      if (!document) {
        throw new NotFoundException('Documento não encontrado neste diário');
      }
      if (!document.is_active) {
        throw new BadRequestException(`Documento ${document.code} está inativo`);
      }
      resolvedDocumentId = documentId;
    }

    const journalPeriod = this.computeJournalPeriod(journal.numbering_mode, entryDate);

    // Calcula o próximo número dentro do diário/período.
    // O índice (organization_id, journal_id, journal_period, journal_number) acelera essa consulta.
    const lastRow = await trx('accounting_journal_entries')
      .where({
        organization_id: organizationId,
        journal_id: journalId,
        journal_period: journalPeriod,
      })
      .max<{ max: number | string | null }[]>('journal_number as max')
      .first();

    const lastNumber = Number(lastRow?.max ?? 0);
    const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;

    return {
      journalId,
      documentId: resolvedDocumentId,
      journalNumber: nextNumber,
      journalPeriod,
    };
  }

  private computeJournalPeriod(numberingMode: 'continuous' | 'monthly', entryDate: Date): string {
    const year = entryDate.getUTCFullYear();
    if (numberingMode === 'monthly') {
      const month = String(entryDate.getUTCMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    }
    return String(year);
  }

  async reverseJournalEntry(id: string, dto: ReverseJournalEntryDto, user: any) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role, ['master', 'admin', 'accountant']);

    return this.knex.transaction(async (trx) => {
      const original = await trx('accounting_journal_entries')
        .where({ id, organization_id: organizationId })
        .first();

      if (!original) throw new NotFoundException('Lançamento contábil não encontrado');
      if (original.status === 'reversed') throw new BadRequestException('Lançamento já foi estornado');
      if (original.status !== 'posted') throw new BadRequestException('Apenas lançamentos postados podem ser estornados');

      const originalLines = await trx('accounting_journal_entry_lines')
        .where({ journal_entry_id: id, organization_id: organizationId });

      const now = new Date();
      const reversalId = randomUUID();
      const reversalTransactionId = randomUUID();
      const totalAmount = originalLines
        .filter((l) => l.line_type === 'debit')
        .reduce((s, l) => s + Number(l.amount), 0);

      await trx('finance_transactions').insert({
        id: reversalTransactionId,
        organization_id: organizationId,
        transaction_type: 'journal_adjustment',
        status: 'posted',
        occurred_at: now,
        currency: 'BRL',
        amount: totalAmount.toFixed(2),
        description: dto.reason ?? `Estorno: ${original.description}`,
        reference_type: 'reversal',
        reference_id: id,
        created_by: userId,
        updated_by: userId,
        posted_at: now,
        created_at: now,
        updated_at: now,
      });

      await trx('accounting_journal_entries').insert({
        id: reversalId,
        organization_id: organizationId,
        transaction_id: reversalTransactionId,
        status: 'posted',
        entry_date: now,
        description: dto.reason ?? `Estorno: ${original.description}`,
        reference_type: 'reversal',
        reference_id: id,
        reversal_of_entry_id: id,
        created_by: userId,
        updated_by: userId,
        posted_by: userId,
        posted_at: now,
        created_at: now,
        updated_at: now,
      });

      const reversalLines = originalLines.map((line) => ({
        id: randomUUID(),
        journal_entry_id: reversalId,
        organization_id: organizationId,
        account_id: line.account_id,
        line_type: line.line_type === 'debit' ? 'credit' : 'debit',
        amount: line.amount,
        memo: `Estorno: ${line.memo ?? ''}`.trim(),
        created_by: userId,
        reference_type: 'reversal',
        reference_id: id,
        created_at: now,
      }));

      await trx('accounting_journal_entry_lines').insert(reversalLines);

      await trx('accounting_journal_entries')
        .where({ id, organization_id: organizationId })
        .update({ status: 'reversed', updated_by: userId, updated_at: now });

      return trx('accounting_journal_entries').where({ id: reversalId }).first();
    });
  }
}
