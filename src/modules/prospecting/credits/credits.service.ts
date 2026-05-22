import {
  ForbiddenException,
  HttpException,
  HttpStatus,
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

const READ_ROLES = ['master', 'admin', 'sales', 'sdr', 'manager', 'employee'] as const;
const ADMIN_ROLES = ['master', 'admin'] as const;

export interface CreditsRow {
  organization_id: string;
  monthly_quota: number;
  used_this_period: number;
  rollover_credits: number;
  period_start: Date | string;
  last_reset_at: Date | string;
  updated_at: Date;
}

const DEFAULT_QUOTA = Number(process.env.PROSPECT_DEFAULT_MONTHLY_QUOTA ?? 100);

/**
 * Gerencia créditos de prospecção por organização.
 *
 * Modelo:
 *  - Cada org tem uma quota mensal (default 100, configurável por admin).
 *  - `used_this_period` reseta no 1º dia de cada mês (rollover automático no get/update).
 *  - `rollover_credits` permite saldo positivo carregar (futuro).
 *  - `consume(n)` valida disponibilidade ANTES de chamar Apollo, então nunca cobra
 *    crédito que não foi usado de fato.
 *
 * Auditoria: chamadas que consumiram créditos também são gravadas em
 * `prospect_searches` pelos serviços que invocam Apollo.
 */
@Injectable()
export class ProspectingCreditsService {
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

  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para consultar créditos de prospecção');
    }
  }

  private ensureAdmin(role: string) {
    if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
      throw new ForbiddenException('Apenas master/admin podem ajustar quota de créditos');
    }
  }

  /**
   * Garante existência de row + reseta período se virou novo mês.
   */
  private async ensureRow(organizationId: string, trx?: Knex.Transaction): Promise<CreditsRow> {
    const conn = trx ?? this.knex;
    let row = await conn<CreditsRow>('prospect_credits')
      .where({ organization_id: organizationId })
      .first();

    if (!row) {
      const now = new Date();
      await conn('prospect_credits').insert({
        organization_id: organizationId,
        monthly_quota: DEFAULT_QUOTA,
        used_this_period: 0,
        rollover_credits: 0,
        period_start: now,
        last_reset_at: now,
        updated_at: now,
      });
      row = await conn<CreditsRow>('prospect_credits')
        .where({ organization_id: organizationId })
        .first();
    }

    // Reset mensal: se period_start é de mês anterior, zera contador.
    const periodStart = new Date(row!.period_start);
    const now = new Date();
    if (
      periodStart.getUTCFullYear() !== now.getUTCFullYear() ||
      periodStart.getUTCMonth() !== now.getUTCMonth()
    ) {
      await conn('prospect_credits')
        .where({ organization_id: organizationId })
        .update({
          used_this_period: 0,
          period_start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
          last_reset_at: now,
          updated_at: now,
        });
      row = await conn<CreditsRow>('prospect_credits')
        .where({ organization_id: organizationId })
        .first();
    }

    return row!;
  }

  async getOverview(user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);
    const row = await this.ensureRow(organizationId);
    return {
      monthlyQuota: row.monthly_quota,
      usedThisPeriod: row.used_this_period,
      remaining: Math.max(0, row.monthly_quota - row.used_this_period) + row.rollover_credits,
      rolloverCredits: row.rollover_credits,
      periodStart: row.period_start,
      percentUsed:
        row.monthly_quota > 0
          ? Math.min(100, Math.round((row.used_this_period / row.monthly_quota) * 100))
          : 0,
    };
  }

  /**
   * Consome `n` créditos atomicamente.
   * Lança 402 PaymentRequired se não houver saldo.
   * Retorna saldo restante.
   */
  async consume(organizationId: string, amount: number): Promise<number> {
    if (amount <= 0) return 0;

    return this.knex.transaction(async (trx) => {
      // SELECT FOR UPDATE pra garantir atomicidade sob concorrência.
      const row = await this.ensureRow(organizationId, trx);
      const lockedRow = await trx<CreditsRow>('prospect_credits')
        .where({ organization_id: organizationId })
        .forUpdate()
        .first();
      const currentUsed = Number(lockedRow?.used_this_period ?? row.used_this_period);
      const currentRollover = Number(lockedRow?.rollover_credits ?? row.rollover_credits);
      const remaining = row.monthly_quota - currentUsed + currentRollover;

      if (remaining < amount) {
        throw new HttpException(
          {
            message: `Créditos insuficientes: ${remaining} disponíveis, ${amount} necessários. Aguarde o reset mensal ou contate o admin para aumentar a quota.`,
            statusCode: HttpStatus.PAYMENT_REQUIRED,
            error: 'Payment Required',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      // Consome primeiro do rollover, depois do mensal.
      let newUsed = currentUsed;
      let newRollover = currentRollover;
      const fromRollover = Math.min(currentRollover, amount);
      newRollover -= fromRollover;
      newUsed += amount - fromRollover;

      await trx('prospect_credits').where({ organization_id: organizationId }).update({
        used_this_period: newUsed,
        rollover_credits: newRollover,
        updated_at: new Date(),
      });

      return row.monthly_quota - newUsed + newRollover;
    });
  }

  async setQuota(user: AuthUserPayload, monthlyQuota: number): Promise<CreditsRow> {
    const { organizationId, role } = this.getScope(user);
    this.ensureAdmin(role);
    if (monthlyQuota < 0) {
      throw new ForbiddenException('Quota não pode ser negativa');
    }
    await this.ensureRow(organizationId);
    await this.knex('prospect_credits')
      .where({ organization_id: organizationId })
      .update({ monthly_quota: monthlyQuota, updated_at: new Date() });
    const updated = await this.knex<CreditsRow>('prospect_credits')
      .where({ organization_id: organizationId })
      .first();
    return updated!;
  }

  /**
   * Registra search no audit log.
   */
  async logSearch(
    organizationId: string,
    userId: string | undefined,
    searchType: string,
    filters: Record<string, unknown>,
    resultsCount: number,
    creditsUsed: number,
    fromCache: boolean,
  ): Promise<void> {
    await this.knex('prospect_searches').insert({
      id: this.uuid(),
      organization_id: organizationId,
      search_type: searchType,
      filters: JSON.stringify(filters),
      results_count: resultsCount,
      credits_used: creditsUsed,
      served_from_cache: fromCache,
      user_id: userId ?? null,
      created_at: new Date(),
    });
  }

  private uuid(): string {
    // Pequeno helper local pra não importar randomUUID em todo lugar.

    return require('crypto').randomUUID();
  }
}
