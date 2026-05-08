import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { AccountSeedEntry, CHART_OF_ACCOUNTS_SEED } from './chart-of-accounts-seed.data';
import { CHART_OF_ACCOUNTS_PGC_ANGOLA } from './chart-of-accounts-pgc-angola.data';
import { CHART_OF_ACCOUNTS_SNC_PORTUGAL } from './chart-of-accounts-snc-portugal.data';
import { CHART_OF_ACCOUNTS_PGC_SPAIN } from './chart-of-accounts-pgc-spain.data';
import { CHART_OF_ACCOUNTS_PCG_FRANCE } from './chart-of-accounts-pcg-france.data';
import { CHART_OF_ACCOUNTS_US_STANDARD } from './chart-of-accounts-us-standard.data';

export const CHART_TEMPLATES = ['brazil', 'angola', 'portugal', 'spain', 'france', 'us'] as const;
export type ChartTemplate = (typeof CHART_TEMPLATES)[number];

const TEMPLATES: Record<ChartTemplate, { entries: AccountSeedEntry[]; label: string }> = {
  brazil: { entries: CHART_OF_ACCOUNTS_SEED, label: 'plano de contas padrão brasileiro (NBC TG)' },
  angola: { entries: CHART_OF_ACCOUNTS_PGC_ANGOLA, label: 'PGC Angola (Plano Geral de Contabilidade)' },
  portugal: { entries: CHART_OF_ACCOUNTS_SNC_PORTUGAL, label: 'SNC Portugal (Sistema de Normalização Contabilística)' },
  spain: { entries: CHART_OF_ACCOUNTS_PGC_SPAIN, label: 'PGC España (Plan General de Contabilidad)' },
  france: { entries: CHART_OF_ACCOUNTS_PCG_FRANCE, label: 'PCG France (Plan Comptable Général)' },
  us: { entries: CHART_OF_ACCOUNTS_US_STANDARD, label: 'US Standard Chart of Accounts' },
};

interface AuthUserPayload {
  organizationId?: string;
  userId?: string;
  role?: string;
}

@Injectable()
export class SeedService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: AuthUserPayload | undefined) {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuario sem organizacao vinculada');
    }
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }

  private ensureRole(role: string) {
    if (!['master', 'admin'].includes(role)) {
      throw new ForbiddenException('Apenas master ou admin podem executar o seed do plano de contas');
    }
  }

  /**
   * Seed do plano de contas. Aceita template opcional ('brazil' default, 'angola' alternativo).
   * Retroatividade: chamadas antigas sem template continuam funcionando exatamente igual.
   */
  async seedChartOfAccounts(user: AuthUserPayload, template: ChartTemplate = 'brazil') {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureRole(role);

    if (!TEMPLATES[template]) {
      throw new BadRequestException(
        `Template inválido: '${template}'. Use um dos: ${CHART_TEMPLATES.join(', ')}.`,
      );
    }

    const existingCount = await this.knex('accounting_chart_accounts')
      .where({ organization_id: organizationId })
      .count('id as total')
      .first();

    if (Number(existingCount?.total) > 0) {
      throw new BadRequestException(
        'O plano de contas desta organização já possui registros. ' +
          'Use o endpoint de limpeza antes de fazer o seed novamente.',
      );
    }

    const { entries, label } = TEMPLATES[template];
    const now = new Date();
    let created = 0;

    await this.knex.transaction(async (trx) => {
      const insertLevel = async (
        list: AccountSeedEntry[],
        parentId: string | null,
        level: number,
      ) => {
        for (const entry of list) {
          const id = randomUUID();
          await trx('accounting_chart_accounts').insert({
            id,
            organization_id: organizationId,
            code: entry.code,
            name: entry.name,
            account_type: entry.accountType,
            normal_balance: entry.normalBalance,
            parent_id: parentId,
            level,
            is_active: true,
            allows_posting: entry.allowsPosting,
            description: null,
            created_by: userId,
            updated_by: userId,
            created_at: now,
            updated_at: now,
          });
          created++;

          if (entry.children?.length) {
            await insertLevel(entry.children, id, level + 1);
          }
        }
      };

      await insertLevel(entries, null, 1);
    });

    return {
      success: true,
      template,
      message: `Plano de contas (${label}) criado com sucesso.`,
      total_accounts: created,
    };
  }
}
