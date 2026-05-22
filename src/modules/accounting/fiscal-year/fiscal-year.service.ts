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

const CLOSING_ROLES = ['master', 'admin'] as const;
const VIEWER_ROLES = ['master', 'admin', 'accountant', 'financial_operator'] as const;

export interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  accountType: 'revenue' | 'expense';
  balance: number; // sempre positivo (saldo normal para o tipo)
}

export interface ClosingPreview {
  year: number;
  periodStart: string;
  periodEnd: string;
  totalRevenue: number;
  totalExpense: number;
  netResult: number;
  revenueAccounts: AccountBalance[];
  expenseAccounts: AccountBalance[];
  incomeSummaryAccount: { id: string; code: string; name: string };
  retainedEarningsAccount: { id: string; code: string; name: string };
  hasDraftEntries: boolean;
  alreadyClosed: boolean;
}

/**
 * Encerramento de Exercício.
 *
 * Operação contábil de fim de ano:
 *  1. Apura o resultado do exercício (receitas − despesas)
 *  2. Zera as contas de resultado contra a "Apuração de Resultado"
 *  3. Transfere o saldo da Apuração para "Lucros/Prejuízos Acumulados"
 *
 * Idempotente: bloqueia segundo fechamento via unique(org, year).
 * Reversível: `reopen` cria estornos espelhados.
 */
