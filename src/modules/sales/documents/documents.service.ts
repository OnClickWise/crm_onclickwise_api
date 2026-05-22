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
  ChangeStatusDto,
  ConvertDocumentDto,
  CreateDocumentDto,
  CreateDocumentLineDto,
  DocStatus,
  DocType,
  UpdateDocumentDto,
} from './dtos/document.dto';
import { SalesPaymentsService } from '../payments/sales-payments.service';
import { SalesFulfillmentsService } from '../fulfillments/fulfillments.service';
import { StockReservationsService } from '../stock/stock-reservations.service';
import { StockMovementsService } from '../../inventory/movements/movements.service';
import { SalesDocumentSeriesService } from '../series/series.service';
import { CustomerCreditService } from '../credit/customer-credit.service';
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

const WRITE_ROLES = ['master', 'admin', 'sales', 'manager'] as const;
const READ_ROLES = [...WRITE_ROLES, 'sdr', 'employee', 'accountant'] as const;

/**
 * Prefixos padrão por tipo de documento. Pode ser customizado por org no futuro
 * via tabela `sales_document_numbering` (já temos o campo prefix).
 */
const DEFAULT_PREFIXES: Record<DocType, string> = {
  quote: 'ORC',
  order: 'ENC',
  delivery: 'GR',
  invoice: 'FAT',
  credit_note: 'NC',
  customer_return: 'DEV',
};

/**
 * Conversões permitidas (lineage):
 *   quote → order → delivery → invoice
 *   quote → invoice (atalho)
 *   invoice → credit_note
 */
const CONVERSION_MAP: Record<DocType, DocType[]> = {
  quote: ['order', 'invoice'],
  order: ['delivery', 'invoice'],
  delivery: ['invoice'],
  invoice: ['credit_note', 'customer_return'],
  credit_note: [],
  customer_return: [],
};

export interface DocumentRow {
  id: string;
  organization_id: string;
  doc_number: string;
  doc_type: DocType;
  status: DocStatus;
  customer_id: string;
  price_list_id: string | null;
  issue_date: Date | string;
  due_date: Date | string | null;
  valid_until: Date | string | null;
  currency: string;
  exchange_rate: string | number;
  subtotal: string | number;
  total_discount: string | number;
  total_tax: string | number;
  total: string | number;
  amount_paid: string | number;
  stock_committed: boolean;
  stock_committed_at: Date | null;
  converted_from_id: string | null;
  notes: string | null;
  terms: string | null;
  payment_method: string | null;
  assigned_user_id: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  issued_at: Date | null;
  cancelled_at: Date | null;
}

export interface DocumentLineRow {
  id: string;
  organization_id: string;
  document_id: string;
  line_order: number;
  product_id: string | null;
  product_code: string | null;
  description: string;
  unit: string;
  quantity: string | number;
  unit_price: string | number;
  discount_pct: string | number;
  tax_rate_id: string | null;
  tax_rate_pct: string | number;
  subtotal: string | number;
  discount_amount: string | number;
  tax_amount: string | number;
  line_total: string | number;
  notes: string | null;
}

interface LineTotals {
  subtotal: number;
  discount_amount: number;
  taxable: number;
  tax_amount: number;
  line_total: number;
}

