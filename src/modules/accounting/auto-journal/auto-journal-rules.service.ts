import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { AmountSource } from './auto-journal.service';

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

const ACCOUNTANT_ROLES = ['master', 'admin', 'accountant', 'manager'] as const;

interface RuleLineInput {
  lineType: 'debit' | 'credit';
  accountId?: string | null;
  amountSource: AmountSource;
  memoTemplate?: string | null;
}

/**
 * Catálogo dos eventos suportados e o "template padrão" de cada um.
 * `accountMatch` é uma dica para o seed automático tentar achar a conta
 * certa no plano de contas da organização.
 */
export interface CatalogLine {
  lineType: 'debit' | 'credit';
  amountSource: AmountSource;
  accountMatch: string;
  memo: string;
}
export interface CatalogEvent {
  name: string;
  description: string;
  lines: CatalogLine[];
}

export const EVENT_CATALOG: Record<string, CatalogEvent> = {
  sales_invoice: {
    name: 'Fatura de Venda',
    description: 'Reconhece receita e imposto quando uma fatura de venda é emitida.',
    lines: [
      { lineType: 'debit', amountSource: 'total', accountMatch: 'receivable', memo: 'Clientes a receber' },
      { lineType: 'credit', amountSource: 'subtotal', accountMatch: 'revenue', memo: 'Receita de vendas' },
      { lineType: 'credit', amountSource: 'tax', accountMatch: 'tax_payable', memo: 'Impostos sobre vendas' },
    ],
  },
  sales_credit_note: {
    name: 'Nota de Crédito de Venda',
    description: 'Estorna receita e imposto quando uma NC de venda é emitida.',
    lines: [
      { lineType: 'debit', amountSource: 'subtotal', accountMatch: 'revenue', memo: 'Estorno de receita' },
      { lineType: 'debit', amountSource: 'tax', accountMatch: 'tax_payable', memo: 'Estorno de imposto' },
      { lineType: 'credit', amountSource: 'total', accountMatch: 'receivable', memo: 'Crédito ao cliente' },
    ],
  },
  purchase_invoice: {
    name: 'Fatura de Compra',
    description: 'Reconhece estoque/despesa e imposto a recuperar ao registrar fatura do fornecedor.',
    lines: [
      { lineType: 'debit', amountSource: 'subtotal', accountMatch: 'inventory', memo: 'Entrada de estoque' },
      { lineType: 'debit', amountSource: 'tax', accountMatch: 'tax_recoverable', memo: 'Imposto a recuperar' },
      { lineType: 'credit', amountSource: 'net_total', accountMatch: 'payable', memo: 'Fornecedores a pagar' },
      { lineType: 'credit', amountSource: 'withholding', accountMatch: 'withholding_payable', memo: 'Retenção na fonte' },
    ],
  },
  purchase_credit_note: {
    name: 'Nota de Crédito de Compra',
    description: 'Estorna estoque e imposto quando o fornecedor emite NC.',
    lines: [
      { lineType: 'debit', amountSource: 'net_total', accountMatch: 'payable', memo: 'Débito ao fornecedor' },
      { lineType: 'credit', amountSource: 'subtotal', accountMatch: 'inventory', memo: 'Estorno de estoque' },
      { lineType: 'credit', amountSource: 'tax', accountMatch: 'tax_recoverable', memo: 'Estorno de imposto' },
    ],
  },
  purchase_receipt: {
    name: 'Recepção de Mercadoria',
    description: 'Entrada física de estoque antes da fatura (mercadoria em trânsito).',
    lines: [
      { lineType: 'debit', amountSource: 'subtotal', accountMatch: 'inventory', memo: 'Entrada de estoque' },
      { lineType: 'credit', amountSource: 'subtotal', accountMatch: 'goods_in_transit', memo: 'Mercadoria a faturar' },
    ],
  },
  stock_adjustment_in: {
    name: 'Ajuste de Estoque (entrada)',
    description: 'Ajuste positivo de inventário (sobra).',
    lines: [
      { lineType: 'debit', amountSource: 'total', accountMatch: 'inventory', memo: 'Sobra de inventário' },
      { lineType: 'credit', amountSource: 'total', accountMatch: 'inventory_gain', memo: 'Ganho de inventário' },
    ],
  },
  stock_adjustment_out: {
    name: 'Ajuste de Estoque (saída)',
    description: 'Ajuste negativo de inventário (perda/quebra).',
    lines: [
      { lineType: 'debit', amountSource: 'total', accountMatch: 'inventory_loss', memo: 'Perda de inventário' },
      { lineType: 'credit', amountSource: 'total', accountMatch: 'inventory', memo: 'Baixa de estoque' },
    ],
  },
  sales_payment: {
    name: 'Recebimento de Cliente',
    description: 'Baixa de conta a receber quando o cliente efetua o pagamento.',
    lines: [
      { lineType: 'debit', amountSource: 'payment_amount', accountMatch: 'cash_bank', memo: 'Recebimento em banco/caixa' },
      { lineType: 'credit', amountSource: 'payment_amount', accountMatch: 'receivable', memo: 'Baixa de cliente' },
    ],
  },
  purchase_payment: {
    name: 'Pagamento a Fornecedor',
    description: 'Baixa de conta a pagar quando o fornecedor é pago.',
    lines: [
      { lineType: 'debit', amountSource: 'payment_amount', accountMatch: 'payable', memo: 'Baixa de fornecedor' },
      { lineType: 'credit', amountSource: 'payment_amount', accountMatch: 'cash_bank', memo: 'Pagamento em banco/caixa' },
    ],
  },
  sales_cogs: {
    name: 'Custo da Mercadoria Vendida',
    description: 'Reconhece o CMV e baixa o estoque quando uma venda é faturada.',
    lines: [
      { lineType: 'debit', amountSource: 'cogs', accountMatch: 'cogs_account', memo: 'Custo da mercadoria vendida' },
      { lineType: 'credit', amountSource: 'cogs', accountMatch: 'inventory', memo: 'Baixa de estoque' },
    ],
  },
  sales_cogs_return: {
    name: 'CMV — Devolução de Cliente',
    description: 'Reverte o CMV e devolve a mercadoria ao estoque numa devolução de cliente.',
    lines: [
      { lineType: 'debit', amountSource: 'cogs', accountMatch: 'inventory', memo: 'Retorno de mercadoria ao estoque' },
      { lineType: 'credit', amountSource: 'cogs', accountMatch: 'cogs_account', memo: 'Estorno de CMV' },
    ],
  },
};

