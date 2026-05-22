import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';

export interface BalanceLine {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  level: number;
  balance: number;
}

@Injectable()
export class ReportsService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: any) {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuario sem organizacao vinculada');
    }
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user?.role || '').toLowerCase(),
    };
  }

  private ensureRole(role: string) {
    if (!['master', 'admin', 'accountant', 'financial_operator'].includes(role)) {
      throw new ForbiddenException('Usuario sem permissao para acessar relatorios contabeis');
    }
  }

  private validateDateRange(startDate: string, endDate: string) {
    if (!startDate || !endDate) throw new BadRequestException('startDate e endDate são obrigatórios');
    if (new Date(startDate) > new Date(endDate)) throw new BadRequestException('startDate deve ser anterior a endDate');
  }

  // ─── LIVRO DIÁRIO ────────────────────────────────────────────────────────────

  async livroDiario(
    user: any,
    filters: { startDate: string; endDate: string; page?: number; limit?: number },
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);
    this.validateDateRange(filters.startDate, filters.endDate);

    const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
    const page = Math.max(1, filters.page ?? 1);
    const offset = (page - 1) * limit;

    const entries = await this.knex('accounting_journal_entries as je')
      .where({ 'je.organization_id': organizationId, 'je.status': 'posted' })
      .andWhere('je.entry_date', '>=', new Date(filters.startDate))
      .andWhere('je.entry_date', '<=', new Date(filters.endDate))
      .orderBy('je.entry_date', 'asc')
      .select('je.*')
      .limit(limit)
      .offset(offset);

    const [{ total }] = await this.knex('accounting_journal_entries')
      .where({ organization_id: organizationId, status: 'posted' })
      .andWhere('entry_date', '>=', new Date(filters.startDate))
      .andWhere('entry_date', '<=', new Date(filters.endDate))
      .count('id as total');

    let lines: any[] = [];
    if (entries.length > 0) {
      const entryIds = entries.map((e) => e.id);
      lines = await this.knex('accounting_journal_entry_lines as jl')
        .join('accounting_chart_accounts as ca', 'jl.account_id', 'ca.id')
        .whereIn('jl.journal_entry_id', entryIds)
        .andWhere('jl.organization_id', organizationId)
        .select(
          'jl.id',
          'jl.journal_entry_id',
          'jl.line_type',
          'jl.amount',
          'jl.memo',
          'jl.account_id',
          'ca.code as account_code',
          'ca.name as account_name',
          'ca.account_type',
          'ca.normal_balance',
        )
        .orderByRaw("jl.journal_entry_id, jl.line_type = 'debit' DESC");
    }

    const linesByEntry = lines.reduce<Record<string, any[]>>((acc, line) => {
      (acc[line.journal_entry_id] ??= []).push(line);
      return acc;
    }, {});

    const totalEntries = Number(total);

    return {
      report: 'Livro Diário',
      period: { startDate: filters.startDate, endDate: filters.endDate },
      pagination: { page, limit, total: totalEntries, totalPages: Math.ceil(totalEntries / limit) },
      entries: entries.map((entry) => ({
        ...entry,
        lines: linesByEntry[entry.id] ?? [],
      })),
    };
  }

  // ─── LIVRO RAZÃO ─────────────────────────────────────────────────────────────

  async livroRazao(
    user: any,
    filters: { startDate: string; endDate: string; accountId?: string; limit?: number },
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);
    this.validateDateRange(filters.startDate, filters.endDate);

    const limit = Math.max(1, Math.min(filters.limit ?? 500, 2000));

    const linesQuery = this.knex('accounting_journal_entry_lines as jl')
      .join('accounting_journal_entries as je', 'jl.journal_entry_id', 'je.id')
      .join('accounting_chart_accounts as ca', 'jl.account_id', 'ca.id')
      .where({ 'jl.organization_id': organizationId, 'je.status': 'posted' })
      .andWhere('je.entry_date', '>=', new Date(filters.startDate))
      .andWhere('je.entry_date', '<=', new Date(filters.endDate))
      .select(
        'jl.account_id',
        'ca.code as account_code',
        'ca.name as account_name',
        'ca.account_type',
        'ca.normal_balance',
        'jl.line_type',
        'jl.amount',
        'jl.memo',
        'je.id as journal_entry_id',
        'je.entry_date',
        'je.description as entry_description',
      )
      .orderBy(['jl.account_id', 'je.entry_date'])
      .limit(limit);

    if (filters.accountId) linesQuery.andWhere('jl.account_id', filters.accountId);

    const lines = await linesQuery;

    const accountsMap: Record<string, any> = {};

    for (const line of lines) {
      if (!accountsMap[line.account_id]) {
        accountsMap[line.account_id] = {
          account_id: line.account_id,
          account_code: line.account_code,
          account_name: line.account_name,
          account_type: line.account_type,
          normal_balance: line.normal_balance,
          total_debit: 0,
          total_credit: 0,
          balance: 0,
          movements: [],
        };
      }

      const acc = accountsMap[line.account_id];
      const amount = Number(line.amount);

      if (line.line_type === 'debit') acc.total_debit += amount;
      else acc.total_credit += amount;

      acc.balance =
        acc.normal_balance === 'debit'
          ? acc.total_debit - acc.total_credit
          : acc.total_credit - acc.total_debit;

      acc.movements.push({
        date: line.entry_date,
        journal_entry_id: line.journal_entry_id,
        description: line.entry_description,
        memo: line.memo,
        debit: line.line_type === 'debit' ? amount : 0,
        credit: line.line_type === 'credit' ? amount : 0,
        running_balance: acc.balance,
      });
    }

    const accounts = Object.values(accountsMap).sort((a: any, b: any) =>
      a.account_code.localeCompare(b.account_code),
    );

    return {
      report: 'Livro Razão',
      period: { startDate: filters.startDate, endDate: filters.endDate },
      accounts,
    };
  }

  // ─── BALANCETE ───────────────────────────────────────────────────────────────

  async balancete(
    user: any,
    filters: { startDate: string; endDate: string; accountType?: string; onlyWithMovements?: boolean },
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);
    this.validateDateRange(filters.startDate, filters.endDate);

    const accountsQuery = this.knex('accounting_chart_accounts')
      .where({ organization_id: organizationId, is_active: true })
      .orderBy([{ column: 'level', order: 'asc' }, { column: 'code', order: 'asc' }]);

    if (filters.accountType) accountsQuery.andWhere({ account_type: filters.accountType });

    const accounts = await accountsQuery;

    const movements = await this.knex('accounting_journal_entry_lines as jl')
      .join('accounting_journal_entries as je', 'jl.journal_entry_id', 'je.id')
      .where({ 'jl.organization_id': organizationId, 'je.status': 'posted' })
      .andWhere('je.entry_date', '>=', new Date(filters.startDate))
      .andWhere('je.entry_date', '<=', new Date(filters.endDate))
      .select(
        'jl.account_id',
        this.knex.raw("SUM(CASE WHEN jl.line_type = 'debit' THEN jl.amount ELSE 0 END) as total_debit"),
        this.knex.raw("SUM(CASE WHEN jl.line_type = 'credit' THEN jl.amount ELSE 0 END) as total_credit"),
      )
      .groupBy('jl.account_id');

    const movMap = movements.reduce<Record<string, any>>(
      (acc, m) => ({ ...acc, [m.account_id]: m }),
      {},
    );

    let grandTotalDebit = 0;
    let grandTotalCredit = 0;

    let lines = accounts.map((account) => {
      const mov = movMap[account.id] ?? { total_debit: 0, total_credit: 0 };
      const debit = Number(mov.total_debit);
      const credit = Number(mov.total_credit);
      const balance = account.normal_balance === 'debit' ? debit - credit : credit - debit;

      grandTotalDebit += debit;
      grandTotalCredit += credit;

      return {
        account_id: account.id,
        code: account.code,
        name: account.name,
        account_type: account.account_type,
        normal_balance: account.normal_balance,
        level: account.level,
        total_debit: debit,
        total_credit: credit,
        balance,
        has_movements: debit > 0 || credit > 0,
      };
    });

    if (filters.onlyWithMovements) {
      lines = lines.filter((l) => l.has_movements);
    }

    return {
      report: 'Balancete de Verificação',
      period: { startDate: filters.startDate, endDate: filters.endDate },
      lines,
      totals: {
        total_debit: grandTotalDebit,
        total_credit: grandTotalCredit,
        balanced: Math.round(grandTotalDebit * 100) === Math.round(grandTotalCredit * 100),
      },
    };
  }

  // ─── DRE — DEMONSTRAÇÃO DE RESULTADOS ────────────────────────────────────────
  // Estrutura:
  //   Receita Operacional Bruta (revenue)
  //   (-) Custos das Vendas/Serviços (expense — sub-tipo, opcional)
  //   = Resultado Bruto
  //   (-) Despesas Operacionais (expense)
  //   = Resultado Operacional
  //   = Resultado Líquido (sem distinção de não-operacionais nesta versão)
  //
  // Nota: para classificar mais finamente (ex.: separar custos de despesas
  // dentro de 'expense'), o cliente cadastra contas-pai específicas. Esta
  // implementação consolida pelo `account_type` para máxima portabilidade
  // entre planos de contas (BR, AO, PT, ES, FR, US).
  async dre(
    user: any,
    filters: { startDate: string; endDate: string; comparisonStartDate?: string; comparisonEndDate?: string },
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);
    this.validateDateRange(filters.startDate, filters.endDate);

    const periodTotals = await this.computePeriodTotals(organizationId, filters.startDate, filters.endDate);
    const periodLines = await this.computePeriodLinesByType(
      organizationId,
      filters.startDate,
      filters.endDate,
    );

    let comparison: typeof periodTotals | null = null;
    let comparisonLines: typeof periodLines | null = null;
    if (filters.comparisonStartDate && filters.comparisonEndDate) {
      this.validateDateRange(filters.comparisonStartDate, filters.comparisonEndDate);
      comparison = await this.computePeriodTotals(
        organizationId,
        filters.comparisonStartDate,
        filters.comparisonEndDate,
      );
      comparisonLines = await this.computePeriodLinesByType(
        organizationId,
        filters.comparisonStartDate,
        filters.comparisonEndDate,
      );
    }

    return {
      report: 'Demonstração de Resultados',
      period: { startDate: filters.startDate, endDate: filters.endDate },
      ...(comparison && filters.comparisonStartDate && filters.comparisonEndDate
        ? {
            comparisonPeriod: {
              startDate: filters.comparisonStartDate,
              endDate: filters.comparisonEndDate,
            },
          }
        : {}),
      sections: {
        revenue: {
          label: 'Receitas',
          accounts: periodLines.revenue,
          total: periodTotals.revenue,
          ...(comparison ? { comparisonTotal: comparison.revenue } : {}),
        },
        expense: {
          label: 'Despesas',
          accounts: periodLines.expense,
          total: periodTotals.expense,
          ...(comparison ? { comparisonTotal: comparison.expense } : {}),
        },
      },
      result: {
        netIncome: Number((periodTotals.revenue - periodTotals.expense).toFixed(2)),
        ...(comparison
          ? {
              comparisonNetIncome: Number((comparison.revenue - comparison.expense).toFixed(2)),
              variation: Number(
                (
                  periodTotals.revenue -
                  periodTotals.expense -
                  (comparison.revenue - comparison.expense)
                ).toFixed(2),
              ),
            }
          : {}),
      },
    };
  }

  // ─── BALANÇO PATRIMONIAL ─────────────────────────────────────────────────────
  // Apresenta os saldos ACUMULADOS desde o início até a data referência.
  // Estrutura:
  //   Ativo (asset)
  //   Passivo (liability)
  //   Patrimônio Líquido (equity) + Resultado do exercício (revenue - expense)
  //   Validação: Ativo == Passivo + PL + Resultado
  async balanco(user: any, filters: { referenceDate: string }) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);
    if (!filters.referenceDate) {
      throw new BadRequestException('referenceDate é obrigatório');
    }

    // Saldos acumulados de cada conta (debit - credit ou credit - debit, conforme normal_balance)
    // do início dos tempos até a referenceDate.
    const accounts = await this.knex('accounting_chart_accounts')
      .where({ organization_id: organizationId, is_active: true })
      .orderBy([{ column: 'level', order: 'asc' }, { column: 'code', order: 'asc' }]);

    const movements = await this.knex('accounting_journal_entry_lines as jl')
      .join('accounting_journal_entries as je', 'jl.journal_entry_id', 'je.id')
      .where({ 'jl.organization_id': organizationId, 'je.status': 'posted' })
      .andWhere('je.entry_date', '<=', new Date(filters.referenceDate))
      .select(
        'jl.account_id',
        this.knex.raw("SUM(CASE WHEN jl.line_type = 'debit' THEN jl.amount ELSE 0 END) as total_debit"),
        this.knex.raw("SUM(CASE WHEN jl.line_type = 'credit' THEN jl.amount ELSE 0 END) as total_credit"),
      )
      .groupBy('jl.account_id');

    const movMap = movements.reduce<Record<string, { total_debit: string; total_credit: string }>>(
      (acc, m: any) => ({ ...acc, [m.account_id]: m }),
      {},
    );

    const groups: Record<'asset' | 'liability' | 'equity' | 'revenue' | 'expense', BalanceLine[]> = {
      asset: [],
      liability: [],
      equity: [],
      revenue: [],
      expense: [],
    };

    for (const account of accounts) {
      const mov = movMap[account.id] ?? { total_debit: '0', total_credit: '0' };
      const debit = Number(mov.total_debit);
      const credit = Number(mov.total_credit);
      const balance = account.normal_balance === 'debit' ? debit - credit : credit - debit;
      // Inclui mesmo com saldo 0 se nível 1 (sintética) — fica como agrupador na UI.
      // Para analíticas, omite quando saldo é zero.
      if (Math.abs(balance) < 0.005 && account.allows_posting) continue;
      groups[account.account_type as keyof typeof groups].push({
        account_id: account.id,
        code: account.code,
        name: account.name,
        account_type: account.account_type,
        level: account.level,
        balance: Number(balance.toFixed(2)),
      });
    }

    const sumGroup = (lines: BalanceLine[]) =>
      Number(lines.filter((l) => l.level >= 2).reduce((s, l) => s + l.balance, 0).toFixed(2));

    const totalAsset = sumGroup(groups.asset);
    const totalLiability = sumGroup(groups.liability);
    const totalEquity = sumGroup(groups.equity);
    const totalRevenue = sumGroup(groups.revenue);
    const totalExpense = sumGroup(groups.expense);
    const netIncome = Number((totalRevenue - totalExpense).toFixed(2));

    // Equação contábil: Ativo = Passivo + PL + Resultado do exercício.
    const totalLiabilityPlusEquity = Number((totalLiability + totalEquity + netIncome).toFixed(2));
    const balanced = Math.abs(totalAsset - totalLiabilityPlusEquity) < 0.01;

    return {
      report: 'Balanço Patrimonial',
      referenceDate: filters.referenceDate,
      sections: {
        asset: { label: 'Ativo', accounts: groups.asset, total: totalAsset },
        liability: { label: 'Passivo', accounts: groups.liability, total: totalLiability },
        equity: { label: 'Patrimônio Líquido', accounts: groups.equity, total: totalEquity },
      },
      netIncome: { label: 'Resultado do Exercício', value: netIncome },
      totals: {
        totalAsset,
        totalLiabilityPlusEquity,
        balanced,
        difference: Number((totalAsset - totalLiabilityPlusEquity).toFixed(2)),
      },
    };
  }

  // ─── HELPERS PRIVADOS ────────────────────────────────────────────────────────

  private async computePeriodTotals(
    organizationId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ revenue: number; expense: number }> {
    const rows = await this.knex('accounting_journal_entry_lines as jl')
      .join('accounting_journal_entries as je', 'jl.journal_entry_id', 'je.id')
      .join('accounting_chart_accounts as ca', 'jl.account_id', 'ca.id')
      .where({ 'jl.organization_id': organizationId, 'je.status': 'posted' })
      .whereIn('ca.account_type', ['revenue', 'expense'])
      .andWhere('je.entry_date', '>=', new Date(startDate))
      .andWhere('je.entry_date', '<=', new Date(endDate))
      .select(
        'ca.account_type',
        'ca.normal_balance',
        this.knex.raw("SUM(CASE WHEN jl.line_type = 'debit' THEN jl.amount ELSE 0 END) as total_debit"),
        this.knex.raw("SUM(CASE WHEN jl.line_type = 'credit' THEN jl.amount ELSE 0 END) as total_credit"),
      )
      .groupBy('ca.account_type', 'ca.normal_balance');

    let revenue = 0;
    let expense = 0;
    for (const r of rows) {
      const balance =
        r.normal_balance === 'debit' ? Number(r.total_debit) - Number(r.total_credit) : Number(r.total_credit) - Number(r.total_debit);
      if (r.account_type === 'revenue') revenue += balance;
      else if (r.account_type === 'expense') expense += balance;
    }
    return { revenue: Number(revenue.toFixed(2)), expense: Number(expense.toFixed(2)) };
  }

  private async computePeriodLinesByType(
    organizationId: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    revenue: Array<{ code: string; name: string; balance: number }>;
    expense: Array<{ code: string; name: string; balance: number }>;
  }> {
    const rows = await this.knex('accounting_journal_entry_lines as jl')
      .join('accounting_journal_entries as je', 'jl.journal_entry_id', 'je.id')
      .join('accounting_chart_accounts as ca', 'jl.account_id', 'ca.id')
      .where({ 'jl.organization_id': organizationId, 'je.status': 'posted' })
      .whereIn('ca.account_type', ['revenue', 'expense'])
      .andWhere('je.entry_date', '>=', new Date(startDate))
      .andWhere('je.entry_date', '<=', new Date(endDate))
      .select(
        'ca.id as account_id',
        'ca.code',
        'ca.name',
        'ca.account_type',
        'ca.normal_balance',
        this.knex.raw("SUM(CASE WHEN jl.line_type = 'debit' THEN jl.amount ELSE 0 END) as total_debit"),
        this.knex.raw("SUM(CASE WHEN jl.line_type = 'credit' THEN jl.amount ELSE 0 END) as total_credit"),
      )
      .groupBy('ca.id', 'ca.code', 'ca.name', 'ca.account_type', 'ca.normal_balance')
      .orderBy('ca.code', 'asc');

    const revenue: Array<{ code: string; name: string; balance: number }> = [];
    const expense: Array<{ code: string; name: string; balance: number }> = [];

    for (const r of rows) {
      const balance =
        r.normal_balance === 'debit' ? Number(r.total_debit) - Number(r.total_credit) : Number(r.total_credit) - Number(r.total_debit);
      if (Math.abs(balance) < 0.005) continue;
      const line = { code: r.code, name: r.name, balance: Number(balance.toFixed(2)) };
      if (r.account_type === 'revenue') revenue.push(line);
      else if (r.account_type === 'expense') expense.push(line);
    }

    return { revenue, expense };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DFC — DEMONSTRAÇÃO DE FLUXO DE CAIXA (método direto)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * DFC pelo método direto. Analisa todos os lançamentos contábeis postados
   * no período que tocam contas marcadas como `is_cash_equivalent`, e
   * classifica o lado oposto pela `dfc_category` da conta (operating /
   * investing / financing). Saldo inicial e final reconciliam com a soma
   * de débitos − créditos nas contas de caixa.
   */
  async dfc(user: any, filters: { startDate: string; endDate: string }) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRole(role);
    this.validateDateRange(filters.startDate, filters.endDate);

    // 1. Contas de caixa/equivalentes
    const cashAccounts = await this.knex('accounting_chart_accounts')
      .where({
        organization_id: organizationId,
        is_cash_equivalent: true,
        is_active: true,
        allows_posting: true,
      })
      .select<Array<{ id: string; code: string; name: string }>>('id', 'code', 'name');

    if (cashAccounts.length === 0) {
      return {
        period: { from: filters.startDate, to: filters.endDate },
        openingCash: 0,
        closingCash: 0,
        cashVariation: 0,
        sections: {
          operating: { inflows: 0, outflows: 0, net: 0, details: [] },
          investing: { inflows: 0, outflows: 0, net: 0, details: [] },
          financing: { inflows: 0, outflows: 0, net: 0, details: [] },
        },
        reconciliation: { computedClosing: 0, matches: true },
        warning:
          'Nenhuma conta marcada como "equivalente de caixa". Configure no plano de contas.',
      };
    }

    const cashIds = cashAccounts.map((a) => a.id);

    // Helper: saldo líquido (D − C) em contas de caixa até uma data
    const cashBalanceUntil = async (untilDate: string, inclusive: boolean) => {
      const op = inclusive ? '<=' : '<';
      const row = await this.knex('accounting_journal_entry_lines as l')
        .innerJoin('accounting_journal_entries as e', 'l.journal_entry_id', 'e.id')
        .whereIn('l.account_id', cashIds)
        .andWhere('l.organization_id', organizationId)
        .andWhere('e.status', 'posted')
        .andWhere('e.entry_date', op, untilDate)
        .select(
          this.knex.raw(
            `COALESCE(SUM(CASE WHEN l.line_type = 'debit' THEN l.amount ELSE 0 END), 0) AS debit_sum`,
          ),
          this.knex.raw(
            `COALESCE(SUM(CASE WHEN l.line_type = 'credit' THEN l.amount ELSE 0 END), 0) AS credit_sum`,
          ),
        )
        .first<{ debit_sum: string | number; credit_sum: string | number }>();
      return Number(row.debit_sum) - Number(row.credit_sum);
    };

    const openingCash = await cashBalanceUntil(filters.startDate, false);
    const closingCash = await cashBalanceUntil(filters.endDate, true);

    // 2. IDs dos journal_entries no período que tocam alguma conta de caixa
    const entryIdsRows = await this.knex('accounting_journal_entry_lines as l')
      .innerJoin('accounting_journal_entries as e', 'l.journal_entry_id', 'e.id')
      .whereIn('l.account_id', cashIds)
      .andWhere('l.organization_id', organizationId)
      .andWhere('e.status', 'posted')
      .andWhereBetween('e.entry_date', [filters.startDate, filters.endDate])
      .distinct('e.id')
      .select<Array<{ id: string }>>('e.id');

    const entryIds = entryIdsRows.map((r) => r.id);
    if (entryIds.length === 0) {
      return {
        period: { from: filters.startDate, to: filters.endDate },
        openingCash,
        closingCash,
        cashVariation: closingCash - openingCash,
        sections: {
          operating: { inflows: 0, outflows: 0, net: 0, details: [] },
          investing: { inflows: 0, outflows: 0, net: 0, details: [] },
          financing: { inflows: 0, outflows: 0, net: 0, details: [] },
        },
        reconciliation: {
          computedClosing: openingCash,
          matches: Math.abs(closingCash - openingCash) < 0.01,
        },
      };
    }

    // 3. Carrega todas as linhas NÃO-caixa desses lançamentos + suas contas
    const lines = await this.knex('accounting_journal_entry_lines as l')
      .innerJoin('accounting_chart_accounts as a', 'l.account_id', 'a.id')
      .whereIn('l.journal_entry_id', entryIds)
      .whereNotIn('l.account_id', cashIds)
      .andWhere('l.organization_id', organizationId)
      .select<
        Array<{
          account_id: string;
          code: string;
          name: string;
          account_type: string;
          dfc_category: string | null;
          line_type: 'debit' | 'credit';
          amount: string | number;
        }>
      >(
        'l.account_id',
        { code: 'a.code' },
        { name: 'a.name' },
        { account_type: 'a.account_type' },
        { dfc_category: 'a.dfc_category' },
        'l.line_type',
        'l.amount',
      );

    // 4. Categoriza cada linha + acumula
    interface BucketDetail {
      accountId: string;
      code: string;
      name: string;
      inflow: number;
      outflow: number;
    }
    const buckets: Record<'operating' | 'investing' | 'financing', Map<string, BucketDetail>> = {
      operating: new Map(),
      investing: new Map(),
      financing: new Map(),
    };
    const totals = {
      operating: { inflows: 0, outflows: 0 },
      investing: { inflows: 0, outflows: 0 },
      financing: { inflows: 0, outflows: 0 },
    };

    for (const line of lines) {
      const cat = this.inferDfcCategory(line.dfc_category, line.account_type, line.name);
      // contribuição ao caixa atribuível a esta linha:
      // credit (linha credita o contra-pé) → caixa foi debitado → entrada (+)
      // debit (linha debita o contra-pé) → caixa foi creditado → saída (−)
      const amount = Number(line.amount);
      const cashImpact = line.line_type === 'credit' ? amount : -amount;

      const bucket = buckets[cat];
      let detail = bucket.get(line.account_id);
      if (!detail) {
        detail = {
          accountId: line.account_id,
          code: line.code,
          name: line.name,
          inflow: 0,
          outflow: 0,
        };
        bucket.set(line.account_id, detail);
      }
      if (cashImpact >= 0) {
        detail.inflow += cashImpact;
        totals[cat].inflows += cashImpact;
      } else {
        detail.outflow += Math.abs(cashImpact);
        totals[cat].outflows += Math.abs(cashImpact);
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const buildSection = (key: 'operating' | 'investing' | 'financing') => {
      const details = Array.from(buckets[key].values())
        .map((d) => ({
          ...d,
          inflow: round2(d.inflow),
          outflow: round2(d.outflow),
          net: round2(d.inflow - d.outflow),
        }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
      const inflows = round2(totals[key].inflows);
      const outflows = round2(totals[key].outflows);
      return {
        inflows,
        outflows,
        net: round2(inflows - outflows),
        details,
      };
    };

    const operating = buildSection('operating');
    const investing = buildSection('investing');
    const financing = buildSection('financing');
    const totalNet = round2(operating.net + investing.net + financing.net);
    const computedClosing = round2(openingCash + totalNet);
    const matches = Math.abs(computedClosing - closingCash) < 0.01;

    return {
      period: { from: filters.startDate, to: filters.endDate },
      openingCash: round2(openingCash),
      closingCash: round2(closingCash),
      cashVariation: round2(closingCash - openingCash),
      sections: { operating, investing, financing },
      reconciliation: { computedClosing, matches },
    };
  }

  /** Default DFC category quando a conta não tem `dfc_category` setado. */
  private inferDfcCategory(
    explicit: string | null,
    accountType: string,
    name: string,
  ): 'operating' | 'investing' | 'financing' {
    if (explicit === 'operating' || explicit === 'investing' || explicit === 'financing')
      return explicit;
    const lname = name.toLowerCase();
    if (/(imobilizad|ativo fixo|equipament|veículo|veiculo|máquinas|maquinas|investiment)/i.test(lname))
      return 'investing';
    if (accountType === 'equity') return 'financing';
    if (
      accountType === 'liability' &&
      /(empréstim|emprestim|financiament|loan|debêntur|debentur)/i.test(lname)
    )
      return 'financing';
    // Default: operacional (receita, despesa, AR, AP, impostos, estoque…)
    return 'operating';
  }
}
