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
import { ImportStatementDto, ReconcileLineDto } from './dtos/import-statement.dto';

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

const WRITE_ROLES = ['master', 'admin', 'accountant', 'financial_operator'] as const;
const READ_ROLES = [...WRITE_ROLES] as const;

export interface MatchSuggestion {
  statementLineId: string;
  candidateTransactionId: string | null;
  candidateDescription: string | null;
  candidateAmount: number | null;
  candidateDate: string | null;
  matchType: 'exact' | 'amount_only' | 'none';
}

/**
 * Reconciliação Bancária — fluxo completo:
 *
 *  1) `importStatement`: cria um header (bank_statement_imports) + um statement
 *     (bank_statements) e suas lines (bank_statement_lines). Validação:
 *     openingBalance + soma das linhas == closingBalance (tolerância 1c).
 *
 *  2) `suggestMatches`: para cada linha do extrato, procura um movimento da
 *     tesouraria (`finance_transactions` tipo 'treasury') com mesma conta,
 *     mesmo valor (em módulo) e data ±2 dias. Não persiste nada — só sugere.
 *     Performance: UMA query JOIN com janela de data, evita N+1.
 *
 *  3) `reconcile`: persiste decisões linha-a-linha (matched/discrepancy/...) em
 *     `bank_reconciliations`. Quando todas as linhas têm status decidido, marca
 *     o statement como 'reconciled'.
 */
