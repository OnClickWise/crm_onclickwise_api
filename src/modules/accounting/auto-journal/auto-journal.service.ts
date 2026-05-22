import { Inject, Injectable, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

/**
 * Fontes de valor que uma linha de regra pode usar. O caller fornece um mapa
 * { [source]: number } e o motor substitui.
 */
export type AmountSource =
  | 'total'
  | 'subtotal'
  | 'tax'
  | 'discount'
  | 'withholding'
  | 'net_total'
  | 'payment_amount'
  | 'cogs';

export interface RuleLineRow {
  id: string;
  rule_id: string;
  line_type: 'debit' | 'credit';
  account_id: string | null;
  amount_source: AmountSource;
  sort_order: number;
  memo_template: string | null;
}

export interface RuleRow {
  id: string;
  organization_id: string;
  event_type: string;
  name: string;
  description: string | null;
  is_active: boolean;
  auto_post: boolean;
}

export interface GenerateInput {
  organizationId: string;
  userId: string | null;
  eventType: string;
  referenceType: string;
  referenceId: string;
  description: string;
  entryDate: Date;
  /** Mapa de fontes → valores absolutos (sempre positivos). */
  amounts: Partial<Record<AmountSource, number>>;
}

export interface GenerateResult {
  entryId: string | null;
  status: 'posted' | 'draft' | 'skipped';
  warning?: string;
}

/**
 * Motor de Lançamentos Contábeis Automáticos.
 *
 * `generate()` é chamado pelos módulos operacionais dentro da transação deles.
 * NUNCA lança exceção que quebre a operação de negócio — se algo der errado
 * (regra ausente, conta não mapeada, partida desbalanceada), registra como
 * lançamento `draft` com aviso, ou simplesmente pula. A operação (venda,
 * compra) sempre conclui.
 */
@Injectable()
export class AutoJournalService {
  private readonly logger = new Logger(AutoJournalService.name);

  constructor(@Inject('knex') private readonly knex: Knex) {}

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /**
   * Gera o lançamento contábil para um evento. Idempotente: se já existe
   * lançamento auto-gerado pela mesma regra para a mesma referência, não
   * duplica.
   */
  async generate(input: GenerateInput, trx: Knex.Transaction): Promise<GenerateResult> {
    try {
      const rule = await trx<RuleRow>('accounting_journal_rules')
        .where({
          organization_id: input.organizationId,
          event_type: input.eventType,
          is_active: true,
        })
        .first();
      if (!rule) {
        // Sem regra configurada — silenciosamente pula. A operação continua.
        return { entryId: null, status: 'skipped' };
      }

      // Idempotência
      const existing = await trx('accounting_journal_entries')
        .where({
          organization_id: input.organizationId,
          reference_type: input.referenceType,
          reference_id: input.referenceId,
          source_rule_id: rule.id,
        })
        .first<{ id: string } | undefined>();
      if (existing) {
        return { entryId: existing.id, status: 'skipped' };
      }

      const ruleLines = await trx<RuleLineRow>('accounting_journal_rule_lines')
        .where({ rule_id: rule.id })
        .orderBy('sort_order', 'asc');

      // Constrói linhas reais resolvendo amount_source
      const builtLines: Array<{
        accountId: string | null;
        lineType: 'debit' | 'credit';
        amount: number;
        memo: string | null;
      }> = [];
      for (const rl of ruleLines) {
        const raw = Number(input.amounts[rl.amount_source] ?? 0);
        const amount = this.round2(Math.abs(raw));
        if (amount <= 0) continue; // não posta linhas zeradas
        builtLines.push({
          accountId: rl.account_id,
          lineType: rl.line_type,
          amount,
          memo: rl.memo_template ?? null,
        });
      }

      if (builtLines.length < 2) {
        // Nada relevante para lançar (ex.: documento sem imposto e regra só
        // tinha linha de imposto). Pula sem erro.
        return { entryId: null, status: 'skipped' };
      }

      // Validações
      let warning: string | undefined;
      const hasUnmapped = builtLines.some((l) => !l.accountId);
      if (hasUnmapped) {
        warning = 'Conta contábil não mapeada na regra — revise o lançamento.';
      }

      const totalDebit = this.round2(
        builtLines.filter((l) => l.lineType === 'debit').reduce((s, l) => s + l.amount, 0),
      );
      const totalCredit = this.round2(
        builtLines.filter((l) => l.lineType === 'credit').reduce((s, l) => s + l.amount, 0),
      );
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        warning =
          `Partida desbalanceada (D ${totalDebit} ≠ C ${totalCredit}) — revise o lançamento.`;
      }

      const status: 'posted' | 'draft' =
        rule.auto_post && !warning ? 'posted' : 'draft';

      const entryId = randomUUID();
      const now = new Date();
      await trx('accounting_journal_entries').insert({
        id: entryId,
        organization_id: input.organizationId,
        status,
        entry_date: input.entryDate,
        description: input.description,
        reference_type: input.referenceType,
        reference_id: input.referenceId,
        created_by: input.userId,
        updated_by: input.userId,
        posted_by: status === 'posted' ? input.userId : null,
        posted_at: status === 'posted' ? now : null,
        auto_generated: true,
        source_rule_id: rule.id,
        auto_journal_warning: warning ?? null,
        created_at: now,
        updated_at: now,
      });

      for (const l of builtLines) {
        // Linhas sem conta usam um placeholder? Não — a coluna account_id é
        // NOT NULL nas entry_lines. Se não há conta, NÃO inserimos a linha,
        // mas o aviso já sinaliza. Para manter a partida, se faltar conta o
        // entry fica draft e o contador completa manualmente.
        if (!l.accountId) continue;
        await trx('accounting_journal_entry_lines').insert({
          id: randomUUID(),
          journal_entry_id: entryId,
          organization_id: input.organizationId,
          account_id: l.accountId,
          line_type: l.lineType,
          amount: l.amount,
          memo: l.memo ?? input.description,
          created_by: input.userId,
          reference_type: input.referenceType,
          reference_id: input.referenceId,
          created_at: now,
        });
      }

      return { entryId, status, warning };
    } catch (err) {
      // Defensivo: jamais quebrar a operação de negócio por causa de contabilidade.
      this.logger.error(
        `Falha ao gerar lançamento automático (${input.eventType}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { entryId: null, status: 'skipped', warning: 'Erro interno ao gerar lançamento.' };
    }
  }

  /**
   * Reverte (estorna) lançamentos automáticos vinculados a uma referência.
   * Usado quando um documento é cancelado. Cria lançamentos de estorno
   * (espelho) ao invés de deletar — preserva trilha de auditoria.
   */
  async reverseForReference(
    organizationId: string,
    referenceType: string,
    referenceId: string,
    userId: string | null,
    trx: Knex.Transaction,
  ): Promise<number> {
    const entries = await trx('accounting_journal_entries')
      .where({
        organization_id: organizationId,
        reference_type: referenceType,
        reference_id: referenceId,
        auto_generated: true,
      })
      .whereIn('status', ['posted', 'draft'])
      .whereNull('reversal_of_entry_id');

    let reversed = 0;
    const now = new Date();
    for (const entry of entries) {
      const lines = await trx('accounting_journal_entry_lines').where({
        journal_entry_id: entry.id,
      });
      if (lines.length === 0) continue;

      const reversalId = randomUUID();
      await trx('accounting_journal_entries').insert({
        id: reversalId,
        organization_id: organizationId,
        status: 'posted',
        entry_date: now,
        description: `ESTORNO — ${entry.description}`,
        reference_type: referenceType,
        reference_id: referenceId,
        reversal_of_entry_id: entry.id,
        created_by: userId,
        updated_by: userId,
        posted_by: userId,
        posted_at: now,
        auto_generated: true,
        source_rule_id: entry.source_rule_id ?? null,
        created_at: now,
        updated_at: now,
      });
      for (const l of lines) {
        await trx('accounting_journal_entry_lines').insert({
          id: randomUUID(),
          journal_entry_id: reversalId,
          organization_id: organizationId,
          account_id: l.account_id,
          // Inverte débito ↔ crédito
          line_type: l.line_type === 'debit' ? 'credit' : 'debit',
          amount: l.amount,
          memo: `Estorno: ${l.memo ?? ''}`.trim(),
          created_by: userId,
          reference_type: referenceType,
          reference_id: referenceId,
          created_at: now,
        });
      }
      // Marca o original como revertido
      await trx('accounting_journal_entries')
        .where({ id: entry.id })
        .update({ status: 'reversed', updated_at: now });
      reversed++;
    }
    return reversed;
  }
}
