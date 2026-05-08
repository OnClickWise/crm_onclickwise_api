import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { UpdateFinanceConfigDto } from './dtos/update-finance-config.dto';

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

const WRITE_ROLES = ['master', 'admin'] as const;
const READ_ROLES = ['master', 'admin', 'accountant', 'financial_operator', 'sales', 'procurement'] as const;

export interface FinanceConfigRow {
  organization_id: string;
  locale: string;
  default_currency: string;
  country: string;
  fiscal_year_start_month: number;
  tax_mode: string;
  decimal_separator: string;
  thousands_separator: string;
  updated_at: Date;
}

/**
 * Defaults razoáveis para nova organização que ainda não configurou.
 * Brasil é o default por ser onde o produto nasceu.
 */
const DEFAULT_CONFIG: Omit<FinanceConfigRow, 'organization_id' | 'updated_at'> = {
  locale: 'pt-BR',
  default_currency: 'BRL',
  country: 'BR',
  fiscal_year_start_month: 1,
  tax_mode: 'exclusive',
  decimal_separator: ',',
  thousands_separator: '.',
};

@Injectable()
export class FinanceConfigService {
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

  /**
   * Retorna config existente OU defaults se ainda não foi customizada.
   * Não cria registro implícito — só faz upsert quando a org realmente alterou algo.
   */
  async get(user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para consultar configuração financeira');
    }

    const row = await this.knex<FinanceConfigRow>('organization_finance_config')
      .where({ organization_id: organizationId })
      .first();

    if (row) return row;

    return {
      organization_id: organizationId,
      ...DEFAULT_CONFIG,
      updated_at: new Date(),
    };
  }

  async update(dto: UpdateFinanceConfigDto, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number])) {
      throw new ForbiddenException('Apenas master ou admin podem alterar configuração financeira');
    }

    const patch: Partial<FinanceConfigRow> = {
      updated_at: new Date(),
      ...(dto.locale !== undefined && { locale: dto.locale }),
      ...(dto.defaultCurrency !== undefined && { default_currency: dto.defaultCurrency.toUpperCase() }),
      ...(dto.country !== undefined && { country: dto.country.toUpperCase() }),
      ...(dto.fiscalYearStartMonth !== undefined && { fiscal_year_start_month: dto.fiscalYearStartMonth }),
      ...(dto.taxMode !== undefined && { tax_mode: dto.taxMode }),
      ...(dto.decimalSeparator !== undefined && { decimal_separator: dto.decimalSeparator }),
      ...(dto.thousandsSeparator !== undefined && { thousands_separator: dto.thousandsSeparator }),
    };

    return this.knex.transaction(async (trx) => {
      const existing = await trx<FinanceConfigRow>('organization_finance_config')
        .where({ organization_id: organizationId })
        .first();

      if (existing) {
        await trx('organization_finance_config')
          .where({ organization_id: organizationId })
          .update(patch);
      } else {
        // Insert com defaults + patch
        await trx('organization_finance_config').insert({
          organization_id: organizationId,
          ...DEFAULT_CONFIG,
          ...patch,
        });
      }

      const updated = await trx<FinanceConfigRow>('organization_finance_config')
        .where({ organization_id: organizationId })
        .first();
      return updated!;
    });
  }
}