@Injectable()
export class FiscalYearService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private scope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId)
      throw new UnauthorizedException('Usuário sem organização vinculada');
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }
  private ensureClosingRole(role: string) {
    if (!CLOSING_ROLES.includes(role as (typeof CLOSING_ROLES)[number]))
      throw new ForbiddenException('Apenas master/admin podem fechar exercício');
  }
  private ensureViewer(role: string) {
    if (!VIEWER_ROLES.includes(role as (typeof VIEWER_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar encerramentos');
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PREVIEW — apura o resultado SEM gravar nada
  // ═══════════════════════════════════════════════════════════════════════

  async preview(year: number, user: AuthUserPayload): Promise<ClosingPreview> {
    const { organizationId, role } = this.scope(user);
    this.ensureViewer(role);
    if (!Number.isInteger(year) || year < 1900 || year > 2200)
      throw new BadRequestException('Ano inválido');

    const periodStart = `${year}-01-01`;
    const periodEnd = `${year}-12-31`;

    const incomeSummaryAccount = await this.findIncomeSummary(organizationId);
    const retainedEarningsAccount = await this.findRetainedEarnings(organizationId);

    const balances = await this.computeResultBalances(organizationId, periodStart, periodEnd);
    const totalRevenue = this.round2(
      balances.filter((b) => b.accountType === 'revenue').reduce((s, b) => s + b.balance, 0),
    );
    const totalExpense = this.round2(
      balances.filter((b) => b.accountType === 'expense').reduce((s, b) => s + b.balance, 0),
    );

    const draftCount = await this.knex('accounting_journal_entries')
      .where({ organization_id: organizationId })
      .andWhereBetween('entry_date', [periodStart, periodEnd])
      .andWhere('status', 'draft')
      .count<{ c: string }[]>('* as c')
      .first();

    const existingClosing = await this.knex('fiscal_year_closings')
      .where({ organization_id: organizationId, year })
      .first<{ status: string } | undefined>();

    return {
      year,
      periodStart,
      periodEnd,
      totalRevenue,
      totalExpense,
      netResult: this.round2(totalRevenue - totalExpense),
      revenueAccounts: balances.filter((b) => b.accountType === 'revenue'),
      expenseAccounts: balances.filter((b) => b.accountType === 'expense'),
      incomeSummaryAccount: {
        id: incomeSummaryAccount.id,
        code: incomeSummaryAccount.code,
        name: incomeSummaryAccount.name,
      },
      retainedEarningsAccount: {
        id: retainedEarningsAccount.id,
        code: retainedEarningsAccount.code,
        name: retainedEarningsAccount.name,
      },
      hasDraftEntries: Number(draftCount?.c ?? 0) > 0,
      alreadyClosed: existingClosing?.status === 'closed',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLOSE — executa o fechamento
  // ═══════════════════════════════════════════════════════════════════════

  async close(year: number, user: AuthUserPayload, notes?: string) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureClosingRole(role);
    if (!Number.isInteger(year) || year < 1900 || year > 2200)
      throw new BadRequestException('Ano inválido');

    return this.knex.transaction(async (trx) => {
      const periodStart = `${year}-01-01`;
      const periodEnd = `${year}-12-31`;

      // 1. Já fechado?
      const existing = await trx('fiscal_year_closings')
        .where({ organization_id: organizationId, year })
        .first<{ id: string; status: string } | undefined>();
      if (existing?.status === 'closed') {
        throw new ConflictException(`O exercício ${year} já está encerrado.`);
      }

      // 2. Existem lançamentos draft no período?
      const drafts = await trx('accounting_journal_entries')
        .where({ organization_id: organizationId, status: 'draft' })
        .andWhereBetween('entry_date', [periodStart, periodEnd])
        .first();
      if (drafts) {
        throw new BadRequestException(
          'Existem lançamentos em rascunho no período. Poste ou exclua todos antes de fechar.',
        );
      }

      // 3. Localiza contas-chave
      const incomeSummary = await this.findIncomeSummary(organizationId, trx);
      const retainedEarnings = await this.findRetainedEarnings(organizationId, trx);

      // 4. Apura saldos das contas de receita/despesa
      const balances = await this.computeResultBalances(
        organizationId,
        periodStart,
        periodEnd,
        trx,
      );
      const revLines = balances.filter((b) => b.accountType === 'revenue' && b.balance > 0.005);
      const expLines = balances.filter((b) => b.accountType === 'expense' && b.balance > 0.005);
      const totalRevenue = this.round2(revLines.reduce((s, b) => s + b.balance, 0));
      const totalExpense = this.round2(expLines.reduce((s, b) => s + b.balance, 0));
      const netResult = this.round2(totalRevenue - totalExpense);

      if (revLines.length === 0 && expLines.length === 0) {
        throw new BadRequestException(
          'Nenhuma movimentação de resultado encontrada no exercício. Nada a fechar.',
        );
      }

      const now = new Date();

      // 5. Lançamento 1 — Zera receitas e despesas contra a Apuração
      const closingEntryId = randomUUID();
      await trx('accounting_journal_entries').insert({
        id: closingEntryId,
        organization_id: organizationId,
        status: 'posted',
        entry_date: periodEnd,
        description: `Encerramento de receitas e despesas — exercício ${year}`,
        reference_type: 'fiscal_year_closing',
        reference_id: null,
        created_by: userId,
        updated_by: userId,
        posted_by: userId,
        posted_at: now,
        auto_generated: false,
        created_at: now,
        updated_at: now,
      });

      const lineRows: Array<Record<string, unknown>> = [];

      // Receitas: têm saldo credor → para zerar, DÉBITO na conta de receita
      // e CRÉDITO na Apuração de Resultado.
      for (const r of revLines) {
        lineRows.push({
          id: randomUUID(),
          journal_entry_id: closingEntryId,
          organization_id: organizationId,
          account_id: r.accountId,
          line_type: 'debit',
          amount: r.balance,
          memo: `Encerramento — ${r.name}`,
          created_by: userId,
          reference_type: 'fiscal_year_closing',
          created_at: now,
        });
      }
      if (totalRevenue > 0) {
        lineRows.push({
          id: randomUUID(),
          journal_entry_id: closingEntryId,
          organization_id: organizationId,
          account_id: incomeSummary.id,
          line_type: 'credit',
          amount: totalRevenue,
          memo: 'Receita total apurada',
          created_by: userId,
          reference_type: 'fiscal_year_closing',
          created_at: now,
        });
      }
      // Despesas: têm saldo devedor → para zerar, CRÉDITO na conta de despesa
      // e DÉBITO na Apuração de Resultado.
      for (const e of expLines) {
        lineRows.push({
          id: randomUUID(),
          journal_entry_id: closingEntryId,
          organization_id: organizationId,
          account_id: e.accountId,
          line_type: 'credit',
          amount: e.balance,
          memo: `Encerramento — ${e.name}`,
          created_by: userId,
          reference_type: 'fiscal_year_closing',
          created_at: now,
        });
      }
      if (totalExpense > 0) {
        lineRows.push({
          id: randomUUID(),
          journal_entry_id: closingEntryId,
          organization_id: organizationId,
          account_id: incomeSummary.id,
          line_type: 'debit',
          amount: totalExpense,
          memo: 'Despesa total apurada',
          created_by: userId,
          reference_type: 'fiscal_year_closing',
          created_at: now,
        });
      }

      if (lineRows.length) await trx('accounting_journal_entry_lines').insert(lineRows);

      // 6. Lançamento 2 — Transferência da Apuração para Lucros/Prejuízos Acumulados
      let transferEntryId: string | null = null;
      if (Math.abs(netResult) > 0.005) {
        transferEntryId = randomUUID();
        await trx('accounting_journal_entries').insert({
          id: transferEntryId,
          organization_id: organizationId,
          status: 'posted',
          entry_date: periodEnd,
          description:
            netResult >= 0
              ? `Transferência do lucro do exercício ${year} para Lucros Acumulados`
              : `Transferência do prejuízo do exercício ${year} para Lucros Acumulados`,
          reference_type: 'fiscal_year_closing',
          reference_id: null,
          created_by: userId,
          updated_by: userId,
          posted_by: userId,
          posted_at: now,
          auto_generated: false,
          created_at: now,
          updated_at: now,
        });

        // Lucro: Apuração tem saldo CREDOR (netResult positivo).
        //   Para zerar: D Apuração / C Lucros Acumulados
        // Prejuízo: Apuração tem saldo DEVEDOR (netResult negativo).
        //   Para zerar: C Apuração / D Lucros Acumulados
        const absNet = Math.abs(netResult);
        const isProfit = netResult >= 0;
        await trx('accounting_journal_entry_lines').insert([
          {
            id: randomUUID(),
            journal_entry_id: transferEntryId,
            organization_id: organizationId,
            account_id: incomeSummary.id,
            line_type: isProfit ? 'debit' : 'credit',
            amount: absNet,
            memo: 'Transferência do resultado apurado',
            created_by: userId,
            reference_type: 'fiscal_year_closing',
            created_at: now,
          },
          {
            id: randomUUID(),
            journal_entry_id: transferEntryId,
            organization_id: organizationId,
            account_id: retainedEarnings.id,
            line_type: isProfit ? 'credit' : 'debit',
            amount: absNet,
            memo: isProfit ? 'Lucro do exercício' : 'Prejuízo do exercício',
            created_by: userId,
            reference_type: 'fiscal_year_closing',
            created_at: now,
          },
        ]);
      }

      // 7. Persiste o registro do fechamento
      let closingId = existing?.id;
      if (existing) {
        await trx('fiscal_year_closings').where({ id: existing.id }).update({
          status: 'closed',
          period_start: periodStart,
          period_end: periodEnd,
          total_revenue: totalRevenue,
          total_expense: totalExpense,
          net_result: netResult,
          closing_entry_id: closingEntryId,
          transfer_entry_id: transferEntryId,
          notes: notes ?? null,
          closed_by: userId,
          closed_at: now,
          reopened_by: null,
          reopened_at: null,
          reopen_reason: null,
          updated_at: now,
        });
      } else {
        closingId = randomUUID();
        await trx('fiscal_year_closings').insert({
          id: closingId,
          organization_id: organizationId,
          year,
          period_start: periodStart,
          period_end: periodEnd,
          status: 'closed',
          total_revenue: totalRevenue,
          total_expense: totalExpense,
          net_result: netResult,
          closing_entry_id: closingEntryId,
          transfer_entry_id: transferEntryId,
          notes: notes ?? null,
          closed_by: userId,
          closed_at: now,
          created_at: now,
          updated_at: now,
        });
      }

      return {
        id: closingId,
        year,
        totalRevenue,
        totalExpense,
        netResult,
        closingEntryId,
        transferEntryId,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REOPEN — gera estornos e marca como reaberto
  // ═══════════════════════════════════════════════════════════════════════

  async reopen(year: number, reason: string, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureClosingRole(role);
    if (!reason || reason.trim().length < 5)
      throw new BadRequestException('Justifique o motivo da reabertura.');

    return this.knex.transaction(async (trx) => {
      const closing = await trx('fiscal_year_closings')
        .where({ organization_id: organizationId, year })
        .forUpdate()
        .first<{
          id: string;
          status: string;
          closing_entry_id: string | null;
          transfer_entry_id: string | null;
        }>();
      if (!closing) throw new NotFoundException(`Exercício ${year} não foi encerrado.`);
      if (closing.status !== 'closed')
        throw new BadRequestException(`Exercício ${year} não está fechado.`);

      const now = new Date();

      const reverse = async (sourceEntryId: string) => {
        const src = await trx('accounting_journal_entries')
          .where({ id: sourceEntryId })
          .first<{ description: string } | undefined>();
        const srcLines = await trx('accounting_journal_entry_lines')
          .where({ journal_entry_id: sourceEntryId })
          .select('account_id', 'line_type', 'amount', 'memo');
        if (!src || srcLines.length === 0) return;

        const revId = randomUUID();
        await trx('accounting_journal_entries').insert({
          id: revId,
          organization_id: organizationId,
          status: 'posted',
          entry_date: now,
          description: `ESTORNO (reabertura ${year}) — ${src.description}`,
          reference_type: 'fiscal_year_closing_reversal',
          reversal_of_entry_id: sourceEntryId,
          created_by: userId,
          updated_by: userId,
          posted_by: userId,
          posted_at: now,
          auto_generated: false,
          created_at: now,
          updated_at: now,
        });
        for (const l of srcLines) {
          await trx('accounting_journal_entry_lines').insert({
            id: randomUUID(),
            journal_entry_id: revId,
            organization_id: organizationId,
            account_id: l.account_id,
            line_type: l.line_type === 'debit' ? 'credit' : 'debit',
            amount: l.amount,
            memo: `Estorno: ${l.memo ?? ''}`.trim(),
            created_by: userId,
            reference_type: 'fiscal_year_closing_reversal',
            created_at: now,
          });
        }
        await trx('accounting_journal_entries')
          .where({ id: sourceEntryId })
          .update({ status: 'reversed', updated_at: now });
      };

      if (closing.transfer_entry_id) await reverse(closing.transfer_entry_id);
      if (closing.closing_entry_id) await reverse(closing.closing_entry_id);

      await trx('fiscal_year_closings').where({ id: closing.id }).update({
        status: 'reopened',
        reopened_by: userId,
        reopened_at: now,
        reopen_reason: reason,
        updated_at: now,
      });

      return { success: true, year };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIST + GET
  // ═══════════════════════════════════════════════════════════════════════

  async list(user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureViewer(role);
    return this.knex('fiscal_year_closings')
      .where({ organization_id: organizationId })
      .orderBy('year', 'desc');
  }

  async getByYear(year: number, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureViewer(role);
    return this.knex('fiscal_year_closings')
      .where({ organization_id: organizationId, year })
      .first();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  private async findIncomeSummary(organizationId: string, trx?: Knex.Transaction) {
    const k = trx ?? this.knex;
    const row = await k('accounting_chart_accounts')
      .where({
        organization_id: organizationId,
        is_income_summary: true,
        is_active: true,
        allows_posting: true,
      })
      .first<{ id: string; code: string; name: string } | undefined>();
    if (!row) {
      throw new BadRequestException(
        'Não foi encontrada conta "Apuração de Resultado". Marque uma conta no plano de contas com is_income_summary=true.',
      );
    }
    return row;
  }

  private async findRetainedEarnings(organizationId: string, trx?: Knex.Transaction) {
    const k = trx ?? this.knex;
    const row = await k('accounting_chart_accounts')
      .where({
        organization_id: organizationId,
        is_retained_earnings: true,
        is_active: true,
        allows_posting: true,
      })
      .first<{ id: string; code: string; name: string } | undefined>();
    if (!row) {
      throw new BadRequestException(
        'Não foi encontrada conta "Lucros/Prejuízos Acumulados". Marque uma conta no plano de contas com is_retained_earnings=true.',
      );
    }
    return row;
  }

  /**
   * Saldos das contas de receita e despesa no período (apenas entries postados).
   * Retorna saldo sempre positivo (sinal normal do tipo).
   */
  private async computeResultBalances(
    organizationId: string,
    periodStart: string,
    periodEnd: string,
    trx?: Knex.Transaction,
  ): Promise<AccountBalance[]> {
    const k = trx ?? this.knex;
    const rows = await k('accounting_chart_accounts as a')
      .leftJoin('accounting_journal_entry_lines as l', 'l.account_id', 'a.id')
      .leftJoin('accounting_journal_entries as e', 'l.journal_entry_id', 'e.id')
      .where('a.organization_id', organizationId)
      .whereIn('a.account_type', ['revenue', 'expense'])
      .andWhere('a.allows_posting', true)
      .andWhere(function () {
        this.whereNull('e.id')
          .orWhere(function () {
            this.where('e.status', 'posted')
              .andWhere('e.organization_id', organizationId)
              .andWhereBetween('e.entry_date', [periodStart, periodEnd]);
          });
      })
      .groupBy('a.id', 'a.code', 'a.name', 'a.account_type')
      .select(
        { account_id: 'a.id' },
        { code: 'a.code' },
        { name: 'a.name' },
        { account_type: 'a.account_type' },
        k.raw(
          `COALESCE(SUM(CASE WHEN l.line_type = 'debit' AND e.status = 'posted' AND e.entry_date BETWEEN ? AND ? THEN l.amount ELSE 0 END), 0) AS debit_sum`,
          [periodStart, periodEnd],
        ),
        k.raw(
          `COALESCE(SUM(CASE WHEN l.line_type = 'credit' AND e.status = 'posted' AND e.entry_date BETWEEN ? AND ? THEN l.amount ELSE 0 END), 0) AS credit_sum`,
          [periodStart, periodEnd],
        ),
      );

    const result: AccountBalance[] = [];
    for (const r of rows as Array<{
      account_id: string;
      code: string;
      name: string;
      account_type: 'revenue' | 'expense';
      debit_sum: string | number;
      credit_sum: string | number;
    }>) {
      const debit = Number(r.debit_sum);
      const credit = Number(r.credit_sum);
      // Receita: normal credor → saldo = credit - debit
      // Despesa: normal devedor → saldo = debit - credit
      const balance =
        r.account_type === 'revenue' ? credit - debit : debit - credit;
      if (Math.abs(balance) < 0.005) continue;
      result.push({
        accountId: r.account_id,
        code: r.code,
        name: r.name,
        accountType: r.account_type,
        balance: this.round2(balance),
      });
    }
    return result.sort((a, b) => a.code.localeCompare(b.code));
  }
}
