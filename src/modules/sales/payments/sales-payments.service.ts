import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

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

const WRITE_ROLES = ['master', 'admin', 'sales', 'manager', 'accountant'] as const;

/**
 * Cola Sales ↔ Receivables ↔ Commissions:
 *
 *  - `onDocumentInvoiced`: cria a conta a receber (accounts_receivable) ligada
 *    ao documento (reference_type='sales_document') e cria a comissão se o
 *    vendedor responsável tiver `default_commission_pct` preenchido.
 *
 *  - `syncDocumentPayments`: lê o paid_amount da AR vinculada e atualiza
 *    sales_documents.amount_paid + status (paid / partially_paid) +
 *    move comissão de pending → eligible quando o doc fica totalmente pago.
 *
 *  - `onDocumentCancelled`: cancela a AR e a comissão correspondentes.
 *
 *  Esta classe NÃO sabe transações de pagamento — quem registra pagamento é o
 *  módulo Receivables. A integração é em duas vias: ao faturar (push) e ao
 *  sincronizar (pull). Isto evita acoplar AR ao módulo Sales.
 */
@Injectable()
export class SalesPaymentsService {
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
  private ensureWrite(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para sincronizar pagamentos');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HOOK: documento → invoiced
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Chamado pelo SalesDocumentsService quando um documento tipo `invoice`
   * (ou outro tipo via atalho) vai para status `invoiced`. Executa dentro
   * da transação do caller.
   */
  async onDocumentInvoiced(
    documentId: string,
    organizationId: string,
    userId: string,
    trx: Knex.Transaction,
  ): Promise<{ receivableId: string | null; commissionId: string | null }> {
    const doc = await trx('sales_documents')
      .where({ id: documentId, organization_id: organizationId })
      .first<{
        id: string;
        doc_number: string;
        doc_type: string;
        customer_id: string;
        total: string | number;
        subtotal: string | number;
        issue_date: Date | string;
        due_date: Date | string | null;
        assigned_user_id: string | null;
        currency: string;
        notes: string | null;
      }>();
    if (!doc) throw new NotFoundException('Documento não encontrado');

    // Só faturas, NC e devoluções de cliente geram AR. Encomendas/orçamentos não.
    if (!['invoice', 'credit_note', 'customer_return'].includes(doc.doc_type)) {
      return { receivableId: null, commissionId: null };
    }

    const receivableId = await this.ensureReceivable(doc, organizationId, userId, trx);
    const commissionId = await this.ensureCommission(doc, organizationId, trx);

    return { receivableId, commissionId };
  }

  private async ensureReceivable(
    doc: {
      id: string;
      doc_number: string;
      doc_type: string;
      customer_id: string;
      total: string | number;
      issue_date: Date | string;
      due_date: Date | string | null;
      notes: string | null;
    },
    organizationId: string,
    userId: string,
    trx: Knex.Transaction,
  ): Promise<string | null> {
    // Idempotência: já existe AR pra esse doc?
    const existing = await trx('accounts_receivable')
      .where({
        organization_id: organizationId,
        reference_type: 'sales_document',
        reference_id: doc.id,
      })
      .first<{ id: string } | undefined>();
    if (existing) return existing.id;

    // NC e devoluções de cliente geram AR negativa (cliente fica com saldo a crédito).
    const sign = ['credit_note', 'customer_return'].includes(doc.doc_type) ? -1 : 1;
    const amount = sign * Number(doc.total);

    const customer = await trx('customers')
      .where({ id: doc.customer_id, organization_id: organizationId })
      .first<{ name: string } | undefined>();

    const id = randomUUID();
    const issueDate = new Date(doc.issue_date);
    const dueDate = doc.due_date ? new Date(doc.due_date) : new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    await trx('accounts_receivable').insert({
      id,
      organization_id: organizationId,
      customer_id: doc.customer_id,
      customer_name: customer?.name ?? 'Cliente',
      original_amount: amount,
      paid_amount: 0,
      outstanding_amount: amount,
      issue_date: issueDate,
      due_date: dueDate,
      status: 'issued',
      description:
        doc.notes ?? `Documento ${doc.doc_number}`,
      reference_number: doc.doc_number,
      reference_type: 'sales_document',
      reference_id: doc.id,
      created_by: userId,
      updated_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return id;
  }

  private async ensureCommission(
    doc: {
      id: string;
      subtotal: string | number;
      assigned_user_id: string | null;
      currency: string;
    },
    organizationId: string,
    trx: Knex.Transaction,
  ): Promise<string | null> {
    if (!doc.assigned_user_id) return null;

    // Já existe?
    const existing = await trx('sales_commissions')
      .where({ document_id: doc.id, user_id: doc.assigned_user_id })
      .first<{ id: string } | undefined>();
    if (existing) return existing.id;

    const user = await trx('users')
      .where({ id: doc.assigned_user_id, organization_id: organizationId })
      .first<{ default_commission_pct: string | number | null } | undefined>();
    const pct = Number(user?.default_commission_pct ?? 0);
    if (!user || !pct || pct <= 0) return null;

    const base = Number(doc.subtotal);
    const amount = Math.round(((base * pct) / 100) * 10000) / 10000;
    const id = randomUUID();
    const now = new Date();
    await trx('sales_commissions').insert({
      id,
      organization_id: organizationId,
      document_id: doc.id,
      user_id: doc.assigned_user_id,
      base_amount: base,
      commission_pct: pct,
      commission_amount: amount,
      currency: doc.currency,
      status: 'pending',
      created_at: now,
      updated_at: now,
    });
    return id;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HOOK: documento cancelado → cancela AR + comissão
  // ═══════════════════════════════════════════════════════════════════════

  async onDocumentCancelled(
    documentId: string,
    organizationId: string,
    trx: Knex.Transaction,
  ): Promise<void> {
    const ar = await trx('accounts_receivable')
      .where({
        organization_id: organizationId,
        reference_type: 'sales_document',
        reference_id: documentId,
      })
      .first<{ id: string } | undefined>();
    if (ar) {
      await trx('accounts_receivable')
        .where({ id: ar.id })
        .update({ status: 'cancelled', updated_at: new Date() });
    }
    await trx('sales_commissions')
      .where({ organization_id: organizationId, document_id: documentId })
      .whereNotIn('status', ['paid', 'cancelled'])
      .update({ status: 'cancelled', updated_at: new Date() });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PULL: sincroniza pagamento de UM documento a partir da AR
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Lê paid_amount da AR vinculada e atualiza o sales_document + comissão.
   * Pode ser chamado manualmente (endpoint) ou em batch pelo bulk sync.
   */
  async syncDocumentPayments(
    documentId: string,
    user: AuthUserPayload,
  ): Promise<{ updated: boolean; amountPaid: number; status: string }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const doc = await trx('sales_documents')
        .where({ id: documentId, organization_id: organizationId })
        .first<{
          id: string;
          total: string | number;
          amount_paid: string | number;
          status: string;
          doc_type: string;
        }>();
      if (!doc) throw new NotFoundException('Documento não encontrado');

      const ar = await trx('accounts_receivable')
        .where({
          organization_id: organizationId,
          reference_type: 'sales_document',
          reference_id: documentId,
        })
        .first<{ id: string; paid_amount: string | number; status: string } | undefined>();

      const paid = Math.abs(Number(ar?.paid_amount ?? 0));
      const total = Math.abs(Number(doc.total));

      const newStatus = this.computeStatusFromPayment(
        doc.status as
          | 'draft'
          | 'sent'
          | 'accepted'
          | 'rejected'
          | 'invoiced'
          | 'paid'
          | 'partially_paid'
          | 'cancelled',
        paid,
        total,
      );

      const same =
        Number(doc.amount_paid) === paid && doc.status === newStatus;
      if (same) return { updated: false, amountPaid: paid, status: doc.status };

      await trx('sales_documents').where({ id: documentId }).update({
        amount_paid: paid,
        status: newStatus,
        updated_at: new Date(),
      });

      // Move comissões pending → eligible quando totalmente pago.
      if (newStatus === 'paid') {
        await trx('sales_commissions')
          .where({ organization_id: organizationId, document_id: documentId, status: 'pending' })
          .update({ status: 'eligible', updated_at: new Date() });
      }

      return { updated: true, amountPaid: paid, status: newStatus };
    });
  }

  private computeStatusFromPayment(
    current:
      | 'draft'
      | 'sent'
      | 'accepted'
      | 'rejected'
      | 'invoiced'
      | 'paid'
      | 'partially_paid'
      | 'cancelled',
    paid: number,
    total: number,
  ):
    | 'draft'
    | 'sent'
    | 'accepted'
    | 'rejected'
    | 'invoiced'
    | 'paid'
    | 'partially_paid'
    | 'cancelled' {
    if (current === 'cancelled' || current === 'draft') return current;
    if (total <= 0) return current;
    if (paid >= total - 0.001) return 'paid';
    if (paid > 0) return 'partially_paid';
    // Sem pagamento ainda: mantém invoiced (ou estado pre-invoice se for atalho)
    return current === 'paid' || current === 'partially_paid' ? 'invoiced' : current;
  }

  /**
   * Bulk sync: itera por TODAS faturas com AR vinculada e sincroniza.
   * Útil pra correções pós-migração ou rodar em cron.
   */
  async syncAllPayments(
    user: AuthUserPayload,
  ): Promise<{ scanned: number; updated: number }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    const docs = await this.knex('sales_documents')
      .where({ organization_id: organizationId })
      .whereIn('doc_type', ['invoice', 'credit_note'])
      .whereNotIn('status', ['draft', 'cancelled'])
      .select<Array<{ id: string }>>('id');

    let updated = 0;
    for (const d of docs) {
      const r = await this.syncDocumentPayments(d.id, user);
      if (r.updated) updated++;
    }
    return { scanned: docs.length, updated };
  }
}
