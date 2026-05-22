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
import {
  ChangePurchaseStatusDto,
  ConvertPurchaseDto,
  CreatePurchaseDocumentDto,
  CreatePurchaseLineDto,
  PurchaseDocStatus,
  PurchaseDocType,
  UpdatePurchaseDocumentDto,
} from './dtos/purchase-document.dto';
import { StockMovementsService } from '../../inventory/movements/movements.service';
import { PurchasePaymentsService } from '../payments/purchase-payments.service';
import { ApprovalRequestsService } from '../../approvals/requests/requests.service';
import { AutoJournalService } from '../../accounting/auto-journal/auto-journal.service';

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

const WRITE_ROLES = ['master', 'admin', 'manager', 'accountant'] as const;
const READ_ROLES = [...WRITE_ROLES, 'employee', 'sales', 'sdr'] as const;

const DEFAULT_PREFIXES: Record<PurchaseDocType, string> = {
  request: 'RFQ',
  order: 'PC', // Pedido de Compra
  receipt: 'NE', // Nota de Entrada
  invoice: 'FC', // Fatura de Compra
  credit_note: 'NCC', // Nota de Crédito de Compra
  return: 'DEV-F', // Devolução ao Fornecedor
};

const CONVERSION_MAP: Record<PurchaseDocType, PurchaseDocType[]> = {
  request: ['order'],
  order: ['receipt', 'invoice'],
  receipt: ['invoice', 'return'],
  invoice: ['credit_note'],
  credit_note: [],
  return: [],
};

export interface PurchaseDocumentRow {
  id: string;
  organization_id: string;
  doc_number: string;
  doc_type: PurchaseDocType;
  status: PurchaseDocStatus;
  supplier_id: string;
  supplier_doc_number: string | null;
  supplier_doc_date: Date | string | null;
  issue_date: Date | string;
  expected_delivery_date: Date | string | null;
  due_date: Date | string | null;
  currency: string;
  exchange_rate: string | number;
  subtotal: string | number;
  total_discount: string | number;
  total_tax: string | number;
  total: string | number;
  amount_paid: string | number;
  withholding_amount: string | number;
  stock_committed: boolean;
  stock_committed_at: Date | null;
  warehouse_id: string | null;
  converted_from_id: string | null;
  notes: string | null;
  terms: string | null;
  payment_method: string | null;
  approval_status: string;
  approval_request_id: string | null;
  assigned_user_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  received_at: Date | null;
  invoiced_at: Date | null;
  cancelled_at: Date | null;
}

export interface PurchaseDocumentLineRow {
  id: string;
  organization_id: string;
  document_id: string;
  line_order: number;
  product_id: string | null;
  product_code: string | null;
  description: string;
  unit: string;
  quantity: string | number;
  quantity_received: string | number;
  unit_cost: string | number;
  discount_pct: string | number;
  tax_rate_id: string | null;
  tax_rate_pct: string | number;
  subtotal: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  line_total: string | number;
  lot_number: string | null;
  serial_number: string | null;
  notes: string | null;
}

