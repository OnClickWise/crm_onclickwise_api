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
import { CreateExchangeRateDto } from './dtos/create-exchange-rate.dto';

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

export interface ExchangeRateRow {
  id: string;
  organization_id: string;
  from_currency: string;
  to_currency: string;
  rate_date: string;
  rate: string | number;
  source: string;
  created_at: Date;
}

/**
 * Gestão de cotações cambiais por par de moedas + data.
 * Suporta lookup eficiente "qual é a taxa AOA→BRL em 15/03/2026?".
 *
 * Estratégia de lookup:
 *  1. Busca cotação exata do dia.
 *  2. Se não houver, pega a cotação mais recente ANTERIOR à data solicitada.
 *  3. Se não houver, tenta o caminho inverso (1/rate) com a moeda invertida.
 *  4. Se ainda assim não houver, retorna null — caller decide o fallback.
 *
 * Importante: tudo é PER ORGANIZATION. Cada organização mantém suas próprias
 * cotações (uma org pode confiar em fonte X, outra em Y).
 */
@Injectable()
export class ExchangeRatesService {
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
      throw new ForbiddenException('Sem permissão para gerenciar câmbios');
    }
  }

  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para consultar câmbios');
    }
  }

  async create(dto: CreateExchangeRateDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('Moedas de origem e destino devem ser diferentes');
    }

    const id = randomUUID();
    const dateOnly = dto.rateDate.slice(0, 10);

    return this.knex.transaction(async (trx) => {
      // Upsert: se já existe cotação para este par+data, atualiza.
      const existing = await trx('exchange_rates')
        .where({
          organization_id: organizationId,
          from_currency: dto.fromCurrency,
          to_currency: dto.toCurrency,
          rate_date: dateOnly,
        })
        .first();

      if (existing) {
        await trx('exchange_rates')
          .where({ id: existing.id })
          .update({ rate: Number(dto.rate).toFixed(6), source: dto.source ?? 'manual' });
        return trx<ExchangeRateRow>('exchange_rates').where({ id: existing.id }).first();
      }

      await trx('exchange_rates').insert({
        id,
        organization_id: organizationId,
        from_currency: dto.fromCurrency,
        to_currency: dto.toCurrency,
        rate_date: dateOnly,
        rate: Number(dto.rate).toFixed(6),
        source: dto.source ?? 'manual',
        created_by: userId,
        created_at: new Date(),
      });
      return trx<ExchangeRateRow>('exchange_rates').where({ id }).first();
    });
  }

  async list(
    user: AuthUserPayload,
    filters?: { fromCurrency?: string; toCurrency?: string; from?: string; to?: string; limit?: number },
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    const limit = Math.max(1, Math.min(filters?.limit ?? 100, 500));

    const query = this.knex<ExchangeRateRow>('exchange_rates')
      .where({ organization_id: organizationId })
      .orderBy('rate_date', 'desc')
      .limit(limit);

    if (filters?.fromCurrency) query.andWhere({ from_currency: filters.fromCurrency.toUpperCase() });
    if (filters?.toCurrency) query.andWhere({ to_currency: filters.toCurrency.toUpperCase() });
    if (filters?.from) query.andWhere('rate_date', '>=', filters.from);
    if (filters?.to) query.andWhere('rate_date', '<=', filters.to);

    return query;
  }

  async remove(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    const deleted = await this.knex('exchange_rates')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Cotação não encontrada');
    return { success: true };
  }

  /**
   * Busca a melhor taxa disponível: exata na data → última anterior → inversa (1/rate).
   * Retorna `null` se não houver nenhuma cotação aplicável.
   */
  async lookupRate(
    user: AuthUserPayload,
    fromCurrency: string,
    toCurrency: string,
    referenceDate: string,
  ): Promise<{ rate: number; source: 'direct' | 'older' | 'inverse'; rateDate: string } | null> {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    const dateOnly = referenceDate.slice(0, 10);
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (from === to) {
      return { rate: 1, source: 'direct', rateDate: dateOnly };
    }

    // 1) Direto: busca cotação igual ou anterior ao referenceDate
    const direct = await this.knex<ExchangeRateRow>('exchange_rates')
      .where({ organization_id: organizationId, from_currency: from, to_currency: to })
      .andWhere('rate_date', '<=', dateOnly)
      .orderBy('rate_date', 'desc')
      .first();
    if (direct) {
      const rd = String(direct.rate_date).slice(0, 10);
      return {
        rate: Number(direct.rate),
        source: rd === dateOnly ? 'direct' : 'older',
        rateDate: rd,
      };
    }

    // 2) Inversa: busca to→from e calcula 1/rate
    const inverse = await this.knex<ExchangeRateRow>('exchange_rates')
      .where({ organization_id: organizationId, from_currency: to, to_currency: from })
      .andWhere('rate_date', '<=', dateOnly)
      .orderBy('rate_date', 'desc')
      .first();
    if (inverse && Number(inverse.rate) > 0) {
      return {
        rate: 1 / Number(inverse.rate),
        source: 'inverse',
        rateDate: String(inverse.rate_date).slice(0, 10),
      };
    }

    return null;
  }

  /**
   * Endpoint público (controller) — converte um valor entre moedas usando lookupRate.
   */
  async convert(
    user: AuthUserPayload,
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    referenceDate: string,
  ) {
    const found = await this.lookupRate(user, fromCurrency, toCurrency, referenceDate);
    if (!found) {
      throw new NotFoundException(
        `Cotação não encontrada para ${fromCurrency.toUpperCase()}→${toCurrency.toUpperCase()} em ${referenceDate}`,
      );
    }
    const converted = Number((amount * found.rate).toFixed(6));
    return {
      amount,
      fromCurrency: fromCurrency.toUpperCase(),
      toCurrency: toCurrency.toUpperCase(),
      rate: found.rate,
      rateSource: found.source,
      rateDate: found.rateDate,
      convertedAmount: converted,
    };
  }
}
