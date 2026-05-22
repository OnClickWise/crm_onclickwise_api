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
 * Cola Compras ↔ Accounts Payable.
 *
 *  - `onDocumentInvoiced`: cria a conta a pagar (accounts_payable) ligada ao
 *    documento de compra (reference_type='purchase_document'). NC recebida
 *    gera AP negativa (crédito do fornecedor).
 *
 *  - `syncDocumentPayments`: lê paid_amount da AP vinculada e atualiza
 *    purchase_documents.amount_paid + status (paid / partially_paid).
 *
 *  - `onDocumentCancelled`: cancela a AP correspondente.
 *
 *  Mesma arquitetura que SalesPaymentsService — evita acoplamento bidirectional
 *  com o módulo Finance.
 */
@Injectable()
export class PurchasePaymentsService {
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
      throw new ForbiddenException('Sem permissão para sincronizar AP');
  }

  /**
   * Chamado pelo PurchaseDocumentsService quando um documento vai pra 'invoiced'.
   * Cria AP (idempotente — não duplica).
   */
  async onDocumentInvoiced(
    documentId: string,
    organizationId: string,
    userId: string,
    trx: Knex.Transaction,
  ): Promise<{ payableId: string | null }> {
    const doc = await trx('purchase_documents')
      .where({ id: documentId, organization_id: organizationId })
      .first<{
        id: string;
        doc_number: string;
        doc_type: string;
        supplier_id: string;
        supplier_doc_number: string | null;
        total: string | number;
        withholding_amount: string | number;
        issue_date: Date | string;
        due_date: Date | string | null;
        notes: string | null;
      }>();
    if (!doc) throw new NotFoundException('Documento não encontrado');

    if (!['invoice', 'credit_note'].includes(doc.doc_type)) {
      return { payableId: null };
    }

    // Idempotência
    const existing = await trx('accounts_payable')
      .where({
        organization_id: organizationId,
        reference_type: 'purchase_document',
        reference_id: doc.id,
      })
      .first<{ id: string } | undefined>();
    if (existing) return { payableId: existing.id };

    // NC recebida = AP negativa (fornecedor nos deve)
    const sign = doc.doc_type === 'credit_note' ? -1 : 1;
    // Líquido a pagar = total - retenção
    const total = Number(doc.total);
    const withholding = Number(doc.withholding_amount ?? 0);
    const amount = sign * (total - withholding);

    const supplier = await trx('suppliers')
      .where({ id: doc.supplier_id, organization_id: organizationId })
      .first<{ name: string } | undefined>();

    const id = randomUUID();
    const issueDate = new Date(doc.issue_date);
    const dueDate = doc.due_date
      ? new Date(doc.due_date)
      : new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    await trx('accounts_payable').insert({
      id,
      organization_id: organizationId,
      supplier_id: doc.supplier_id,
      supplier_name: supplier?.name ?? 'Fornecedor',
      original_amount: amount,
      paid_amount: 0,
      outstanding_amount: amount,
      issue_date: issueDate,
      due_date: dueDate,
      status: 'issued',
      description:
        doc.notes ??
        `${doc.doc_number}${doc.supplier_doc_number ? ` (Fornec.: ${doc.supplier_doc_number})` : ''}`,
      reference_number: doc.doc_number,
      reference_type: 'purchase_document',
      reference_id: doc.id,
      created_by: userId,
      updated_by: userId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return { payableId: id };
  }

  async onDocumentCancelled(
    documentId: string,
    organizationId: string,
    trx: Knex.Transaction,
  ): Promise<void> {
    const ap = await trx('accounts_payable')
      .where({
        organization_id: organizationId,
        reference_type: 'purchase_document',
        reference_id: documentId,
      })
      .first<{ id: string } | undefined>();
    if (ap) {
      await trx('accounts_payable')
        .where({ id: ap.id })
        .update({ status: 'cancelled', updated_at: new Date() });
    }
  }

  /**
   * Pull: sincroniza amount_paid + status do documento a partir da AP vinculada.
   */
  async syncDocumentPayments(
    documentId: string,
    user: AuthUserPayload,
  ): Promise<{ updated: boolean; amountPaid: number; status: string }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const doc = await trx('purchase_documents')
        .where({ id: documentId, organization_id: organizationId })
        .first<{
          id: string;
          total: string | number;
          amount_paid: string | number;
          status: string;
          withholding_amount: string | number;
        }>();
      if (!doc) throw new NotFoundException('Documento não encontrado');

      const ap = await trx('accounts_payable')
        .where({
          organization_id: organizationId,
          reference_type: 'purchase_document',
          reference_id: documentId,
        })
        .first<{ paid_amount: string | number } | undefined>();

      const paid = Math.abs(Number(ap?.paid_amount ?? 0));
      const netTotal = Math.abs(Number(doc.total) - Number(doc.withholding_amount ?? 0));

      let newStatus: string = doc.status;
      if (doc.status !== 'cancelled' && doc.status !== 'draft' && netTotal > 0) {
        if (paid >= netTotal - 0.001) newStatus = 'paid';
        else if (paid > 0) newStatus = 'partially_paid';
        else newStatus = 'invoiced';
      }

      const same = Number(doc.amount_paid) === paid && doc.status === newStatus;
      if (same) return { updated: false, amountPaid: paid, status: doc.status };

      await trx('purchase_documents').where({ id: documentId }).update({
        amount_paid: paid,
        status: newStatus,
        updated_at: new Date(),
      });

      return { updated: true, amountPaid: paid, status: newStatus };
    });
  }
}