/** Palavras-chave para casar contas do plano por nome. */
const ACCOUNT_MATCHERS: Record<string, { type: string; keywords: string[] }> = {
  receivable: { type: 'asset', keywords: ['client', 'receb', 'duplicata'] },
  revenue: { type: 'revenue', keywords: ['receita', 'venda', 'faturamento'] },
  tax_payable: { type: 'liability', keywords: ['imposto', 'iva', 'icms', 'iss', 'tax'] },
  inventory: { type: 'asset', keywords: ['estoque', 'stock', 'mercador', 'inventár', 'inventari'] },
  tax_recoverable: { type: 'asset', keywords: ['imposto a recuperar', 'iva dedut', 'tax recover', 'imposto recuper'] },
  payable: { type: 'liability', keywords: ['fornecedor', 'a pagar', 'supplier'] },
  withholding_payable: { type: 'liability', keywords: ['retenç', 'retenc', 'withhold', 'irt', 'irrf'] },
  goods_in_transit: { type: 'liability', keywords: ['trânsito', 'transito', 'a faturar', 'mercadoria receb'] },
  inventory_gain: { type: 'revenue', keywords: ['ganho', 'sobra', 'outras receitas'] },
  inventory_loss: { type: 'expense', keywords: ['perda', 'quebra', 'outras despesas'] },
  cash_bank: { type: 'asset', keywords: ['caixa', 'banco', 'disponí', 'disponi', 'cash', 'bank'] },
  cogs_account: { type: 'expense', keywords: ['custo', 'cmv', 'mercadoria vendida', 'cogs'] },
};

export interface RuleWithLines {
  id: string;
  organization_id: string;
  event_type: string;
  name: string;
  description: string | null;
  is_active: boolean;
  auto_post: boolean;
  lines: Array<{
    id: string;
    line_type: 'debit' | 'credit';
    account_id: string | null;
    account_code?: string | null;
    account_name?: string | null;
    amount_source: AmountSource;
    sort_order: number;
    memo_template: string | null;
  }>;
}