@Injectable()
export class BankReconciliationService {
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
      throw new ForbiddenException('Sem permissão para reconciliação bancária');
    }
  }

  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para consultar reconciliação');
    }
  }

  async importStatement(dto: ImportStatementDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const account = await trx('bank_accounts')
        .where({ id: dto.bankAccountId, organization_id: organizationId })
        .first();
      if (!account) throw new NotFoundException('Conta bancária não encontrada');

      // Validação contábil: saldo inicial + linhas = saldo final.
      const sumLines = dto.lines.reduce((s, l) => s + Number(l.amount), 0);
      const expected = Number(dto.openingBalance) + sumLines;
      if (Math.abs(expected - Number(dto.closingBalance)) > 0.01) {
        throw new BadRequestException(
          `Extrato inconsistente: saldo inicial ${Number(dto.openingBalance).toFixed(2)} + movimentos ${sumLines.toFixed(2)} ≠ saldo final ${Number(dto.closingBalance).toFixed(2)}`,
        );
      }

      const importId = randomUUID();
      const statementId = randomUUID();
      const now = new Date();

      await trx('bank_statements').insert({
        id: statementId,
        organization_id: organizationId,
        bank_account_id: dto.bankAccountId,
        statement_date: dto.endDate.slice(0, 10),
        start_date: dto.startDate.slice(0, 10),
        end_date: dto.endDate.slice(0, 10),
        opening_balance: Number(dto.openingBalance).toFixed(2),
        closing_balance: Number(dto.closingBalance).toFixed(2),
        status: 'uploaded',
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      });

      await trx('bank_statement_imports').insert({
        id: importId,
        organization_id: organizationId,
        bank_account_id: dto.bankAccountId,
        statement_id: statementId,
        source_type: dto.sourceType,
        source_filename: dto.sourceFilename ?? null,
        lines_imported: dto.lines.length,
        lines_matched: 0,
        status: 'imported',
        created_by: userId,
        created_at: now,
        updated_at: now,
      });

      const linesToInsert = dto.lines.map((line) => ({
        id: randomUUID(),
        statement_id: statementId,
        organization_id: organizationId,
        transaction_date: new Date(line.transactionDate),
        amount: Number(line.amount).toFixed(2),
        transaction_type: line.transactionType,
        description: line.description,
        reference: line.reference ?? null,
        is_reconciled: false,
        matched_transaction_id: null,
        import_id: importId,
        created_at: now,
      }));
      await trx('bank_statement_lines').insert(linesToInsert);

      return {
        importId,
        statementId,
        bankAccountId: dto.bankAccountId,
        linesImported: dto.lines.length,
      };
    });
  }

  /**
   * Sugere matches para todas as linhas do statement.
   * Heurística: conta + valor exato + data ±2 dias.
   * Em uma só query (LEFT JOIN com janela), retorna candidatos.
   */
  async suggestMatches(statementId: string, user: AuthUserPayload): Promise<MatchSuggestion[]> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    const statement = await this.knex('bank_statements')
      .where({ id: statementId, organization_id: organizationId })
      .first();
    if (!statement) throw new NotFoundException('Extrato não encontrado');

    const lines: Array<{
      id: string;
      transaction_date: Date;
      amount: string | number;
      description: string;
    }> = await this.knex('bank_statement_lines')
      .where({ statement_id: statementId, organization_id: organizationId, is_reconciled: false })
      .select('id', 'transaction_date', 'amount', 'description');

    if (lines.length === 0) return [];

    // Carrega TODAS as transações de tesouraria da conta no período +-2 dias UMA vez.
    // Filtra match em memória (mais simples que SQL com janela por linha).
    const minDate = new Date(statement.start_date);
    minDate.setDate(minDate.getDate() - 2);
    const maxDate = new Date(statement.end_date);
    maxDate.setDate(maxDate.getDate() + 2);

    const transactions: Array<{
      id: string;
      occurred_at: Date;
      amount: string | number;
      description: string | null;
      reference_type: string | null;
    }> = await this.knex('finance_transactions')
      .where({ organization_id: organizationId, reference_id: statement.bank_account_id })
      .whereIn('reference_type', ['treasury_movement', 'treasury_transfer_in', 'treasury_transfer_out'])
      .andWhereBetween('occurred_at', [minDate, maxDate])
      .select('id', 'occurred_at', 'amount', 'description', 'reference_type');

    return lines.map<MatchSuggestion>((line) => {
      const lineAbs = Math.abs(Number(line.amount));
      const lineDate = new Date(line.transaction_date).getTime();

      // Tenta match exato (valor + data ≤ 2 dias).
      const exact = transactions.find((t) => {
        const sameAmount = Math.abs(Math.abs(Number(t.amount)) - lineAbs) < 0.01;
        const dayDiff = Math.abs(new Date(t.occurred_at).getTime() - lineDate) / (1000 * 60 * 60 * 24);
        return sameAmount && dayDiff <= 2;
      });
      if (exact) {
        return {
          statementLineId: line.id,
          candidateTransactionId: exact.id,
          candidateDescription: exact.description,
          candidateAmount: Number(exact.amount),
          candidateDate: new Date(exact.occurred_at).toISOString(),
          matchType: 'exact',
        };
      }

      // Fallback: só mesmo valor (sem restrição de data).
      const amountOnly = transactions.find(
        (t) => Math.abs(Math.abs(Number(t.amount)) - lineAbs) < 0.01,
      );
      if (amountOnly) {
        return {
          statementLineId: line.id,
          candidateTransactionId: amountOnly.id,
          candidateDescription: amountOnly.description,
          candidateAmount: Number(amountOnly.amount),
          candidateDate: new Date(amountOnly.occurred_at).toISOString(),
          matchType: 'amount_only',
        };
      }

      return {
        statementLineId: line.id,
        candidateTransactionId: null,
        candidateDescription: null,
        candidateAmount: null,
        candidateDate: null,
        matchType: 'none',
      };
    });
  }

  /**
   * Aplica decisões de reconciliação em lote.
   */
  async reconcile(
    statementId: string,
    decisions: ReconcileLineDto[],
    user: AuthUserPayload,
  ) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const statement = await trx('bank_statements')
        .where({ id: statementId, organization_id: organizationId })
        .first();
      if (!statement) throw new NotFoundException('Extrato não encontrado');

      const lineIds = decisions.map((d) => d.statementLineId);
      const lines = await trx('bank_statement_lines')
        .whereIn('id', lineIds)
        .andWhere({ organization_id: organizationId, statement_id: statementId });
      if (lines.length !== decisions.length) {
        throw new BadRequestException('Uma ou mais linhas não pertencem a este extrato');
      }

      const now = new Date();
      let matched = 0;

      for (const dec of decisions) {
        // Apaga reconciliação anterior dessa linha (idempotência) e insere nova.
        await trx('bank_reconciliations')
          .where({
            organization_id: organizationId,
            statement_id: statementId,
            statement_line_id: dec.statementLineId,
          })
          .delete();

        await trx('bank_reconciliations').insert({
          id: randomUUID(),
          statement_id: statementId,
          organization_id: organizationId,
          statement_line_id: dec.statementLineId,
          finance_transaction_id: dec.matchedTransactionId ?? null,
          match_status: dec.matchStatus,
          variance_amount: dec.varianceAmount ?? 0,
          notes: dec.notes ?? null,
          created_by: userId,
          created_at: now,
        });

        await trx('bank_statement_lines')
          .where({ id: dec.statementLineId })
          .update({
            is_reconciled: dec.matchStatus === 'matched',
            matched_transaction_id: dec.matchedTransactionId ?? null,
          });

        if (dec.matchStatus === 'matched') matched++;
      }

      // Statement vira "reconciled" quando TODAS as linhas têm uma decisão final
      // (matched / discrepancy / unmatched), mesmo que não-matched. Para isso checamos
      // a presença de uma row em bank_reconciliations, não o flag is_reconciled (que
      // é true apenas para "matched").
      const linesWithoutDecision = await trx('bank_statement_lines as bsl')
        .leftJoin('bank_reconciliations as br', function () {
          this.on('br.statement_line_id', '=', 'bsl.id').andOn(
            'br.organization_id',
            '=',
            'bsl.organization_id',
          );
        })
        .where('bsl.statement_id', statementId)
        .andWhere('bsl.organization_id', organizationId)
        .whereNull('br.id')
        .count<{ count: string }[]>('* as count')
        .first();

      const allDone = Number(linesWithoutDecision?.count ?? 0) === 0;
      if (allDone) {
        await trx('bank_statements')
          .where({ id: statementId, organization_id: organizationId })
          .update({ status: 'reconciled', updated_by: userId, updated_at: now });
      }

      // Atualiza contador no import
      await trx('bank_statement_imports')
        .where({ statement_id: statementId, organization_id: organizationId })
        .update({ lines_matched: matched, status: allDone ? 'reconciled' : 'imported', updated_at: now });

      return { success: true, decisions: decisions.length, matched, allDone };
    });
  }

  async listStatements(user: AuthUserPayload, filters?: { bankAccountId?: string; status?: string }) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    const query = this.knex('bank_statements as s')
      .leftJoin('bank_accounts as ba', 's.bank_account_id', 'ba.id')
      .where('s.organization_id', organizationId)
      .select(
        's.*',
        'ba.bank_name as bank_name',
        'ba.bank_code as bank_code',
        'ba.account_number as account_number',
        this.knex.raw(
          `(SELECT COUNT(*) FROM bank_statement_lines bsl WHERE bsl.statement_id = s.id)::int AS lines_total`,
        ),
        this.knex.raw(
          `(SELECT COUNT(*) FROM bank_statement_lines bsl WHERE bsl.statement_id = s.id AND bsl.is_reconciled = true)::int AS lines_reconciled`,
        ),
      )
      .orderBy('s.statement_date', 'desc');

    if (filters?.bankAccountId) query.andWhere('s.bank_account_id', filters.bankAccountId);
    if (filters?.status) query.andWhere('s.status', filters.status);

    return query;
  }

  async getStatementLines(statementId: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    const statement = await this.knex('bank_statements')
      .where({ id: statementId, organization_id: organizationId })
      .first();
    if (!statement) throw new NotFoundException('Extrato não encontrado');

    const lines = await this.knex('bank_statement_lines as bsl')
      .leftJoin('bank_reconciliations as br', function () {
        this.on('br.statement_line_id', '=', 'bsl.id').andOn(
          'br.organization_id',
          '=',
          'bsl.organization_id',
        );
      })
      .where({ 'bsl.statement_id': statementId, 'bsl.organization_id': organizationId })
      .select(
        'bsl.*',
        'br.match_status as reconciliation_status',
        'br.variance_amount as reconciliation_variance',
        'br.notes as reconciliation_notes',
      )
      .orderBy('bsl.transaction_date', 'asc');

    return { statement, lines };
  }

  async deleteStatement(statementId: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const stmt = await trx('bank_statements')
        .where({ id: statementId, organization_id: organizationId })
        .first();
      if (!stmt) throw new NotFoundException('Extrato não encontrado');

      // CASCADE em bank_statement_lines / bank_reconciliations já cuida do resto.
      await trx('bank_statements').where({ id: statementId }).delete();
      await trx('bank_statement_imports')
        .where({ statement_id: statementId })
        .update({ status: 'rolled_back', updated_at: new Date() });

      return { success: true };
    });
  }
}
