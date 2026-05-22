import { ForbiddenException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { SalesPaymentsService } from '@/modules/sales/payments/sales-payments.service';
import { BillingCycle } from '../plans/dtos/plan.dto';
import { SubscriptionRow, addCycle, addDays } from '../subscriptions/subscriptions.service';

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

const ADMIN_ROLES = ['master', 'admin', 'manager', 'accountant', 'financial_operator'] as const;

export interface GenerationResult {
  scanned: number;
  generated: number;
  promotedFromTrial: number;
  cancelled: number;
  failed: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Motor de geração automática de faturas de assinatura.
 * Roda diariamente às 6h: para cada assinatura com `next_billing_date <= hoje`,
 * gera uma fatura no módulo de Vendas, registra em
 * `billing_subscription_invoices` e avança o período.
 *
 * Idempotente: a tabela `billing_subscription_invoices` tem unique
 * (subscription_id, period_start) — re-execução não duplica.
 */
@Injectable()
export class BillingGenerationService {
  private readonly logger = new Logger(BillingGenerationService.name);

  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly salesPayments: SalesPaymentsService,
  ) {}

  private scope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId)
      throw new UnauthorizedException('Usuário sem organização vinculada');
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }
  private ensureAdmin(role: string) {
    if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para gerar faturas de assinatura');
  }

  /** Disparo manual para a organização do usuário. */
  async runForMyOrg(user: AuthUserPayload): Promise<GenerationResult> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);
    return this.runForOrg(organizationId);
  }

  /** Lógica principal — pode ser chamada manualmente ou pelo cron. */
  async runForOrg(organizationId: string): Promise<GenerationResult> {
    const result: GenerationResult = {
      scanned: 0,
      generated: 0,
      promotedFromTrial: 0,
      cancelled: 0,
      failed: 0,
    };
    const ref = today();

    // Carrega assinaturas que potencialmente precisam de ação hoje
    const subs = await this.knex<SubscriptionRow>('billing_subscriptions')
      .where({ organization_id: organizationId })
      .whereIn('status', ['trialing', 'active'])
      .andWhere('next_billing_date', '<=', ref);

    for (const sub of subs) {
      result.scanned++;

      try {
        // 1. Encerramento programado (cancellation_date no passado)
        if (sub.cancellation_date) {
          const cancDate = new Date(sub.cancellation_date).toISOString().slice(0, 10);
          if (cancDate <= ref) {
            await this.knex('billing_subscriptions').where({ id: sub.id }).update({
              status: 'cancelled',
              updated_at: new Date(),
            });
            result.cancelled++;
            continue;
          }
        }

        // 2. Promoção de trial → active (trial encerrou)
        if (sub.status === 'trialing' && sub.trial_end_date) {
          const trialEnd = new Date(sub.trial_end_date).toISOString().slice(0, 10);
          if (trialEnd <= ref) {
            await this.knex('billing_subscriptions').where({ id: sub.id }).update({
              status: 'active',
              updated_at: new Date(),
            });
            result.promotedFromTrial++;
            // segue para gerar a fatura do primeiro período pago
          } else {
            // ainda em trial, não fatura
            continue;
          }
        }

        // 3. Gera a fatura do período corrente
        await this.generateInvoice(sub, organizationId);
        result.generated++;
      } catch (err) {
        result.failed++;
        this.logger.warn(
          `Falha ao gerar fatura de assinatura ${sub.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return result;
  }

  /** Gera UMA fatura de assinatura dentro de uma transação. */
  private async generateInvoice(sub: SubscriptionRow, organizationId: string): Promise<void> {
    const periodStart = new Date(sub.current_period_start).toISOString().slice(0, 10);
    const periodEnd = new Date(sub.current_period_end).toISOString().slice(0, 10);

    await this.knex.transaction(async (trx) => {
      // Idempotência: já gerou fatura pra esse período?
      const existing = await trx('billing_subscription_invoices')
        .where({ subscription_id: sub.id, period_start: periodStart })
        .first();
      if (existing) {
        // Apenas avança o ponteiro (caso o cron tenha falhado antes de avançar)
        await this.advanceSubscription(trx, sub);
        return;
      }

      // Busca dados de apoio
      const plan = sub.plan_id
        ? await trx('billing_plans')
            .where({ id: sub.plan_id, organization_id: organizationId })
            .first<{ name: string; product_id: string | null; default_tax_rate_id: string | null }>()
        : null;

      let productCode: string | null = null;
      let taxRatePct = 0;
      let taxRateId: string | null = null;

      if (plan?.product_id) {
        const product = await trx('sales_products')
          .where({ id: plan.product_id, organization_id: organizationId })
          .first<{ code: string; default_tax_rate_id: string | null } | undefined>();
        if (product) {
          productCode = product.code;
          taxRateId = plan.default_tax_rate_id ?? product.default_tax_rate_id;
        }
      } else if (plan?.default_tax_rate_id) {
        taxRateId = plan.default_tax_rate_id;
      }

      if (taxRateId) {
        const tax = await trx('tax_rates')
          .where({ id: taxRateId, organization_id: organizationId })
          .first<{ rate: string | number } | undefined>();
        if (tax) taxRatePct = Number(tax.rate);
      }

      // Numeração atômica do documento de venda (tipo 'invoice')
      const docNumber = await this.nextInvoiceNumber(organizationId, periodStart, trx);

      // Cálculo financeiro
      const qty = Number(sub.quantity);
      const unit = Number(sub.amount);
      const subtotal = Math.round(qty * unit * 100) / 100;
      const discountAmount = Math.min(Number(sub.discount_amount), subtotal);
      const discountPct =
        subtotal > 0 ? Math.round((discountAmount / subtotal) * 1000) / 10 : 0;
      const taxable = Math.round((subtotal - discountAmount) * 100) / 100;
      const taxAmount = Math.round(((taxable * taxRatePct) / 100) * 100) / 100;
      const total = Math.round((taxable + taxAmount) * 100) / 100;

      const description = plan
        ? `${plan.name} — ${this.fmtBR(periodStart)} a ${this.fmtBR(periodEnd)}`
        : `Assinatura — ${this.fmtBR(periodStart)} a ${this.fmtBR(periodEnd)}`;

      const docId = randomUUID();
      const now = new Date();

      // Vencimento: 5 dias após emissão por padrão. Em sub seguinte poderia ser parametrizado.
      const dueDate = addDays(periodStart, 5);

      await trx('sales_documents').insert({
        id: docId,
        organization_id: organizationId,
        doc_number: docNumber,
        doc_type: 'invoice',
        status: 'invoiced',
        customer_id: sub.customer_id,
        issue_date: periodStart,
        due_date: dueDate,
        currency: sub.currency,
        exchange_rate: 1,
        subtotal,
        total_discount: discountAmount,
        total_tax: taxAmount,
        total,
        amount_paid: 0,
        notes: `Fatura gerada automaticamente da assinatura ${sub.id.slice(0, 8)}.`,
        assigned_user_id: sub.assigned_user_id ?? null,
        created_by: sub.assigned_user_id ?? null,
        issued_at: now,
        stock_committed: true, // assinaturas são serviços — não afetam estoque
        stock_committed_at: now,
        approval_status: 'not_required',
        created_at: now,
        updated_at: now,
      });

      await trx('sales_document_lines').insert({
        id: randomUUID(),
        organization_id: organizationId,
        document_id: docId,
        line_order: 1,
        product_id: plan?.product_id ?? null,
        product_code: productCode,
        description,
        unit: 'mês',
        quantity: qty,
        unit_price: unit,
        discount_pct: discountPct,
        tax_rate_id: taxRateId,
        tax_rate_pct: taxRatePct,
        subtotal,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        line_total: total,
        notes: null,
        created_at: now,
        updated_at: now,
      });

      // Registro de auditoria/idempotência
      await trx('billing_subscription_invoices').insert({
        id: randomUUID(),
        organization_id: organizationId,
        subscription_id: sub.id,
        sales_document_id: docId,
        period_start: periodStart,
        period_end: periodEnd,
        amount: total,
        status: 'generated',
        generated_at: now,
      });

      // Aciona o hook de Vendas que cria AR + comissão + lançamento contábil
      await this.salesPayments.onDocumentInvoiced(
        docId,
        organizationId,
        sub.assigned_user_id ?? sub.customer_id, // fallback de userId pra audit
        trx,
      );

      // Avança o ponteiro do ciclo
      await this.advanceSubscription(trx, sub);
    });
  }

  /** Avança current_period e next_billing para o próximo ciclo. */
  private async advanceSubscription(trx: Knex.Transaction, sub: SubscriptionRow): Promise<void> {
    const periodStart = new Date(sub.current_period_start).toISOString().slice(0, 10);
    const nextStart = addCycle(periodStart, sub.billing_cycle as BillingCycle);
    const nextEnd = addDays(addCycle(nextStart, sub.billing_cycle as BillingCycle), -1);

    await trx('billing_subscriptions').where({ id: sub.id }).update({
      current_period_start: nextStart,
      current_period_end: nextEnd,
      next_billing_date: nextStart,
      updated_at: new Date(),
    });
  }

  /** Próximo número FAT-YYYY-NNNN (FOR UPDATE pra concorrência). */
  private async nextInvoiceNumber(
    organizationId: string,
    issueDate: string,
    trx: Knex.Transaction,
  ): Promise<string> {
    const year = Number(issueDate.slice(0, 4));
    let row = await trx('sales_document_numbering')
      .where({ organization_id: organizationId, doc_type: 'invoice', year })
      .forUpdate()
      .first<{ id: string; last_number: number; prefix: string }>();
    if (!row) {
      const id = randomUUID();
      await trx('sales_document_numbering').insert({
        id,
        organization_id: organizationId,
        doc_type: 'invoice',
        prefix: 'FAT',
        year,
        last_number: 0,
      });
      row = await trx('sales_document_numbering')
        .where({ id })
        .forUpdate()
        .first<{ id: string; last_number: number; prefix: string }>();
      if (!row) throw new Error('Falha ao gerar numerador');
    }
    const next = row.last_number + 1;
    await trx('sales_document_numbering').where({ id: row.id }).update({
      last_number: next,
      updated_at: new Date(),
    });
    return `${row.prefix}-${year}-${String(next).padStart(4, '0')}`;
  }

  private fmtBR(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRON DIÁRIO — 6h da manhã
  // ═══════════════════════════════════════════════════════════════════════

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async dailyRun(): Promise<void> {
    try {
      const orgs = await this.knex('organizations').select<Array<{ id: string }>>('id');
      let totalGen = 0;
      for (const org of orgs) {
        const r = await this.runForOrg(org.id);
        totalGen += r.generated;
      }
      if (totalGen > 0) {
        this.logger.log(`Faturamento recorrente: ${totalGen} fatura(s) gerada(s).`);
      }
    } catch (err) {
      this.logger.error(
        `Falha no cron de faturamento: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
