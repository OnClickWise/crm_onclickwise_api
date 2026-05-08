import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { ReportsService } from '../reports/reports.service';

interface AuthUserPayload {
  organizationId?: string;
  userId?: string;
  role?: string;
}

const ALLOWED_ROLES = ['master', 'admin', 'accountant', 'financial_operator'] as const;

/**
 * Exportador universal — gera CSV de qualquer relatório contábil.
 * Inclui BOM UTF-8 para Excel reconhecer acentos em qualquer locale.
 *
 * Princípios:
 *  - Usa o ReportsService como fonte de verdade (não duplica lógica).
 *  - CSV com separador ; (mais compatível com Excel BR/PT/ES/FR onde , é decimal).
 *  - Aspas duplas em todo campo + escape de aspas internas.
 *  - Datas em ISO (YYYY-MM-DD) para evitar ambiguidade — UI converte ao locale.
 *  - Decimais com . (canônico) — usuário formata na planilha.
 */
@Injectable()
export class ExportsService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly reports: ReportsService,
  ) {}

  private getScope(user: AuthUserPayload | undefined) {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuário sem organização vinculada');
    }
    const role = String(user.role ?? '').toLowerCase();
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para exportar relatórios');
    }
    return { organizationId: user.organizationId, role };
  }

  // ─── Helpers de CSV ──────────────────────────────────────────────────────────

  private csvEscape(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s = typeof value === 'number' ? String(value) : String(value);
    // Escapa aspas duplas e wrappa em aspas para preservar separadores e quebras de linha.
    return `"${s.replace(/"/g, '""')}"`;
  }

  private buildCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
    const headerLine = headers.map((h) => this.csvEscape(h)).join(';');
    const dataLines = rows.map((row) =>
      headers.map((h) => this.csvEscape(row[h] ?? '')).join(';'),
    );
    // BOM UTF-8 (﻿) para Excel reconhecer encoding em sistemas Windows.
    return '﻿' + [headerLine, ...dataLines].join('\r\n');
  }

  // ─── Plano de Contas ─────────────────────────────────────────────────────────

  async exportChartOfAccounts(user: AuthUserPayload): Promise<string> {
    const { organizationId } = this.getScope(user);
    const accounts = await this.knex('accounting_chart_accounts')
      .where({ organization_id: organizationId })
      .orderBy([{ column: 'level', order: 'asc' }, { column: 'code', order: 'asc' }])
      .select(
        'code',
        'name',
        'account_type',
        'normal_balance',
        'level',
        'is_active',
        'allows_posting',
        'description',
      );

    return this.buildCsv(accounts, [
      'code',
      'name',
      'account_type',
      'normal_balance',
      'level',
      'is_active',
      'allows_posting',
      'description',
    ]);
  }

  // ─── Lançamentos ─────────────────────────────────────────────────────────────

  async exportJournalEntries(
    user: AuthUserPayload,
    filters: { startDate: string; endDate: string },
  ): Promise<string> {
    const data = await this.reports.livroDiario(user, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      page: 1,
      limit: 200,
    });

    // Achata: cada linha = 1 movimento de partida.
    const rows: Array<Record<string, unknown>> = [];
    for (const entry of data.entries) {
      for (const line of entry.lines) {
        rows.push({
          entry_date: this.formatIsoDate(entry.entry_date),
          entry_description: entry.description,
          status: entry.status,
          account_code: line.account_code,
          account_name: line.account_name,
          line_type: line.line_type,
          amount: Number(line.amount).toFixed(2),
          memo: line.memo ?? '',
        });
      }
    }

    return this.buildCsv(rows, [
      'entry_date',
      'entry_description',
      'status',
      'account_code',
      'account_name',
      'line_type',
      'amount',
      'memo',
    ]);
  }

  // ─── Balancete ───────────────────────────────────────────────────────────────

  async exportBalancete(
    user: AuthUserPayload,
    filters: { startDate: string; endDate: string; accountType?: string },
  ): Promise<string> {
    const data = await this.reports.balancete(user, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      accountType: filters.accountType,
      onlyWithMovements: false,
    });

    const rows = data.lines.map((line) => ({
      code: line.code,
      name: line.name,
      account_type: line.account_type,
      level: line.level,
      total_debit: Number(line.total_debit).toFixed(2),
      total_credit: Number(line.total_credit).toFixed(2),
      balance: Number(line.balance).toFixed(2),
      has_movements: line.has_movements ? 'sim' : 'não',
    }));

    return this.buildCsv(rows, [
      'code',
      'name',
      'account_type',
      'level',
      'total_debit',
      'total_credit',
      'balance',
      'has_movements',
    ]);
  }

  // ─── DRE ─────────────────────────────────────────────────────────────────────

  async exportDre(user: AuthUserPayload, filters: { startDate: string; endDate: string }): Promise<string> {
    const data = await this.reports.dre(user, filters);

    const rows: Array<Record<string, unknown>> = [];

    for (const acc of data.sections.revenue.accounts) {
      rows.push({
        section: 'Receitas',
        code: acc.code,
        name: acc.name,
        balance: acc.balance.toFixed(2),
      });
    }
    rows.push({ section: 'Receitas', code: '', name: 'TOTAL RECEITAS', balance: data.sections.revenue.total.toFixed(2) });

    for (const acc of data.sections.expense.accounts) {
      rows.push({
        section: 'Despesas',
        code: acc.code,
        name: acc.name,
        balance: acc.balance.toFixed(2),
      });
    }
    rows.push({ section: 'Despesas', code: '', name: 'TOTAL DESPESAS', balance: data.sections.expense.total.toFixed(2) });
    rows.push({ section: 'Resultado', code: '', name: 'RESULTADO LÍQUIDO', balance: data.result.netIncome.toFixed(2) });

    return this.buildCsv(rows, ['section', 'code', 'name', 'balance']);
  }

  // ─── Balanço ─────────────────────────────────────────────────────────────────

  async exportBalanco(user: AuthUserPayload, filters: { referenceDate: string }): Promise<string> {
    const data = await this.reports.balanco(user, filters);

    const rows: Array<Record<string, unknown>> = [];

    for (const section of ['asset', 'liability', 'equity'] as const) {
      const sec = data.sections[section];
      for (const acc of sec.accounts) {
        rows.push({
          section: sec.label,
          code: acc.code,
          name: acc.name,
          balance: Number(acc.balance).toFixed(2),
        });
      }
      rows.push({
        section: sec.label,
        code: '',
        name: `TOTAL ${sec.label.toUpperCase()}`,
        balance: sec.total.toFixed(2),
      });
    }
    rows.push({
      section: 'Resultado',
      code: '',
      name: 'RESULTADO DO EXERCÍCIO',
      balance: data.netIncome.value.toFixed(2),
    });
    rows.push({
      section: 'Verificação',
      code: '',
      name: data.totals.balanced ? 'BALANÇO EQUILIBRADO ✓' : `DESEQUILÍBRIO (${data.totals.difference.toFixed(2)})`,
      balance: data.totals.totalAsset.toFixed(2),
    });

    return this.buildCsv(rows, ['section', 'code', 'name', 'balance']);
  }

  private formatIsoDate(date: string | Date): string {
    if (date instanceof Date) return date.toISOString().slice(0, 10);
    return String(date).slice(0, 10);
  }
}