@Injectable()
export class PurchaseDocumentsService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly movements: StockMovementsService,
    private readonly paymentsService: PurchasePaymentsService,
    private readonly approvalsService: ApprovalRequestsService,
    private readonly autoJournal: AutoJournalService,
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
  private ensureWrite(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para gerenciar compras');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar compras');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CÁLCULO DE LINHAS
  // ═══════════════════════════════════════════════════════════════════════

  private round4(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  private computeLine(line: CreatePurchaseLineDto): {
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    line_total: number;
  } {
    const qty = Number(line.quantity);
    const cost = Number(line.unitCost);
    const discountPct = Number(line.discountPct ?? 0);
    const taxPct = Number(line.taxRatePct ?? 0);
    if (qty < 0 || cost < 0) throw new BadRequestException('Quantidade/custo inválidos');
    if (discountPct < 0 || discountPct > 100)
      throw new BadRequestException('Desconto fora do range 0-100%');

    const subtotal = this.round4(qty * cost);
    const discount_amount = this.round4((subtotal * discountPct) / 100);
    const taxable = subtotal - discount_amount;
    const tax_amount = this.round4((taxable * taxPct) / 100);
    const line_total = this.round4(taxable + tax_amount);
    return { subtotal, discount_amount, tax_amount, line_total };
  }

  private async resolveLineMeta(
    line: CreatePurchaseLineDto,
    organizationId: string,
    trx: Knex.Transaction,
  ): Promise<{ productCode: string | null; taxRatePct: number; taxRateId: string | null }> {
    let productCode: string | null = null;
    let resolvedTaxId: string | null = line.taxRateId ?? null;
    let resolvedTaxPct = Number(line.taxRatePct ?? 0);

    if (line.productId) {
      const product = await trx('sales_products')
        .where({ id: line.productId, organization_id: organizationId })
        .first<{ code: string; default_tax_rate_id: string | null } | undefined>();
      if (!product) throw new BadRequestException(`Produto ${line.productId} inválido`);
      productCode = product.code;
      if (!resolvedTaxId && !line.taxRatePct && product.default_tax_rate_id) {
        resolvedTaxId = product.default_tax_rate_id;
      }
    }

    if (resolvedTaxId && !line.taxRatePct) {
      const tax = await trx('tax_rates')
        .where({ id: resolvedTaxId, organization_id: organizationId })
        .first<{ rate: string | number } | undefined>();
      if (!tax) throw new BadRequestException('Tax rate inválido');
      resolvedTaxPct = Number(tax.rate);
    }

    return { productCode, taxRatePct: resolvedTaxPct, taxRateId: resolvedTaxId };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NUMERAÇÃO ATÔMICA
  // ═══════════════════════════════════════════════════════════════════════

  private async nextDocNumber(
    organizationId: string,
    docType: PurchaseDocType,
    issueYear: number,
    trx: Knex.Transaction,
  ): Promise<string> {
    const prefix = DEFAULT_PREFIXES[docType];
    let row = await trx('purchase_document_numbering')
      .where({ organization_id: organizationId, doc_type: docType, year: issueYear })
      .forUpdate()
      .first<{ id: string; last_number: number; prefix: string }>();
    if (!row) {
      const id = randomUUID();
      await trx('purchase_document_numbering').insert({
        id,
        organization_id: organizationId,
        doc_type: docType,
        prefix,
        year: issueYear,
        last_number: 0,
      });
      row = await trx('purchase_document_numbering')
        .where({ id })
        .forUpdate()
        .first<{ id: string; last_number: number; prefix: string }>();
      if (!row) throw new Error('Falha ao criar contador');
    }
    const next = row.last_number + 1;
    await trx('purchase_document_numbering')
      .where({ id: row.id })
      .update({ last_number: next, updated_at: new Date() });
    return `${row.prefix}-${issueYear}-${String(next).padStart(4, '0')}`;
  }

  private async resolveDefaultWarehouse(
    organizationId: string,
    trx: Knex.Transaction,
  ): Promise<string | null> {
    const w = await trx('stock_warehouses')
      .where({ organization_id: organizationId, is_default: true, is_active: true })
      .first<{ id: string } | undefined>();
    return w?.id ?? null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async list(
    user: AuthUserPayload,
    opts: {
      docType?: PurchaseDocType;
      status?: PurchaseDocStatus;
      supplierId?: string;
      from?: string;
      to?: string;
      query?: string;
      limit?: number;
    } = {},
  ) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    return this.knex<PurchaseDocumentRow>('purchase_documents as d')
      .leftJoin('suppliers as s', 'd.supplier_id', 's.id')
      .where('d.organization_id', organizationId)
      .modify((q) => {
        if (opts.docType) q.andWhere('d.doc_type', opts.docType);
        if (opts.status) q.andWhere('d.status', opts.status);
        if (opts.supplierId) q.andWhere('d.supplier_id', opts.supplierId);
        if (opts.from) q.andWhere('d.issue_date', '>=', opts.from);
        if (opts.to) q.andWhere('d.issue_date', '<=', opts.to);
        if (opts.query) {
          const term = `%${opts.query.toLowerCase()}%`;
          q.andWhere((sub) =>
            sub
              .whereRaw('LOWER(d.doc_number) like ?', [term])
              .orWhereRaw('LOWER(coalesce(d.supplier_doc_number, \'\')) like ?', [term])
              .orWhereRaw('LOWER(s.name) like ?', [term]),
          );
        }
      })
      .select('d.*', { supplier_name: 's.name' }, { supplier_code: 's.code' })
      .orderBy('d.issue_date', 'desc')
      .orderBy('d.doc_number', 'desc')
      .limit(opts.limit ?? 200);
  }

  async getById(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const doc = await this.knex<PurchaseDocumentRow>('purchase_documents')
      .where({ id, organization_id: organizationId })
      .first();
    if (!doc) throw new NotFoundException('Documento não encontrado');

    const lines = await this.knex<PurchaseDocumentLineRow>('purchase_document_lines')
      .where({ document_id: id })
      .orderBy('line_order', 'asc');

    const supplier = await this.knex('suppliers')
      .where({ id: doc.supplier_id, organization_id: organizationId })
      .first();

    return { ...doc, lines, supplier };
  }

  async create(dto: CreatePurchaseDocumentDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    const supplier = await this.knex('suppliers')
      .where({ id: dto.supplierId, organization_id: organizationId })
      .first();
    if (!supplier) throw new BadRequestException('Fornecedor inválido');
    if (dto.lines.length === 0) throw new BadRequestException('Documento sem linhas');

    return this.knex.transaction(async (trx) => {
      const id = randomUUID();
      const issueDate = new Date(dto.issueDate);
      const year = issueDate.getUTCFullYear();
      const docNumber = await this.nextDocNumber(organizationId, dto.docType, year, trx);
      const now = new Date();

      const warehouseId = dto.warehouseId ?? (await this.resolveDefaultWarehouse(organizationId, trx));

      let subtotalSum = 0;
      let discountSum = 0;
      let taxSum = 0;
      let totalSum = 0;
      const lineRows: Array<Record<string, unknown>> = [];

      for (let i = 0; i < dto.lines.length; i++) {
        const line = dto.lines[i];
        const meta = await this.resolveLineMeta(line, organizationId, trx);
        const t = this.computeLine({ ...line, taxRatePct: meta.taxRatePct });
        subtotalSum += t.subtotal;
        discountSum += t.discount_amount;
        taxSum += t.tax_amount;
        totalSum += t.line_total;
        lineRows.push({
          id: randomUUID(),
          organization_id: organizationId,
          document_id: id,
          line_order: line.lineOrder ?? i + 1,
          product_id: line.productId ?? null,
          product_code: meta.productCode,
          description: line.description,
          unit: line.unit ?? 'un',
          quantity: line.quantity,
          quantity_received: 0,
          unit_cost: line.unitCost,
          discount_pct: line.discountPct ?? 0,
          tax_rate_id: meta.taxRateId,
          tax_rate_pct: meta.taxRatePct,
          subtotal: t.subtotal,
          discount_amount: t.discount_amount,
          tax_amount: t.tax_amount,
          line_total: t.line_total,
          lot_number: line.lotNumber ?? null,
          serial_number: line.serialNumber ?? null,
          notes: line.notes ?? null,
          created_at: now,
          updated_at: now,
        });
      }

      await trx('purchase_documents').insert({
        id,
        organization_id: organizationId,
        doc_number: docNumber,
        doc_type: dto.docType,
        status: 'draft',
        supplier_id: dto.supplierId,
        supplier_doc_number: dto.supplierDocNumber ?? null,
        supplier_doc_date: dto.supplierDocDate ?? null,
        issue_date: dto.issueDate,
        expected_delivery_date: dto.expectedDeliveryDate ?? null,
        due_date: dto.dueDate ?? null,
        currency: dto.currency ?? 'BRL',
        exchange_rate: dto.exchangeRate ?? 1,
        warehouse_id: warehouseId,
        subtotal: this.round4(subtotalSum),
        total_discount: this.round4(discountSum),
        total_tax: this.round4(taxSum),
        total: this.round4(totalSum),
        amount_paid: 0,
        withholding_amount: dto.withholdingAmount ?? 0,
        notes: dto.notes ?? null,
        terms: dto.terms ?? null,
        payment_method: dto.paymentMethod ?? null,
        assigned_user_id: dto.assignedUserId ?? null,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });

      if (lineRows.length) await trx('purchase_document_lines').insert(lineRows);

      // Avalia regras de aprovação (mesma engine usada em Sales)
      const subtotalRounded = this.round4(subtotalSum);
      const totalDiscountPct =
        subtotalRounded > 0 ? (this.round4(discountSum) / subtotalRounded) * 100 : 0;
      const entityData: Record<string, unknown> = {
        doc_type: dto.docType,
        currency: dto.currency ?? 'BRL',
        subtotal: subtotalRounded,
        total: this.round4(totalSum),
        total_discount_pct: Math.round(totalDiscountPct * 100) / 100,
        line_count: lineRows.length,
      };
      const requests = await this.approvalsService.evaluateAndCreate(
        'purchase_document',
        id,
        entityData,
        docNumber,
        organizationId,
        userId,
        trx,
      );
      if (requests.length > 0) {
        await trx('purchase_documents').where({ id }).update({
          approval_status: 'pending',
          approval_request_id: requests[0].id,
          updated_at: new Date(),
        });
      }

      return id;
    }).then((id) => this.getById(id, user));
  }

  async update(id: string, dto: UpdatePurchaseDocumentDto, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const existing = await trx<PurchaseDocumentRow>('purchase_documents')
        .where({ id, organization_id: organizationId })
        .first();
      if (!existing) throw new NotFoundException('Documento não encontrado');
      if (existing.status === 'cancelled')
        throw new BadRequestException('Documento cancelado não pode ser editado');

      // Documentos fiscais já emitidos (invoice/credit_note não-draft) ficam imutáveis
      const fiscalLocked =
        ['invoice', 'credit_note'].includes(existing.doc_type) && existing.status !== 'draft';
      if (fiscalLocked)
        throw new BadRequestException('Documento fiscal emitido não pode ser editado');

      const headerPatch: Record<string, unknown> = { updated_at: new Date() };
      if (dto.supplierId !== undefined) headerPatch.supplier_id = dto.supplierId;
      if (dto.supplierDocNumber !== undefined)
        headerPatch.supplier_doc_number = dto.supplierDocNumber ?? null;
      if (dto.supplierDocDate !== undefined)
        headerPatch.supplier_doc_date = dto.supplierDocDate ?? null;
      if (dto.issueDate !== undefined) headerPatch.issue_date = dto.issueDate;
      if (dto.expectedDeliveryDate !== undefined)
        headerPatch.expected_delivery_date = dto.expectedDeliveryDate ?? null;
      if (dto.dueDate !== undefined) headerPatch.due_date = dto.dueDate ?? null;
      if (dto.currency !== undefined) headerPatch.currency = dto.currency;
      if (dto.exchangeRate !== undefined) headerPatch.exchange_rate = dto.exchangeRate;
      if (dto.warehouseId !== undefined) headerPatch.warehouse_id = dto.warehouseId ?? null;
      if (dto.withholdingAmount !== undefined)
        headerPatch.withholding_amount = dto.withholdingAmount;
      if (dto.notes !== undefined) headerPatch.notes = dto.notes ?? null;
      if (dto.terms !== undefined) headerPatch.terms = dto.terms ?? null;
      if (dto.paymentMethod !== undefined) headerPatch.payment_method = dto.paymentMethod ?? null;
      if (dto.assignedUserId !== undefined)
        headerPatch.assigned_user_id = dto.assignedUserId ?? null;

      if (dto.lines) {
        if (dto.lines.length === 0) throw new BadRequestException('Documento sem linhas');
        await trx('purchase_document_lines').where({ document_id: id }).delete();

        let subtotalSum = 0;
        let discountSum = 0;
        let taxSum = 0;
        let totalSum = 0;
        const now = new Date();
        const lineRows: Array<Record<string, unknown>> = [];

        for (let i = 0; i < dto.lines.length; i++) {
          const line = dto.lines[i];
          const meta = await this.resolveLineMeta(line, organizationId, trx);
          const t = this.computeLine({ ...line, taxRatePct: meta.taxRatePct });
          subtotalSum += t.subtotal;
          discountSum += t.discount_amount;
          taxSum += t.tax_amount;
          totalSum += t.line_total;
          lineRows.push({
            id: randomUUID(),
            organization_id: organizationId,
            document_id: id,
            line_order: line.lineOrder ?? i + 1,
            product_id: line.productId ?? null,
            product_code: meta.productCode,
            description: line.description,
            unit: line.unit ?? 'un',
            quantity: line.quantity,
            quantity_received: 0,
            unit_cost: line.unitCost,
            discount_pct: line.discountPct ?? 0,
            tax_rate_id: meta.taxRateId,
            tax_rate_pct: meta.taxRatePct,
            subtotal: t.subtotal,
            discount_amount: t.discount_amount,
            tax_amount: t.tax_amount,
            line_total: t.line_total,
            lot_number: line.lotNumber ?? null,
            serial_number: line.serialNumber ?? null,
            notes: line.notes ?? null,
            created_at: now,
            updated_at: now,
          });
        }
        if (lineRows.length) await trx('purchase_document_lines').insert(lineRows);
        headerPatch.subtotal = this.round4(subtotalSum);
        headerPatch.total_discount = this.round4(discountSum);
        headerPatch.total_tax = this.round4(taxSum);
        headerPatch.total = this.round4(totalSum);
      }

      await trx('purchase_documents').where({ id }).update(headerPatch);
      return id;
    }).then((id) => this.getById(id, user));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STATE MACHINE
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Transições válidas:
   *   draft        → sent / cancelled / received / invoiced
   *   sent         → accepted / rejected / received / cancelled
   *   accepted     → received / invoiced / cancelled
   *   received     → invoiced / cancelled
   *   invoiced     → paid / partially_paid / cancelled
   *   partially_paid → paid / cancelled
   *   paid         → cancelled
   *   rejected     → cancelled
   *   cancelled    → (terminal)
   */
  private validateStatusTransition(from: PurchaseDocStatus, to: PurchaseDocStatus) {
    if (from === to) return;
    const allowed: Record<PurchaseDocStatus, PurchaseDocStatus[]> = {
      draft: ['sent', 'cancelled', 'received', 'invoiced'],
      sent: ['accepted', 'rejected', 'received', 'cancelled'],
      accepted: ['received', 'invoiced', 'cancelled'],
      received: ['invoiced', 'cancelled'],
      invoiced: ['paid', 'partially_paid', 'cancelled'],
      partially_paid: ['paid', 'cancelled'],
      paid: ['cancelled'],
      rejected: ['cancelled'],
      cancelled: [],
    };
    if (!allowed[from].includes(to))
      throw new BadRequestException(`Transição de status inválida: ${from} → ${to}`);
  }

  async changeStatus(id: string, dto: ChangePurchaseStatusDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const existing = await trx<PurchaseDocumentRow>('purchase_documents')
        .where({ id, organization_id: organizationId })
        .first();
      if (!existing) throw new NotFoundException('Documento não encontrado');

      this.validateStatusTransition(existing.status, dto.status);

      // Bloqueio por aprovação pendente
      if (
        existing.approval_status === 'pending' &&
        dto.status !== 'cancelled' &&
        dto.status !== 'draft'
      ) {
        throw new BadRequestException(
          'Documento aguarda aprovação. Solicite ao aprovador para decidir antes de avançar.',
        );
      }
      if (
        existing.approval_status === 'rejected' &&
        dto.status !== 'cancelled' &&
        dto.status !== 'draft'
      ) {
        throw new BadRequestException(
          'Documento foi rejeitado pelo aprovador. Edite ou cancele.',
        );
      }

      const patch: Record<string, unknown> = { status: dto.status, updated_at: new Date() };
      if (dto.notes !== undefined) patch.notes = dto.notes ?? null;
      if (dto.status === 'received') patch.received_at = new Date();
      if (dto.status === 'invoiced') patch.invoiced_at = new Date();
      if (dto.status === 'cancelled') patch.cancelled_at = new Date();

      await trx('purchase_documents').where({ id }).update(patch);

      // ─── Side effects ──────────────────────────────────────────────

      // Recebido OU faturado direto → cria entrada de stock (idempotente)
      const enteringStock =
        (dto.status === 'received' || dto.status === 'invoiced') && !existing.stock_committed;
      if (enteringStock) {
        await this.commitStockEntry(id, organizationId, userId, trx);
        await trx('purchase_documents').where({ id }).update({
          stock_committed: true,
          stock_committed_at: new Date(),
        });
      }

      // Recebido → lançamento de recepção (regra inativa por padrão — fluxo 2 passos)
      if (dto.status === 'received' && existing.status !== 'received') {
        await this.autoJournal.generate(
          {
            organizationId,
            userId,
            eventType: 'purchase_receipt',
            referenceType: 'purchase_document_receipt',
            referenceId: id,
            description: `Recepção ${existing.doc_number}`,
            entryDate: new Date(existing.issue_date),
            amounts: {
              subtotal: Number(existing.subtotal),
              total: Number(existing.total),
            },
          },
          trx,
        );
      }

      // Faturado → cria AP + lançamento contábil
      if (dto.status === 'invoiced' && existing.status !== 'invoiced') {
        await this.paymentsService.onDocumentInvoiced(id, organizationId, userId, trx);

        const isCreditSide = existing.doc_type === 'credit_note';
        const withholding = Number(existing.withholding_amount ?? 0);
        await this.autoJournal.generate(
          {
            organizationId,
            userId,
            eventType: isCreditSide ? 'purchase_credit_note' : 'purchase_invoice',
            referenceType: 'purchase_document',
            referenceId: id,
            description: `${existing.doc_type} ${existing.doc_number}`,
            entryDate: new Date(existing.issue_date),
            amounts: {
              total: Number(existing.total),
              subtotal: Number(existing.subtotal),
              tax: Number(existing.total_tax),
              discount: Number(existing.total_discount),
              withholding,
              net_total: Number(existing.total) - withholding,
            },
          },
          trx,
        );
      }

      // Pago manualmente → atualiza amount_paid pra match total
      if (dto.status === 'paid' && existing.status !== 'paid') {
        const total = Number(existing.total) - Number(existing.withholding_amount ?? 0);
        if (Number(existing.amount_paid) < total) {
          await trx('purchase_documents').where({ id }).update({ amount_paid: total });
        }
      }

      // Cancelado → cancela AP + aprovação pendente + estorna lançamentos
      if (dto.status === 'cancelled' && existing.status !== 'cancelled') {
        await this.paymentsService.onDocumentCancelled(id, organizationId, trx);
        await this.approvalsService.cancelRequest('purchase_document', id, organizationId, trx);
        await this.autoJournal.reverseForReference(
          organizationId,
          'purchase_document',
          id,
          userId,
          trx,
        );
        await this.autoJournal.reverseForReference(
          organizationId,
          'purchase_document_receipt',
          id,
          userId,
          trx,
        );
      }

      return id;
    }).then((id) => this.getById(id, user));
  }

  /**
   * Cria movimentos de entrada de stock para todas as linhas do documento.
   * Usa quantity_received se já preenchida (recepção parcial); senão usa quantity.
   * Atualiza custo médio ponderado automaticamente via applyMovement.
   */
  private async commitStockEntry(
    documentId: string,
    organizationId: string,
    userId: string,
    trx: Knex.Transaction,
  ): Promise<void> {
    const doc = await trx('purchase_documents')
      .where({ id: documentId })
      .first<{
        warehouse_id: string | null;
        doc_number: string;
        exchange_rate: string | number;
      }>();
    if (!doc) return;

    let warehouseId = doc.warehouse_id;
    if (!warehouseId) {
      const def = await trx('stock_warehouses')
        .where({ organization_id: organizationId, is_default: true, is_active: true })
        .first<{ id: string } | undefined>();
      if (!def)
        throw new BadRequestException(
          'Nenhum armazém padrão configurado — não é possível receber stock',
        );
      warehouseId = def.id;
    }

    const lines = await trx<PurchaseDocumentLineRow>('purchase_document_lines')
      .where({ document_id: documentId })
      .whereNotNull('product_id');

    const exchangeRate = Number(doc.exchange_rate ?? 1);

    for (const l of lines) {
      if (!l.product_id) continue;
      const qty = Number(l.quantity_received) > 0 ? Number(l.quantity_received) : Number(l.quantity);
      if (qty <= 0) continue;

      // Custo na moeda local = unit_cost * exchange_rate
      const unitCostLocal = this.round4(Number(l.unit_cost) * exchangeRate);

      // Só cria movimento se produto rastreia stock
      const p = await trx('sales_products')
        .where({ id: l.product_id, organization_id: organizationId })
        .first<{ stock_track: boolean } | undefined>();
      if (!p?.stock_track) continue;

      await this.movements.applyMovement(
        {
          organizationId,
          productId: l.product_id,
          warehouseId,
          movementType: 'in',
          quantity: qty,
          unitCost: unitCostLocal,
          referenceType: 'purchase_document',
          referenceId: documentId,
          referenceNumber: doc.doc_number,
          lotNumber: l.lot_number,
          serialNumber: l.serial_number,
          notes: `Entrada via ${doc.doc_number}`,
          userId,
        },
        trx,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONVERSÃO ENTRE TIPOS (order → receipt → invoice)
  // ═══════════════════════════════════════════════════════════════════════

  async convert(sourceId: string, dto: ConvertPurchaseDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const source = await trx<PurchaseDocumentRow>('purchase_documents')
        .where({ id: sourceId, organization_id: organizationId })
        .first();
      if (!source) throw new NotFoundException('Documento de origem não encontrado');

      const allowed = CONVERSION_MAP[source.doc_type];
      if (!allowed.includes(dto.toDocType))
        throw new BadRequestException(
          `Não é possível converter ${source.doc_type} → ${dto.toDocType}`,
        );

      if (source.status === 'cancelled')
        throw new BadRequestException('Documento cancelado não pode ser convertido');

      const sourceLines = await trx<PurchaseDocumentLineRow>('purchase_document_lines')
        .where({ document_id: sourceId })
        .orderBy('line_order', 'asc');

      const newId = randomUUID();
      const issueDate = dto.issueDate ?? new Date().toISOString().slice(0, 10);
      const year = new Date(issueDate).getUTCFullYear();
      const docNumber = await this.nextDocNumber(organizationId, dto.toDocType, year, trx);
      const now = new Date();

      // Para recepção, aplica quantidade parcial se fornecida
      const partialMap = dto.partialReceipts ?? {};
      const newLines = sourceLines.map((l) => {
        const partialQty = partialMap[l.id];
        const newId = randomUUID();
        return {
          ...l,
          id: newId,
          document_id: '__placeholder__', // setado abaixo
          // Para receipt, copia quantity como pedida e marca quantity_received pelo partial
          quantity_received: dto.toDocType === 'receipt' ? partialQty ?? Number(l.quantity) : 0,
          created_at: now,
          updated_at: now,
        };
      });
      newLines.forEach((l) => (l.document_id = newId));

      // Recalcula totais se conversão alterou quantidades (parcial em receipt)
      let subtotalSum = 0;
      let discountSum = 0;
      let taxSum = 0;
      let totalSum = 0;
      for (const l of newLines) {
        // Se for recepção parcial, recalcula com quantity_received
        const effectiveQty =
          dto.toDocType === 'receipt' ? Number(l.quantity_received) : Number(l.quantity);
        const cost = Number(l.unit_cost);
        const sub = this.round4(effectiveQty * cost);
        const disc = this.round4((sub * Number(l.discount_pct)) / 100);
        const taxable = sub - disc;
        const tax = this.round4((taxable * Number(l.tax_rate_pct)) / 100);
        const total = this.round4(taxable + tax);
        l.subtotal = sub;
        l.discount_amount = disc;
        l.tax_amount = tax;
        l.line_total = total;
        subtotalSum += sub;
        discountSum += disc;
        taxSum += tax;
        totalSum += total;
      }

      await trx('purchase_documents').insert({
        id: newId,
        organization_id: organizationId,
        doc_number: docNumber,
        doc_type: dto.toDocType,
        status: 'draft',
        supplier_id: source.supplier_id,
        supplier_doc_number: source.supplier_doc_number,
        supplier_doc_date: source.supplier_doc_date,
        issue_date: issueDate,
        expected_delivery_date: null,
        due_date: dto.dueDate ?? null,
        currency: source.currency,
        exchange_rate: source.exchange_rate,
        warehouse_id: source.warehouse_id,
        subtotal: this.round4(subtotalSum),
        total_discount: this.round4(discountSum),
        total_tax: this.round4(taxSum),
        total: this.round4(totalSum),
        amount_paid: 0,
        withholding_amount: dto.toDocType === 'invoice' ? source.withholding_amount : 0,
        converted_from_id: sourceId,
        notes: source.notes,
        terms: source.terms,
        payment_method: source.payment_method,
        assigned_user_id: source.assigned_user_id,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });

      if (newLines.length) await trx('purchase_document_lines').insert(newLines);

      // Marca origem
      if (source.doc_type === 'order' && dto.toDocType === 'receipt') {
        await trx('purchase_documents').where({ id: sourceId }).update({
          status: 'received',
          updated_at: now,
        });
      } else if (
        (source.doc_type === 'order' || source.doc_type === 'receipt') &&
        dto.toDocType === 'invoice'
      ) {
        await trx('purchase_documents').where({ id: sourceId }).update({
          status: 'invoiced',
          updated_at: now,
        });
      }

      return newId;
    }).then((newId) => this.getById(newId, user));
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const existing = await this.knex<PurchaseDocumentRow>('purchase_documents')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Documento não encontrado');
    if (existing.status !== 'draft')
      throw new BadRequestException('Apenas rascunhos podem ser excluídos; cancele se necessário');
    await this.knex('purchase_documents').where({ id }).delete();
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXTRATO DO FORNECEDOR
  // ═══════════════════════════════════════════════════════════════════════

  async supplierStatement(supplierId: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const supplier = await this.knex('suppliers')
      .where({ id: supplierId, organization_id: organizationId })
      .first();
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado');

    const docs = await this.knex<PurchaseDocumentRow>('purchase_documents')
      .where({ organization_id: organizationId, supplier_id: supplierId })
      .whereIn('doc_type', ['invoice', 'credit_note'])
      .whereNotIn('status', ['draft', 'cancelled'])
      .orderBy('issue_date', 'asc')
      .orderBy('doc_number', 'asc');

    let balance = 0;
    const entries = docs.map((d) => {
      const total = Number(d.total) - Number(d.withholding_amount ?? 0);
      const paid = Number(d.amount_paid);
      const sign = d.doc_type === 'credit_note' ? -1 : 1;
      const delta = sign * (total - paid);
      balance += delta;
      return {
        document_id: d.id,
        doc_number: d.doc_number,
        supplier_doc_number: d.supplier_doc_number,
        doc_type: d.doc_type,
        status: d.status,
        issue_date: d.issue_date,
        due_date: d.due_date,
        total,
        amount_paid: paid,
        outstanding: sign * (total - paid),
        running_balance: balance,
      };
    });

    return {
      supplier: { id: supplier.id, name: supplier.name, code: supplier.code },
      entries,
      summary: {
        totalDocs: docs.length,
        balance,
        currency: docs[0]?.currency ?? 'BRL',
      },
    };
  }
}