@Injectable()
export class SalesDocumentsService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly paymentsService: SalesPaymentsService,
    private readonly fulfillmentsService: SalesFulfillmentsService,
    private readonly reservations: StockReservationsService,
    private readonly movements: StockMovementsService,
    private readonly seriesService: SalesDocumentSeriesService,
    private readonly creditService: CustomerCreditService,
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
      throw new ForbiddenException('Sem permissão para gerenciar documentos');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar documentos');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CÁLCULO DE LINHAS — coração financeiro do módulo
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Regra: arredonda em 4 casas durante cálculo intermediário (preço), mas
   * mantém 2 casas no total final (boas práticas contábeis para a maioria
   * das moedas). Aqui mantemos 4 casas porque o banco aceita 18,4 — UI pode
   * arredondar para apresentação.
   */
  private round4(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  private computeLine(line: CreateDocumentLineDto): LineTotals {
    const qty = Number(line.quantity);
    const price = Number(line.unitPrice);
    const discountPct = Number(line.discountPct ?? 0);
    const taxPct = Number(line.taxRatePct ?? 0);
    if (qty < 0 || price < 0) throw new BadRequestException('Quantidade/preço inválidos');
    if (discountPct < 0 || discountPct > 100)
      throw new BadRequestException('Desconto fora do range 0-100%');

    const subtotal = this.round4(qty * price);
    const discount_amount = this.round4((subtotal * discountPct) / 100);
    const taxable = this.round4(subtotal - discount_amount);
    const tax_amount = this.round4((taxable * taxPct) / 100);
    const line_total = this.round4(taxable + tax_amount);
    return { subtotal, discount_amount, taxable, tax_amount, line_total };
  }

  private async resolveLineMeta(
    line: CreateDocumentLineDto,
    organizationId: string,
    trx: Knex.Transaction,
  ): Promise<{ productCode: string | null; taxRatePct: number; taxRateId: string | null }> {
    let productCode: string | null = null;
    let resolvedTaxId: string | null = line.taxRateId ?? null;
    let resolvedTaxPct: number = Number(line.taxRatePct ?? 0);

    if (line.productId) {
      const product = await trx('sales_products')
        .where({ id: line.productId, organization_id: organizationId })
        .first<{ code: string; default_tax_rate_id: string | null } | undefined>();
      if (!product) throw new BadRequestException(`Produto ${line.productId} inválido`);
      productCode = product.code;
      // Se a linha não definiu imposto, herda do produto
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

  /**
   * Gera próximo número via SeriesService (suporta múltiplas séries por tipo).
   * Mantém compatibilidade: se nenhuma série existe, cria 'A' automaticamente.
   * Retorna { docNumber, seriesId } pra que callers possam persistir o vínculo.
   */
  private async nextDocNumber(
    organizationId: string,
    docType: DocType,
    issueYear: number,
    trx: Knex.Transaction,
    opts: { seriesId?: string | null } = {},
  ): Promise<{ docNumber: string; seriesId: string }> {
    return this.seriesService.nextNumber(organizationId, docType, issueYear, trx, {
      seriesId: opts.seriesId ?? null,
      defaultPrefix: DEFAULT_PREFIXES[docType],
    });
  }

  // (numeração legada — mantida apenas se algum caller ainda usar)
  private async _legacyNumber(
    organizationId: string,
    docType: DocType,
    issueYear: number,
    trx: Knex.Transaction,
  ): Promise<string> {
    const prefix = DEFAULT_PREFIXES[docType];
    let row = await trx('sales_document_numbering')
      .where({ organization_id: organizationId, doc_type: docType, year: issueYear })
      .forUpdate()
      .first<{ id: string; last_number: number; prefix: string }>();
    if (!row) {
      const id = randomUUID();
      await trx('sales_document_numbering').insert({
        id,
        organization_id: organizationId,
        doc_type: docType,
        prefix,
        year: issueYear,
        last_number: 0,
      });
      row = await trx('sales_document_numbering')
        .where({ id })
        .forUpdate()
        .first<{ id: string; last_number: number; prefix: string }>();
      if (!row) throw new Error('Falha ao criar contador de numeração');
    }

    const nextNum = row.last_number + 1;
    await trx('sales_document_numbering')
      .where({ id: row.id })
      .update({ last_number: nextNum, updated_at: new Date() });

    return `${row.prefix}-${issueYear}-${String(nextNum).padStart(4, '0')}`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRUD
  // ═══════════════════════════════════════════════════════════════════════

  async list(
    user: AuthUserPayload,
    opts: {
      docType?: DocType;
      status?: DocStatus;
      customerId?: string;
      from?: string;
      to?: string;
      query?: string;
      limit?: number;
    } = {},
  ) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    return this.knex<DocumentRow>('sales_documents as d')
      .leftJoin('customers as c', 'd.customer_id', 'c.id')
      .where('d.organization_id', organizationId)
      .modify((q) => {
        if (opts.docType) q.andWhere('d.doc_type', opts.docType);
        if (opts.status) q.andWhere('d.status', opts.status);
        if (opts.customerId) q.andWhere('d.customer_id', opts.customerId);
        if (opts.from) q.andWhere('d.issue_date', '>=', opts.from);
        if (opts.to) q.andWhere('d.issue_date', '<=', opts.to);
        if (opts.query) {
          const term = `%${opts.query.toLowerCase()}%`;
          q.andWhere((sub) =>
            sub
              .whereRaw('LOWER(d.doc_number) like ?', [term])
              .orWhereRaw('LOWER(c.name) like ?', [term]),
          );
        }
      })
      .select(
        'd.*',
        { customer_name: 'c.name' },
        { customer_email: 'c.email' },
      )
      .orderBy('d.issue_date', 'desc')
      .orderBy('d.doc_number', 'desc')
      .limit(opts.limit ?? 200);
  }

  async getById(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const doc = await this.knex<DocumentRow>('sales_documents')
      .where({ id, organization_id: organizationId })
      .first();
    if (!doc) throw new NotFoundException('Documento não encontrado');

    const lines = await this.knex<DocumentLineRow>('sales_document_lines')
      .where({ document_id: id })
      .orderBy('line_order', 'asc');

    const customer = await this.knex('customers')
      .where({ id: doc.customer_id, organization_id: organizationId })
      .first();

    return { ...doc, lines, customer };
  }

  async create(dto: CreateDocumentDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    // Verifica cliente
    const customer = await this.knex('customers')
      .where({ id: dto.customerId, organization_id: organizationId })
      .first();
    if (!customer) throw new BadRequestException('Cliente inválido');

    if (dto.lines.length === 0) throw new BadRequestException('Documento sem linhas');

    // Calcula total previsto para checagem de crédito (idempotente — recalcula
    // depois nas linhas reais com taxas resolvidas; aqui é estimativa).
    const previewTotal = dto.lines.reduce((s, l) => {
      const sub = Number(l.quantity ?? 0) * Number(l.unitPrice ?? 0);
      const disc = (sub * Number(l.discountPct ?? 0)) / 100;
      const taxable = sub - disc;
      const tax = (taxable * Number(l.taxRatePct ?? 0)) / 100;
      return s + taxable + tax;
    }, 0);

    // Bloqueio de cliente / limite de crédito (apenas para documentos que
    // exigem comprometimento financeiro: order/invoice/customer_return).
    if (['order', 'invoice'].includes(dto.docType)) {
      await this.creditService.assertCanCreateDocument(dto.customerId, previewTotal, user);
    }

    return this.knex.transaction(async (trx) => {
      const id = randomUUID();
      const issueDate = new Date(dto.issueDate);
      const year = issueDate.getUTCFullYear();
      const { docNumber, seriesId } = await this.nextDocNumber(
        organizationId,
        dto.docType,
        year,
        trx,
        { seriesId: dto.seriesId ?? null },
      );
      const now = new Date();

      // Insere linhas + acumula totais
      let subtotalSum = 0;
      let discountSum = 0;
      let taxSum = 0;
      let totalSum = 0;

      const lineRows: Array<Record<string, unknown>> = [];
      for (let i = 0; i < dto.lines.length; i++) {
        const line = dto.lines[i];
        const meta = await this.resolveLineMeta(line, organizationId, trx);
        const lineWithMeta = { ...line, taxRatePct: meta.taxRatePct };
        const t = this.computeLine(lineWithMeta);
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
          unit_price: line.unitPrice,
          discount_pct: line.discountPct ?? 0,
          tax_rate_id: meta.taxRateId,
          tax_rate_pct: meta.taxRatePct,
          subtotal: t.subtotal,
          discount_amount: t.discount_amount,
          tax_amount: t.tax_amount,
          line_total: t.line_total,
          notes: line.notes ?? null,
          created_at: now,
          updated_at: now,
        });
      }

      await trx('sales_documents').insert({
        id,
        organization_id: organizationId,
        doc_number: docNumber,
        doc_type: dto.docType,
        status: 'draft',
        series_id: seriesId,
        customer_id: dto.customerId,
        price_list_id: dto.priceListId ?? null,
        issue_date: dto.issueDate,
        due_date: dto.dueDate ?? null,
        valid_until: dto.validUntil ?? null,
        currency: dto.currency ?? 'BRL',
        exchange_rate: dto.exchangeRate ?? 1,
        subtotal: this.round4(subtotalSum),
        total_discount: this.round4(discountSum),
        total_tax: this.round4(taxSum),
        total: this.round4(totalSum),
        amount_paid: 0,
        notes: dto.notes ?? null,
        terms: dto.terms ?? null,
        payment_method: dto.paymentMethod ?? null,
        assigned_user_id: dto.assignedUserId ?? null,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });

      if (lineRows.length) await trx('sales_document_lines').insert(lineRows);

      // ─── Avaliação de regras de aprovação ────────────────────────────
      // Calcula campos derivados (% de desconto sobre subtotal) para que
      // regras como "desconto >= 15%" funcionem.
      const subtotalRounded = this.round4(subtotalSum);
      const totalDiscountPct =
        subtotalRounded > 0 ? (this.round4(discountSum) / subtotalRounded) * 100 : 0;
      const entityData: Record<string, unknown> = {
        doc_type: dto.docType,
        currency: dto.currency ?? 'BRL',
        subtotal: subtotalRounded,
        total: this.round4(totalSum),
        total_discount: this.round4(discountSum),
        total_discount_pct: Math.round(totalDiscountPct * 100) / 100,
        total_tax: this.round4(taxSum),
        line_count: lineRows.length,
      };
      const requests = await this.approvalsService.evaluateAndCreate(
        'sales_document',
        id,
        entityData,
        docNumber,
        organizationId,
        userId,
        trx,
      );
      if (requests.length > 0) {
        await trx('sales_documents').where({ id }).update({
          approval_status: 'pending',
          approval_request_id: requests[0].id,
          updated_at: new Date(),
        });
      }

      return id;
    }).then((id) => this.getById(id, user));
  }

  async update(id: string, dto: UpdateDocumentDto, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const existing = await trx<DocumentRow>('sales_documents')
        .where({ id, organization_id: organizationId })
        .first();
      if (!existing) throw new NotFoundException('Documento não encontrado');
      if (existing.status === 'cancelled')
        throw new BadRequestException('Documento cancelado não pode ser editado');
      // Documentos fiscais já emitidos (invoice/credit_note não-draft) ficam imutáveis
      const fiscalLocked =
        ['invoice', 'credit_note', 'customer_return'].includes(existing.doc_type) &&
        existing.status !== 'draft';
      if (fiscalLocked)
        throw new BadRequestException(
          'Documento fiscal emitido não pode ser editado; emita nota de crédito se necessário',
        );

      // Header
      const headerPatch: Record<string, unknown> = { updated_at: new Date() };
      if (dto.customerId !== undefined) headerPatch.customer_id = dto.customerId;
      if (dto.priceListId !== undefined) headerPatch.price_list_id = dto.priceListId ?? null;
      if (dto.issueDate !== undefined) headerPatch.issue_date = dto.issueDate;
      if (dto.dueDate !== undefined) headerPatch.due_date = dto.dueDate ?? null;
      if (dto.validUntil !== undefined) headerPatch.valid_until = dto.validUntil ?? null;
      if (dto.currency !== undefined) headerPatch.currency = dto.currency;
      if (dto.exchangeRate !== undefined) headerPatch.exchange_rate = dto.exchangeRate;
      if (dto.notes !== undefined) headerPatch.notes = dto.notes ?? null;
      if (dto.terms !== undefined) headerPatch.terms = dto.terms ?? null;
      if (dto.paymentMethod !== undefined) headerPatch.payment_method = dto.paymentMethod ?? null;
      if (dto.assignedUserId !== undefined)
        headerPatch.assigned_user_id = dto.assignedUserId ?? null;

      // Recalcula tudo se linhas vieram (estratégia: replace-all simples e auditável)
      if (dto.lines) {
        if (dto.lines.length === 0) throw new BadRequestException('Documento sem linhas');
        await trx('sales_document_lines').where({ document_id: id }).delete();

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
            unit_price: line.unitPrice,
            discount_pct: line.discountPct ?? 0,
            tax_rate_id: meta.taxRateId,
            tax_rate_pct: meta.taxRatePct,
            subtotal: t.subtotal,
            discount_amount: t.discount_amount,
            tax_amount: t.tax_amount,
            line_total: t.line_total,
            notes: line.notes ?? null,
            created_at: now,
            updated_at: now,
          });
        }

        if (lineRows.length) await trx('sales_document_lines').insert(lineRows);
        headerPatch.subtotal = this.round4(subtotalSum);
        headerPatch.total_discount = this.round4(discountSum);
        headerPatch.total_tax = this.round4(taxSum);
        headerPatch.total = this.round4(totalSum);
      }

      await trx('sales_documents').where({ id }).update(headerPatch);
      return id;
    }).then((id) => this.getById(id, user));
  }

  async changeStatus(id: string, dto: ChangeStatusDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const existing = await trx<DocumentRow>('sales_documents')
        .where({ id, organization_id: organizationId })
        .first();
      if (!existing) throw new NotFoundException('Documento não encontrado');

      this.validateStatusTransition(existing.status, dto.status);

      // Bloqueio por aprovação pendente: enquanto status='draft' OR aprovação
      // pendente, NÃO permitimos avançar para sent/invoiced/etc.
      // Cancelar continua permitido (libera reservas e cancela request).
      const exRow = existing as DocumentRow & { approval_status?: string };
      if (
        exRow.approval_status === 'pending' &&
        dto.status !== 'cancelled' &&
        dto.status !== 'draft'
      ) {
        throw new BadRequestException(
          'Este documento aguarda aprovação. Solicite ao aprovador para decidir antes de avançar.',
        );
      }
      if (
        exRow.approval_status === 'rejected' &&
        dto.status !== 'cancelled' &&
        dto.status !== 'draft'
      ) {
        throw new BadRequestException(
          'Este documento foi rejeitado pelo aprovador. Edite e re-submeta ou cancele.',
        );
      }

      const patch: Record<string, unknown> = {
        status: dto.status,
        updated_at: new Date(),
      };
      if (
        ['sent', 'accepted', 'invoiced'].includes(dto.status) &&
        !existing.issued_at
      ) {
        patch.issued_at = new Date();
      }
      if (dto.status === 'cancelled') patch.cancelled_at = new Date();
      if (dto.notes !== undefined) patch.notes = dto.notes ?? null;

      await trx('sales_documents').where({ id }).update(patch);

      // ─── Side effects ──────────────────────────────────────────────

      // Encomenda aceita → gera pedido de separação + reserva stock.
      if (
        existing.doc_type === 'order' &&
        dto.status === 'accepted' &&
        existing.status !== 'accepted'
      ) {
        await this.fulfillmentsService.createForOrder(id, organizationId, userId, trx);
      }

      if (dto.status === 'invoiced' && existing.status !== 'invoiced') {
        // 1. Decrementa stock APENAS se ainda não foi committed via fulfillment
        //    (faturas geradas direto sem passar por order/delivery).
        if (!existing.stock_committed) {
          await this.decrementStock(id, organizationId, userId, trx);
          await trx('sales_documents').where({ id }).update({
            stock_committed: true,
            stock_committed_at: new Date(),
          });
        }
        // 2. Cria AR + comissão automática (apenas para invoice/credit_note)
        await this.paymentsService.onDocumentInvoiced(id, organizationId, userId, trx);

        // 3. Lançamento contábil automático
        if (['invoice', 'credit_note', 'customer_return'].includes(existing.doc_type)) {
          const isCreditSide =
            existing.doc_type === 'credit_note' || existing.doc_type === 'customer_return';
          await this.autoJournal.generate(
            {
              organizationId,
              userId,
              eventType: isCreditSide ? 'sales_credit_note' : 'sales_invoice',
              referenceType: 'sales_document',
              referenceId: id,
              description: `${existing.doc_type} ${existing.doc_number}`,
              entryDate: new Date(existing.issue_date),
              amounts: {
                total: Number(existing.total),
                subtotal: Number(existing.subtotal),
                tax: Number(existing.total_tax),
                discount: Number(existing.total_discount),
                net_total: Number(existing.total),
              },
            },
            trx,
          );
        }
      }

      if (dto.status === 'paid' && existing.status !== 'paid') {
        await trx('sales_commissions')
          .where({ organization_id: organizationId, document_id: id, status: 'pending' })
          .update({ status: 'eligible', updated_at: new Date() });
        if (Number(existing.amount_paid) < Number(existing.total)) {
          await trx('sales_documents').where({ id }).update({ amount_paid: existing.total });
        }
      }

      if (dto.status === 'cancelled' && existing.status !== 'cancelled') {
        await this.paymentsService.onDocumentCancelled(id, organizationId, trx);
        // Libera reservas se for encomenda
        if (existing.doc_type === 'order') {
          await this.reservations.releaseByReference('sales_order', id, organizationId, trx);
        }
        // Cancela request de aprovação pendente
        await this.approvalsService.cancelRequest('sales_document', id, organizationId, trx);
        // Estorna lançamentos contábeis automáticos (fatura + CMV)
        await this.autoJournal.reverseForReference(
          organizationId,
          'sales_document',
          id,
          userId,
          trx,
        );
        await this.autoJournal.reverseForReference(
          organizationId,
          'sales_document_cogs',
          id,
          userId,
          trx,
        );
      }

      return id;
    }).then((id) => this.getById(id, user));
  }

  /**
   * Transições válidas (regras de negócio):
   *  draft → sent / cancelled
   *  sent → accepted / rejected / invoiced / cancelled
   *  accepted → invoiced / cancelled
   *  invoiced → paid / partially_paid / cancelled
   *  partially_paid → paid / cancelled
   *  qualquer → draft NÃO permitido (uma vez saiu, não volta)
   */
  private validateStatusTransition(from: DocStatus, to: DocStatus) {
    if (from === to) return;
    const allowed: Record<DocStatus, DocStatus[]> = {
      draft: ['sent', 'cancelled', 'invoiced'],
      sent: ['accepted', 'rejected', 'invoiced', 'cancelled'],
      accepted: ['invoiced', 'cancelled'],
      rejected: ['cancelled'],
      invoiced: ['paid', 'partially_paid', 'cancelled'],
      partially_paid: ['paid', 'cancelled'],
      paid: ['cancelled'],
      cancelled: [],
    };
    if (!allowed[from].includes(to))
      throw new BadRequestException(`Transição de status inválida: ${from} → ${to}`);
  }

  /**
   * Decrementa stock via motor de inventário (cria movimentos auditáveis).
   * Usado quando fatura é emitida sem passar por fulfillment (venda direta).
   * Para NC, gera entrada (devolução).
   */
  private async decrementStock(
    documentId: string,
    organizationId: string,
    userId: string,
    trx: Knex.Transaction,
  ) {
    const doc = await trx('sales_documents')
      .where({ id: documentId })
      .first<{ doc_type: string; doc_number: string } | undefined>();
    if (!doc) return;
    // NC + devolução de cliente → entrada de stock (produto volta ao armazém)
    const isCreditNote = ['credit_note', 'customer_return'].includes(doc.doc_type);

    const lines = await trx('sales_document_lines')
      .where({ document_id: documentId })
      .whereNotNull('product_id')
      .select<
        Array<{ product_id: string; quantity: string | number; lot_number?: string | null }>
      >('product_id', 'quantity');

    // Acumula o Custo da Mercadoria Vendida (qtd × custo médio) para o
    // lançamento contábil de CMV.
    let totalCogs = 0;

    for (const l of lines) {
      const p = await trx('sales_products')
        .where({ id: l.product_id, organization_id: organizationId })
        .first<{ stock_track: boolean; default_warehouse_id: string | null } | undefined>();
      if (!p?.stock_track) continue;

      let warehouseId = p.default_warehouse_id;
      if (!warehouseId) {
        const def = await trx('stock_warehouses')
          .where({ organization_id: organizationId, is_default: true, is_active: true })
          .first<{ id: string } | undefined>();
        if (!def) continue; // sem armazém → skip silenciosamente (não impede fatura)
        warehouseId = def.id;
      }

      const result = await this.movements.applyMovement(
        {
          organizationId,
          productId: l.product_id,
          warehouseId,
          movementType: isCreditNote ? 'in' : 'out',
          quantity: Math.abs(Number(l.quantity)),
          referenceType: 'sales_document',
          referenceId: documentId,
          referenceNumber: doc.doc_number,
          notes: isCreditNote
            ? `Devolução via NC ${doc.doc_number}`
            : `Venda direta ${doc.doc_number}`,
          userId,
        },
        trx,
      );
      // Custo médio ponderado do produto × quantidade movimentada
      totalCogs += Math.abs(Number(l.quantity)) * Number(result.newAvgCost ?? 0);
    }

    // Lançamento contábil de CMV (baixa de estoque vs. custo)
    if (totalCogs > 0) {
      await this.autoJournal.generate(
        {
          organizationId,
          userId,
          eventType: isCreditNote ? 'sales_cogs_return' : 'sales_cogs',
          referenceType: 'sales_document_cogs',
          referenceId: documentId,
          description: `CMV ${doc.doc_number}`,
          entryDate: new Date(),
          amounts: { cogs: Math.round(totalCogs * 100) / 100 },
        },
        trx,
      );
    }
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const existing = await this.knex<DocumentRow>('sales_documents')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Documento não encontrado');
    if (existing.status !== 'draft')
      throw new BadRequestException('Apenas rascunhos podem ser excluídos; cancele se necessário');
    await this.knex('sales_documents').where({ id }).delete();
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONVERSÃO ENTRE TIPOS (orçamento → encomenda → fatura)
  // ═══════════════════════════════════════════════════════════════════════

  async convert(
    sourceId: string,
    dto: ConvertDocumentDto,
    user: AuthUserPayload,
  ): Promise<DocumentRow & { lines: DocumentLineRow[] }> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const source = await trx<DocumentRow>('sales_documents')
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

      const sourceLines = await trx<DocumentLineRow>('sales_document_lines')
        .where({ document_id: sourceId })
        .orderBy('line_order', 'asc');

      const newId = randomUUID();
      const issueDate = dto.issueDate ?? new Date().toISOString().slice(0, 10);
      const year = new Date(issueDate).getUTCFullYear();
      const { docNumber, seriesId } = await this.nextDocNumber(
        organizationId,
        dto.toDocType,
        year,
        trx,
      );
      const now = new Date();

      await trx('sales_documents').insert({
        id: newId,
        organization_id: organizationId,
        doc_number: docNumber,
        doc_type: dto.toDocType,
        status: 'draft',
        series_id: seriesId,
        customer_id: source.customer_id,
        price_list_id: source.price_list_id,
        issue_date: issueDate,
        due_date: dto.dueDate ?? null,
        valid_until: null,
        currency: source.currency,
        exchange_rate: source.exchange_rate,
        subtotal: source.subtotal,
        total_discount: source.total_discount,
        total_tax: source.total_tax,
        total: source.total,
        amount_paid: 0,
        converted_from_id: sourceId,
        notes: source.notes,
        terms: source.terms,
        payment_method: source.payment_method,
        assigned_user_id: source.assigned_user_id,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });

      const newLines = sourceLines.map((l) => ({
        ...l,
        id: randomUUID(),
        document_id: newId,
        created_at: now,
        updated_at: now,
      }));
      if (newLines.length) await trx('sales_document_lines').insert(newLines);

      // Marca origem com status apropriado
      if (source.doc_type === 'quote' && dto.toDocType === 'order') {
        await trx('sales_documents')
          .where({ id: sourceId })
          .update({ status: 'accepted', updated_at: now });
      } else if (
        source.doc_type !== 'invoice' &&
        (dto.toDocType === 'invoice' || dto.toDocType === 'delivery')
      ) {
        await trx('sales_documents')
          .where({ id: sourceId })
          .update({ status: 'invoiced', updated_at: now });
      }

      return newId;
    }).then((newId) => this.getById(newId, user) as unknown as DocumentRow & {
      lines: DocumentLineRow[];
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DUPLICAR DOCUMENTO — gera novo draft do mesmo tipo, mesmas linhas
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Cria um novo documento DRAFT como cópia exata de um existente, do mesmo
   * tipo. Útil pra renovar orçamento, refaturar contrato etc.
   * NÃO é "convert" — não muda lineage e não toca status do original.
   */
  async duplicate(
    sourceId: string,
    user: AuthUserPayload,
  ): Promise<DocumentRow & { lines: DocumentLineRow[] }> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const source = await trx<DocumentRow>('sales_documents')
        .where({ id: sourceId, organization_id: organizationId })
        .first();
      if (!source) throw new NotFoundException('Documento de origem não encontrado');

      const sourceLines = await trx<DocumentLineRow>('sales_document_lines')
        .where({ document_id: sourceId })
        .orderBy('line_order', 'asc');

      const newId = randomUUID();
      const issueDate = new Date().toISOString().slice(0, 10);
      const year = new Date(issueDate).getUTCFullYear();
      const { docNumber, seriesId } = await this.nextDocNumber(
        organizationId,
        source.doc_type,
        year,
        trx,
      );
      const now = new Date();

      await trx('sales_documents').insert({
        id: newId,
        organization_id: organizationId,
        doc_number: docNumber,
        doc_type: source.doc_type,
        status: 'draft',
        series_id: seriesId,
        customer_id: source.customer_id,
        price_list_id: source.price_list_id,
        issue_date: issueDate,
        due_date: null,
        valid_until: null,
        currency: source.currency,
        exchange_rate: source.exchange_rate,
        subtotal: source.subtotal,
        total_discount: source.total_discount,
        total_tax: source.total_tax,
        total: source.total,
        amount_paid: 0,
        converted_from_id: null,
        notes: source.notes,
        terms: source.terms,
        payment_method: source.payment_method,
        assigned_user_id: source.assigned_user_id,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });

      const newLines = sourceLines.map((l) => ({
        ...l,
        id: randomUUID(),
        document_id: newId,
        created_at: now,
        updated_at: now,
      }));
      if (newLines.length) await trx('sales_document_lines').insert(newLines);

      return newId;
    }).then((id) => this.getById(id, user) as unknown as DocumentRow & {
      lines: DocumentLineRow[];
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONTA CORRENTE DO CLIENTE — extrato de documentos + saldo
  // ═══════════════════════════════════════════════════════════════════════

  async customerStatement(customerId: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const customer = await this.knex('customers')
      .where({ id: customerId, organization_id: organizationId })
      .first();
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const docs = await this.knex<DocumentRow>('sales_documents')
      .where({ organization_id: organizationId, customer_id: customerId })
      .whereIn('doc_type', ['invoice', 'credit_note', 'customer_return'])
      .whereNotIn('status', ['draft', 'cancelled'])
      .orderBy('issue_date', 'asc')
      .orderBy('doc_number', 'asc');

    let balance = 0;
    const entries = docs.map((d) => {
      // Faturas somam, notas de crédito subtraem; pagamentos abatem do saldo
      const total = Number(d.total);
      const paid = Number(d.amount_paid);
      const sign = ['credit_note', 'customer_return'].includes(d.doc_type) ? -1 : 1;
      const delta = sign * (total - paid);
      balance += delta;
      return {
        document_id: d.id,
        doc_number: d.doc_number,
        doc_type: d.doc_type,
        status: d.status,
        issue_date: d.issue_date,
        due_date: d.due_date,
        total: Number(d.total),
        amount_paid: Number(d.amount_paid),
        outstanding: sign * (total - paid),
        running_balance: balance,
      };
    });

    return {
      customer: { id: customer.id, name: customer.name, code: customer.code },
      entries,
      summary: {
        totalDocs: docs.length,
        balance,
        currency: docs[0]?.currency ?? 'BRL',
      },
    };
  }
}