@Injectable()
export class AutoJournalRulesService {
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
  private ensureAccountant(role: string) {
    if (!ACCOUNTANT_ROLES.includes(role as (typeof ACCOUNTANT_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para configurar lançamentos automáticos');
  }

  /** Catálogo de eventos para a UI montar o formulário. */
  getCatalog() {
    return Object.entries(EVENT_CATALOG).map(([eventType, def]) => ({
      eventType,
      name: def.name,
      description: def.description,
      defaultLines: def.lines,
    }));
  }

  async list(user: AuthUserPayload): Promise<RuleWithLines[]> {
    const { organizationId, role } = this.scope(user);
    this.ensureAccountant(role);

    const rules = await this.knex('accounting_journal_rules')
      .where({ organization_id: organizationId })
      .orderBy('event_type', 'asc');
    if (rules.length === 0) return [];

    const ruleIds = rules.map((r) => r.id);
    const lines = await this.knex('accounting_journal_rule_lines as l')
      .leftJoin('accounting_chart_accounts as a', 'l.account_id', 'a.id')
      .whereIn('l.rule_id', ruleIds)
      .select(
        'l.*',
        { account_code: 'a.code' },
        { account_name: 'a.name' },
      )
      .orderBy('l.sort_order', 'asc');

    return rules.map((r) => ({
      ...r,
      lines: lines.filter((l) => l.rule_id === r.id),
    }));
  }

  async upsert(
    eventType: string,
    dto: {
      name?: string;
      description?: string;
      isActive?: boolean;
      autoPost?: boolean;
      lines: RuleLineInput[];
    },
    user: AuthUserPayload,
  ): Promise<RuleWithLines> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureAccountant(role);

    if (!EVENT_CATALOG[eventType]) {
      throw new NotFoundException(`Evento "${eventType}" não suportado`);
    }

    return this.knex.transaction(async (trx) => {
      let rule = await trx('accounting_journal_rules')
        .where({ organization_id: organizationId, event_type: eventType })
        .first();

      const now = new Date();
      if (!rule) {
        const id = randomUUID();
        await trx('accounting_journal_rules').insert({
          id,
          organization_id: organizationId,
          event_type: eventType,
          name: dto.name ?? EVENT_CATALOG[eventType].name,
          description: dto.description ?? EVENT_CATALOG[eventType].description,
          is_active: dto.isActive ?? true,
          auto_post: dto.autoPost ?? true,
          created_by: userId,
          created_at: now,
          updated_at: now,
        });
        rule = await trx('accounting_journal_rules').where({ id }).first();
      } else {
        await trx('accounting_journal_rules')
          .where({ id: rule.id })
          .update({
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.isActive !== undefined && { is_active: dto.isActive }),
            ...(dto.autoPost !== undefined && { auto_post: dto.autoPost }),
            updated_at: now,
          });
      }

      // Substitui todas as linhas
      await trx('accounting_journal_rule_lines').where({ rule_id: rule.id }).delete();
      let order = 0;
      for (const l of dto.lines) {
        await trx('accounting_journal_rule_lines').insert({
          id: randomUUID(),
          organization_id: organizationId,
          rule_id: rule.id,
          line_type: l.lineType,
          account_id: l.accountId ?? null,
          amount_source: l.amountSource,
          sort_order: order++,
          memo_template: l.memoTemplate ?? null,
          created_at: now,
        });
      }

      return this.getOne(rule.id, organizationId, trx);
    });
  }

  private async getOne(
    ruleId: string,
    organizationId: string,
    trx: Knex,
  ): Promise<RuleWithLines> {
    const rule = await trx('accounting_journal_rules')
      .where({ id: ruleId, organization_id: organizationId })
      .first();
    const lines = await trx('accounting_journal_rule_lines as l')
      .leftJoin('accounting_chart_accounts as a', 'l.account_id', 'a.id')
      .where('l.rule_id', ruleId)
      .select('l.*', { account_code: 'a.code' }, { account_name: 'a.name' })
      .orderBy('l.sort_order', 'asc');
    return { ...rule, lines };
  }

  /**
   * Cria as regras padrão para todos os eventos, tentando casar
   * automaticamente as contas do plano de contas da organização.
   * Idempotente: não sobrescreve regras já existentes.
   */
  async seedDefaults(user: AuthUserPayload): Promise<{ created: number; matched: number; unmapped: number }> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureAccountant(role);

    // Carrega contas postáveis da org
    const accounts = await this.knex('accounting_chart_accounts')
      .where({ organization_id: organizationId, is_active: true, allows_posting: true })
      .select<Array<{ id: string; name: string; account_type: string }>>(
        'id',
        'name',
        'account_type',
      );

    const matchAccount = (matchKey: string): string | null => {
      const matcher = ACCOUNT_MATCHERS[matchKey];
      if (!matcher) return null;
      const candidates = accounts.filter((a) => a.account_type === matcher.type);
      for (const kw of matcher.keywords) {
        const found = candidates.find((a) => a.name.toLowerCase().includes(kw));
        if (found) return found.id;
      }
      return null;
    };

    let created = 0;
    let matched = 0;
    let unmapped = 0;

    await this.knex.transaction(async (trx) => {
      for (const [eventType, def] of Object.entries(EVENT_CATALOG)) {
        const exists = await trx('accounting_journal_rules')
          .where({ organization_id: organizationId, event_type: eventType })
          .first();
        if (exists) continue;

        const ruleId = randomUUID();
        const now = new Date();
        // Eventos "core" nascem ativos. Eventos avançados (recepção em 2 passos,
        // ajustes de inventário) nascem INATIVOS para evitar dupla contagem
        // antes do contador validar o fluxo da organização.
        const CORE_EVENTS = [
          'sales_invoice',
          'sales_credit_note',
          'purchase_invoice',
          'purchase_credit_note',
          'sales_payment',
          'purchase_payment',
          'sales_cogs',
        ];
        await trx('accounting_journal_rules').insert({
          id: ruleId,
          organization_id: organizationId,
          event_type: eventType,
          name: def.name,
          description: def.description,
          is_active: CORE_EVENTS.includes(eventType),
          auto_post: true,
          created_by: userId,
          created_at: now,
          updated_at: now,
        });
        created++;

        let order = 0;
        for (const cl of def.lines) {
          const accountId = matchAccount(cl.accountMatch);
          if (accountId) matched++;
          else unmapped++;
          await trx('accounting_journal_rule_lines').insert({
            id: randomUUID(),
            organization_id: organizationId,
            rule_id: ruleId,
            line_type: cl.lineType,
            account_id: accountId,
            amount_source: cl.amountSource,
            sort_order: order++,
            memo_template: cl.memo,
            created_at: now,
          });
        }
      }
    });

    return { created, matched, unmapped };
  }
}
