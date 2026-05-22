import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';

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

const READ_ROLES = ['master', 'admin', 'manager', 'accountant', 'financial_operator'] as const;

export interface CashFlowPeriod {
  month: string; // 'YYYY-MM'
  label: string;
  inflows: number;
  outflows: number;
  net: number;
  projectedBalance: number;
  isOverdueBucket: boolean;
}

export interface CashFlowProjection {
  startingBalance: number;
  generatedAt: string;
  periods: CashFlowPeriod[];
  summary: {
    totalInflows: number;
    totalOutflows: number;
    netTotal: number;
    finalBalance: number;
    lowestBalance: number;
    lowestBalanceMonth: string | null;
  };
}

/**
 * Fluxo de Caixa Projetado.
 *
 * Projeta a posição de caixa para os próximos N meses combinando:
 *  - Saldo atual das contas bancárias (ponto de partida)
 *  - Contas a Receber em aberto (entradas, por data de vencimento)
 *  - Contas a Pagar em aberto (saídas, por data de vencimento)
 *
 * Itens vencidos (overdue) entram no primeiro período ("Vencidos + mês atual").
 */
@Injectable()
export class CashFlowService {
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
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar o fluxo de caixa');
  }

  private monthKey(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private monthLabel(key: string): string {
    const [y, m] = key.split('-');
    const names = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
    ];
    return `${names[Number(m) - 1]}/${y}`;
  }

  async project(
    user: AuthUserPayload,
    months = 6,
  ): Promise<CashFlowProjection> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const horizon = Math.min(24, Math.max(1, months));

    // 1. Saldo de partida — soma das contas bancárias ativas
    const bankRow = await this.knex('bank_accounts')
      .where({ organization_id: organizationId, is_active: true })
      .sum<{ total: string | null }[]>('current_balance as total')
      .first();
    const startingBalance = Number(bankRow?.total ?? 0);

    // 2. Janela de meses
    const now = new Date();
    const currentKey = this.monthKey(now);
    const monthKeys: string[] = [];
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    for (let i = 0; i < horizon; i++) {
      monthKeys.push(this.monthKey(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const lastKey = monthKeys[monthKeys.length - 1];

    // 3. Entradas — Contas a Receber em aberto
    const receivables = await this.knex('accounts_receivable')
      .where({ organization_id: organizationId })
      .whereIn('status', ['issued', 'partial', 'overdue'])
      .select<Array<{ due_date: Date | string; outstanding_amount: string | number }>>(
        'due_date',
        'outstanding_amount',
      );

    // 4. Saídas — Contas a Pagar em aberto
    const payables = await this.knex('accounts_payable')
      .where({ organization_id: organizationId })
      .whereIn('status', ['issued', 'partial', 'overdue'])
      .select<Array<{ due_date: Date | string; outstanding_amount: string | number }>>(
        'due_date',
        'outstanding_amount',
      );

    // 5. Bucketiza por mês de vencimento. Vencidos → primeiro mês.
    const inflowByMonth = new Map<string, number>();
    const outflowByMonth = new Map<string, number>();

    const bucketize = (
      rows: Array<{ due_date: Date | string; outstanding_amount: string | number }>,
      target: Map<string, number>,
    ) => {
      for (const r of rows) {
        const due = new Date(r.due_date);
        let key = this.monthKey(due);
        // Antes do mês atual → cai no bucket do mês atual
        if (key < currentKey) key = currentKey;
        // Depois do horizonte → ignora (fora da projeção)
        if (key > lastKey) continue;
        target.set(key, (target.get(key) ?? 0) + Number(r.outstanding_amount));
      }
    };
    bucketize(receivables, inflowByMonth);
    bucketize(payables, outflowByMonth);

    // 6. Monta períodos com saldo acumulado
    let running = startingBalance;
    let lowestBalance = startingBalance;
    let lowestBalanceMonth: string | null = null;
    let totalInflows = 0;
    let totalOutflows = 0;

    const periods: CashFlowPeriod[] = monthKeys.map((key, idx) => {
      const inflows = Math.round((inflowByMonth.get(key) ?? 0) * 100) / 100;
      const outflows = Math.round((outflowByMonth.get(key) ?? 0) * 100) / 100;
      const net = Math.round((inflows - outflows) * 100) / 100;
      running = Math.round((running + net) * 100) / 100;
      totalInflows += inflows;
      totalOutflows += outflows;
      if (running < lowestBalance) {
        lowestBalance = running;
        lowestBalanceMonth = key;
      }
      return {
        month: key,
        label: idx === 0 ? `${this.monthLabel(key)} (+ vencidos)` : this.monthLabel(key),
        inflows,
        outflows,
        net,
        projectedBalance: running,
        isOverdueBucket: idx === 0,
      };
    });

    return {
      startingBalance,
      generatedAt: new Date().toISOString(),
      periods,
      summary: {
        totalInflows: Math.round(totalInflows * 100) / 100,
        totalOutflows: Math.round(totalOutflows * 100) / 100,
        netTotal: Math.round((totalInflows - totalOutflows) * 100) / 100,
        finalBalance: running,
        lowestBalance,
        lowestBalanceMonth,
      },
    };
  }
}
