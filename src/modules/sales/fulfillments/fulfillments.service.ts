import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { StockReservationsService } from '../stock/stock-reservations.service';
import { StockMovementsService } from '../../inventory/movements/movements.service';
import {
  AssignFulfillmentDto,
  CancelFulfillmentDto,
  FulfillmentPriority,
  FulfillmentStatus,
  PackFulfillmentDto,
  PickStatus,
  RecordPickDto,
  ShipFulfillmentDto,
  UpdateFulfillmentDto,
} from './dtos/fulfillment.dto';

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

const ADMIN_ROLES = ['master', 'admin', 'manager', 'sales'] as const;
const PICKER_ROLES = [...ADMIN_ROLES, 'employee'] as const;

export interface FulfillmentRow {
  id: string;
  organization_id: string;
  order_id: string;
  fulfillment_number: string;
  status: FulfillmentStatus;
  priority: FulfillmentPriority;
  assigned_to_user_id: string | null;
  warehouse_location: string | null;
  carrier: string | null;
  tracking_number: string | null;
  weight_kg: string | number | null;
  package_count: number | null;
  delivery_doc_id: string | null;
  notes: string | null;
  internal_notes: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  assigned_at: Date | null;
  started_at: Date | null;
  picked_at: Date | null;
  packed_at: Date | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
}

export interface FulfillmentItemRow {
  id: string;
  organization_id: string;
  fulfillment_id: string;
  order_line_id: string | null;
  product_id: string | null;
  product_code: string | null;
  description: string;
  unit: string;
  quantity_requested: string | number;
  quantity_picked: string | number;
  status: PickStatus;
  lot_number: string | null;
  serial_number: string | null;
  bin_location: string | null;
  notes: string | null;
  picked_by_user_id: string | null;
  picked_at: Date | null;
}

/**
 * Pedido de Separação (Picking List). Fluxo:
 *
 *   pending  ──assign──▶  assigned
 *               assigned  ──startPicking──▶  picking
 *               picking   ──recordPick(all)──▶  picked
 *               picked    ──pack──▶  packed
 *               packed    ──ship──▶  shipped  (libera reservas + decrementa stock + opcional gera GR)
 *               qualquer  ──cancel──▶  cancelled  (libera reservas se ainda ativas)
 *
 * Pickers (roles 'employee' incluído) podem operar; admins controlam assign/cancel/ship.
 */
@Injectable()
export class SalesFulfillmentsService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly reservations: StockReservationsService,
    private readonly movements: StockMovementsService,
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
      throw new ForbiddenException('Sem permissão para gerir separações');
  }
  private ensurePicker(role: string) {
    if (!PICKER_ROLES.includes(role as (typeof PICKER_ROLES)[number]))
      throw new ForbiddenException('Sem permissão de armazém');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NUMERAÇÃO ATÔMICA
  // ═══════════════════════════════════════════════════════════════════════
  private async nextNumber(
    organizationId: string,
    year: number,
    trx: Knex.Transaction,
  ): Promise<string> {
    let row = await trx('sales_fulfillment_numbering')
      .where({ organization_id: organizationId, year })
      .forUpdate()
      .first<{ id: string; last_number: number; prefix: string }>();
    if (!row) {
      const id = randomUUID();
      await trx('sales_fulfillment_numbering').insert({
        id,
        organization_id: organizationId,
        prefix: 'SEP',
        year,
        last_number: 0,
      });
      row = await trx('sales_fulfillment_numbering')
        .where({ id })
        .forUpdate()
        .first<{ id: string; last_number: number; prefix: string }>();
      if (!row) throw new Error('Falha ao criar contador');
    }
    const next = row.last_number + 1;
    await trx('sales_fulfillment_numbering')
      .where({ id: row.id })
      .update({ last_number: next, updated_at: new Date() });
    return `${row.prefix}-${year}-${String(next).padStart(4, '0')}`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRIAR PEDIDO DE SEPARAÇÃO (auto-gerado quando order é aceita)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Cria fulfillment a partir de uma encomenda + reserva stock dos produtos
   * que têm stock_track=true. Idempotente: se já existe fulfillment ativo
   * pra essa order, retorna o existente.
   *
   * Executa dentro da transação do caller (chamado pelo hook do
   * SalesDocumentsService quando order vai pra 'accepted').
   */
  async createForOrder(
    orderId: string,
    organizationId: string,
    userId: string,
    trx: Knex.Transaction,
  ): Promise<string> {
    // Idempotência: se já existe fulfillment não-cancelado pra essa order, reusa
    const existing = await trx('sales_fulfillments')
      .where({ organization_id: organizationId, order_id: orderId })
      .whereNot({ status: 'cancelled' })
      .first<{ id: string }>();
    if (existing) return existing.id;

    const order = await trx('sales_documents')
      .where({ id: orderId, organization_id: organizationId, doc_type: 'order' })
      .first<{ id: string; issue_date: Date | string }>();
    if (!order) throw new BadRequestException('Encomenda inválida');

    const lines = await trx('sales_document_lines')
      .where({ document_id: orderId })
      .orderBy('line_order', 'asc')
      .select<
        Array<{
          id: string;
          product_id: string | null;
          product_code: string | null;
          description: string;
          unit: string;
          quantity: string | number;
        }>
      >('id', 'product_id', 'product_code', 'description', 'unit', 'quantity');

    if (lines.length === 0) throw new BadRequestException('Encomenda sem linhas');

    const year = new Date(order.issue_date).getUTCFullYear();
    const fulfillmentNumber = await this.nextNumber(organizationId, year, trx);
    const id = randomUUID();
    const now = new Date();

    await trx('sales_fulfillments').insert({
      id,
      organization_id: organizationId,
      order_id: orderId,
      fulfillment_number: fulfillmentNumber,
      status: 'pending',
      priority: 'normal',
      created_by: userId,
      created_at: now,
      updated_at: now,
    });

    const itemRows = lines.map((l) => ({
      id: randomUUID(),
      organization_id: organizationId,
      fulfillment_id: id,
      order_line_id: l.id,
      product_id: l.product_id,
      product_code: l.product_code,
      description: l.description,
      unit: l.unit,
      quantity_requested: l.quantity,
      quantity_picked: 0,
      status: 'pending' as PickStatus,
      created_at: now,
      updated_at: now,
    }));
    await trx('sales_fulfillment_items').insert(itemRows);

    // Reserva stock pros produtos rastreados
    for (const l of lines) {
      if (!l.product_id) continue;
      const product = await trx('sales_products')
        .where({ id: l.product_id, organization_id: organizationId })
        .first<{ stock_track: boolean } | undefined>();
      if (!product?.stock_track) continue;
      await this.reservations.reserve(
        {
          productId: l.product_id,
          organizationId,
          quantity: Number(l.quantity),
          referenceType: 'sales_order',
          referenceId: orderId,
          userId,
          notes: `Reserva auto via ${fulfillmentNumber}`,
        },
        trx,
      );
    }

    return id;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LISTAGEM E DETALHE
  // ═══════════════════════════════════════════════════════════════════════

  async list(
    user: AuthUserPayload,
    opts: {
      status?: FulfillmentStatus;
      assignedToMe?: boolean;
      priority?: FulfillmentPriority;
    } = {},
  ) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensurePicker(role);

    return this.knex('sales_fulfillments as f')
      .innerJoin('sales_documents as d', 'f.order_id', 'd.id')
      .leftJoin('customers as c', 'd.customer_id', 'c.id')
      .leftJoin('users as u', 'f.assigned_to_user_id', 'u.id')
      .where('f.organization_id', organizationId)
      .modify((q) => {
        if (opts.status) q.andWhere('f.status', opts.status);
        if (opts.priority) q.andWhere('f.priority', opts.priority);
        if (opts.assignedToMe) q.andWhere('f.assigned_to_user_id', userId);
      })
      .select(
        'f.*',
        { order_number: 'd.doc_number' },
        { customer_name: 'c.name' },
        { customer_code: 'c.code' },
        { assignee_name: 'u.name' },
        { assignee_email: 'u.email' },
      )
      .orderByRaw(
        "CASE f.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END",
      )
      .orderBy('f.created_at', 'asc')
      .limit(200);
  }

  async getById(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensurePicker(role);

    const f = await this.knex('sales_fulfillments as f')
      .innerJoin('sales_documents as d', 'f.order_id', 'd.id')
      .leftJoin('customers as c', 'd.customer_id', 'c.id')
      .leftJoin('users as u', 'f.assigned_to_user_id', 'u.id')
      .where({ 'f.id': id, 'f.organization_id': organizationId })
      .select(
        'f.*',
        { order_number: 'd.doc_number' },
        { order_total: 'd.total' },
        { order_currency: 'd.currency' },
        { customer_id: 'c.id' },
        { customer_name: 'c.name' },
        { customer_code: 'c.code' },
        { customer_tax_id: 'c.tax_id' },
        { assignee_name: 'u.name' },
        { assignee_email: 'u.email' },
      )
      .first();
    if (!f) throw new NotFoundException('Pedido de separação não encontrado');

    const items = await this.knex('sales_fulfillment_items as i')
      .leftJoin('sales_products as p', 'i.product_id', 'p.id')
      .leftJoin('users as picker', 'i.picked_by_user_id', 'picker.id')
      .where('i.fulfillment_id', id)
      .select(
        'i.*',
        { product_name: 'p.name' },
        { product_barcode: 'p.barcode' },
        { product_stock_qty: 'p.stock_qty' },
        { picker_name: 'picker.name' },
      )
      .orderBy('i.created_at', 'asc');

    return { ...f, items };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STATE MACHINE
  // ═══════════════════════════════════════════════════════════════════════

  async assign(id: string, dto: AssignFulfillmentDto, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    return this.knex.transaction(async (trx) => {
      const f = await trx<FulfillmentRow>('sales_fulfillments')
        .where({ id, organization_id: organizationId })
        .first();
      if (!f) throw new NotFoundException('Pedido de separação não encontrado');
      if (!['pending', 'assigned'].includes(f.status))
        throw new BadRequestException('Pedido já iniciado ou finalizado');

      // Valida usuário pertence à org
      const target = await trx('users')
        .where({ id: dto.userId, organization_id: organizationId })
        .first();
      if (!target) throw new BadRequestException('Usuário inválido para esta org');

      await trx('sales_fulfillments')
        .where({ id })
        .update({
          status: 'assigned',
          assigned_to_user_id: dto.userId,
          assigned_at: new Date(),
          ...(dto.priority && { priority: dto.priority }),
          ...(dto.warehouseLocation !== undefined && {
            warehouse_location: dto.warehouseLocation ?? null,
          }),
          updated_at: new Date(),
        });
      return id;
    }).then(() => this.getById(id, user));
  }

  async update(id: string, dto: UpdateFulfillmentDto, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);
    const existing = await this.knex<FulfillmentRow>('sales_fulfillments')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Não encontrado');
    await this.knex('sales_fulfillments').where({ id }).update({
      ...(dto.priority && { priority: dto.priority }),
      ...(dto.warehouseLocation !== undefined && {
        warehouse_location: dto.warehouseLocation ?? null,
      }),
      ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
      ...(dto.internalNotes !== undefined && { internal_notes: dto.internalNotes ?? null }),
      updated_at: new Date(),
    });
    return this.getById(id, user);
  }

  async startPicking(id: string, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensurePicker(role);

    return this.knex.transaction(async (trx) => {
      const f = await trx<FulfillmentRow>('sales_fulfillments')
        .where({ id, organization_id: organizationId })
        .first();
      if (!f) throw new NotFoundException('Não encontrado');
      // Auto-assign se vazio
      if (!f.assigned_to_user_id) {
        await trx('sales_fulfillments').where({ id }).update({
          assigned_to_user_id: userId,
          assigned_at: new Date(),
        });
      } else if (f.assigned_to_user_id !== userId && !ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) {
        throw new ForbiddenException('Apenas o operador atribuído pode iniciar');
      }
      if (!['assigned', 'pending'].includes(f.status))
        throw new BadRequestException('Status inválido para iniciar separação');
      await trx('sales_fulfillments').where({ id }).update({
        status: 'picking',
        started_at: new Date(),
        updated_at: new Date(),
      });
    }).then(() => this.getById(id, user));
  }

  /**
   * Operador registra a separação de UM item.
   * Marca status individual; quando todos itens estão picked/missing/damaged,
   * o fulfillment automaticamente vai pra status='picked'.
   */
  async recordPick(
    fulfillmentId: string,
    itemId: string,
    dto: RecordPickDto,
    user: AuthUserPayload,
  ) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensurePicker(role);

    return this.knex.transaction(async (trx) => {
      const f = await trx<FulfillmentRow>('sales_fulfillments')
        .where({ id: fulfillmentId, organization_id: organizationId })
        .first();
      if (!f) throw new NotFoundException('Pedido de separação não encontrado');
      if (!['picking', 'assigned'].includes(f.status))
        throw new BadRequestException(`Não é possível separar com status ${f.status}`);

      const item = await trx<FulfillmentItemRow>('sales_fulfillment_items')
        .where({ id: itemId, fulfillment_id: fulfillmentId })
        .first();
      if (!item) throw new NotFoundException('Item não encontrado');

      const requested = Number(item.quantity_requested);
      const picked = Number(dto.quantityPicked);
      // Coerência: status 'picked' exige picked >= requested
      if (dto.status === 'picked' && picked < requested) {
        throw new BadRequestException(
          'Para status "picked" a quantidade separada deve igualar ou superar a solicitada',
        );
      }
      if (dto.status === 'partial' && (picked <= 0 || picked >= requested)) {
        throw new BadRequestException(
          'Para status "partial" a quantidade deve ser maior que 0 e menor que a solicitada',
        );
      }

      const now = new Date();
      await trx('sales_fulfillment_items').where({ id: itemId }).update({
        quantity_picked: picked,
        status: dto.status,
        lot_number: dto.lotNumber ?? null,
        serial_number: dto.serialNumber ?? null,
        bin_location: dto.binLocation ?? null,
        notes: dto.notes ?? null,
        picked_by_user_id: userId,
        picked_at: now,
        updated_at: now,
      });

      // Se ainda está 'assigned', move pra 'picking'
      if (f.status === 'assigned') {
        await trx('sales_fulfillments').where({ id: fulfillmentId }).update({
          status: 'picking',
          started_at: f.started_at ?? now,
          updated_at: now,
        });
      }

      // Se todos itens finalizados (não-pending), move fulfillment pra 'picked'
      const remaining = await trx('sales_fulfillment_items')
        .where({ fulfillment_id: fulfillmentId, status: 'pending' })
        .count<{ c: string }[]>('* as c')
        .first();
      if (Number(remaining?.c ?? 0) === 0) {
        await trx('sales_fulfillments').where({ id: fulfillmentId }).update({
          status: 'picked',
          picked_at: now,
          updated_at: now,
        });
      }
    }).then(() => this.getById(fulfillmentId, user));
  }

  async pack(id: string, dto: PackFulfillmentDto, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensurePicker(role);
    return this.knex.transaction(async (trx) => {
      const f = await trx<FulfillmentRow>('sales_fulfillments')
        .where({ id, organization_id: organizationId })
        .first();
      if (!f) throw new NotFoundException('Não encontrado');
      if (f.status !== 'picked')
        throw new BadRequestException('Só é possível embalar após separação completa');
      await trx('sales_fulfillments').where({ id }).update({
        status: 'packed',
        weight_kg: dto.weightKg ?? null,
        package_count: dto.packageCount ?? null,
        ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
        packed_at: new Date(),
        updated_at: new Date(),
      });
    }).then(() => this.getById(id, user));
  }

  /**
   * Expede o pedido. Aqui acontece o "commit" físico:
   *  1. Decrementa stock_qty dos produtos rastreados pela quantity_picked
   *  2. Marca as reservas relacionadas como 'consumed'
   *  3. Marca o sales_document.stock_committed=true
   *  4. Opcionalmente gera um documento Guia de Remessa (delivery) vinculado
   */
  async ship(id: string, dto: ShipFulfillmentDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureAdmin(role);

    return this.knex.transaction(async (trx) => {
      const f = await trx<FulfillmentRow>('sales_fulfillments')
        .where({ id, organization_id: organizationId })
        .first();
      if (!f) throw new NotFoundException('Não encontrado');
      if (!['picked', 'packed'].includes(f.status))
        throw new BadRequestException('Para expedir, status deve ser picked ou packed');

      // 1. Decrementa stock real via motor de inventário (cria stock_movement
      //    do tipo 'out' para cada item rastreado, com referência ao fulfillment).
      const items = await trx<FulfillmentItemRow>('sales_fulfillment_items')
        .where({ fulfillment_id: id })
        .whereNotNull('product_id');
      for (const it of items) {
        if (!it.product_id) continue;
        const qty = Number(it.quantity_picked);
        if (qty <= 0) continue;
        const p = await trx('sales_products')
          .where({ id: it.product_id, organization_id: organizationId })
          .first<{ stock_track: boolean; default_warehouse_id: string | null } | undefined>();
        if (!p?.stock_track) continue;

        // Resolve warehouse: produto.default_warehouse_id → org default
        let warehouseId = p.default_warehouse_id;
        if (!warehouseId) {
          const def = await trx('stock_warehouses')
            .where({ organization_id: organizationId, is_default: true, is_active: true })
            .first<{ id: string } | undefined>();
          if (!def) {
            throw new ConflictException(
              'Nenhum armazém padrão configurado — não é possível expedir',
            );
          }
          warehouseId = def.id;
        }

        await this.movements.applyMovement(
          {
            organizationId,
            productId: it.product_id,
            warehouseId,
            movementType: 'out',
            quantity: qty,
            referenceType: 'sales_fulfillment',
            referenceId: id,
            referenceNumber: f.fulfillment_number,
            lotNumber: it.lot_number,
            serialNumber: it.serial_number,
            notes: `Expedição ${f.fulfillment_number}`,
            userId,
          },
          trx,
        );
      }

      // 2. Consome reservas vinculadas a esse order
      await this.reservations.consumeByReference(
        'sales_order',
        f.order_id,
        organizationId,
        trx,
      );

      // 3. Marca documento como stock_committed
      await trx('sales_documents').where({ id: f.order_id }).update({
        stock_committed: true,
        stock_committed_at: new Date(),
        updated_at: new Date(),
      });

      // 4. Opcional: gera Guia de Remessa (delivery) — copia linhas com quantity_picked
      let deliveryDocId: string | null = null;
      if (dto.generateDeliveryDoc) {
        deliveryDocId = await this.createDeliveryDoc(
          f.order_id,
          id,
          items,
          organizationId,
          userId,
          trx,
        );
      }

      // 5. Atualiza fulfillment
      await trx('sales_fulfillments').where({ id }).update({
        status: 'shipped',
        carrier: dto.carrier ?? null,
        tracking_number: dto.trackingNumber ?? null,
        delivery_doc_id: deliveryDocId,
        shipped_at: new Date(),
        updated_at: new Date(),
      });
    }).then(() => this.getById(id, user));
  }

  /**
   * Cria documento Guia de Remessa (delivery) a partir do fulfillment.
   * Linhas usam quantity_picked (não requested) — reflete o que realmente saiu.
   */
  private async createDeliveryDoc(
    orderId: string,
    fulfillmentId: string,
    items: FulfillmentItemRow[],
    organizationId: string,
    userId: string,
    trx: Knex.Transaction,
  ): Promise<string> {
    const order = await trx('sales_documents')
      .where({ id: orderId })
      .first<{
        customer_id: string;
        price_list_id: string | null;
        currency: string;
        exchange_rate: string | number;
        assigned_user_id: string | null;
      }>();
    if (!order) throw new BadRequestException('Encomenda não encontrada para Guia');

    // Reusa numeração do módulo de documentos (mesma lógica)
    const year = new Date().getUTCFullYear();
    let numRow = await trx('sales_document_numbering')
      .where({ organization_id: organizationId, doc_type: 'delivery', year })
      .forUpdate()
      .first<{ id: string; last_number: number; prefix: string }>();
    if (!numRow) {
      const nid = randomUUID();
      await trx('sales_document_numbering').insert({
        id: nid,
        organization_id: organizationId,
        doc_type: 'delivery',
        prefix: 'GR',
        year,
        last_number: 0,
      });
      numRow = await trx('sales_document_numbering')
        .where({ id: nid })
        .forUpdate()
        .first<{ id: string; last_number: number; prefix: string }>();
      if (!numRow) throw new Error('Falha no contador de GR');
    }
    const nextNum = numRow.last_number + 1;
    await trx('sales_document_numbering').where({ id: numRow.id }).update({
      last_number: nextNum,
      updated_at: new Date(),
    });
    const docNumber = `${numRow.prefix}-${year}-${String(nextNum).padStart(4, '0')}`;

    // Recupera linhas originais pra preservar preço/imposto
    const orderLines = await trx('sales_document_lines')
      .where({ document_id: orderId })
      .select<
        Array<{
          id: string;
          line_order: number;
          product_id: string | null;
          product_code: string | null;
          description: string;
          unit: string;
          unit_price: string | number;
          discount_pct: string | number;
          tax_rate_id: string | null;
          tax_rate_pct: string | number;
        }>
      >('*');
    const orderLineMap = new Map(orderLines.map((l) => [l.id, l]));

    const newDocId = randomUUID();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Calcula totais com base nas quantidades realmente picked
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    let total = 0;
    const lineRows: Array<Record<string, unknown>> = [];
    let lineOrder = 1;
    for (const it of items) {
      const orig = it.order_line_id ? orderLineMap.get(it.order_line_id) : undefined;
      const qty = Number(it.quantity_picked);
      if (qty <= 0) continue;
      const price = Number(orig?.unit_price ?? 0);
      const discPct = Number(orig?.discount_pct ?? 0);
      const taxPct = Number(orig?.tax_rate_pct ?? 0);
      const sub = Math.round(qty * price * 10000) / 10000;
      const disc = Math.round(((sub * discPct) / 100) * 10000) / 10000;
      const taxable = sub - disc;
      const taxAmt = Math.round(((taxable * taxPct) / 100) * 10000) / 10000;
      const lt = Math.round((taxable + taxAmt) * 10000) / 10000;
      subtotal += sub;
      discount += disc;
      tax += taxAmt;
      total += lt;
      lineRows.push({
        id: randomUUID(),
        organization_id: organizationId,
        document_id: newDocId,
        line_order: lineOrder++,
        product_id: it.product_id,
        product_code: it.product_code,
        description: it.description,
        unit: it.unit,
        quantity: qty,
        unit_price: price,
        discount_pct: discPct,
        tax_rate_id: orig?.tax_rate_id ?? null,
        tax_rate_pct: taxPct,
        subtotal: sub,
        discount_amount: disc,
        tax_amount: taxAmt,
        line_total: lt,
        notes: null,
        created_at: now,
        updated_at: now,
      });
    }

    await trx('sales_documents').insert({
      id: newDocId,
      organization_id: organizationId,
      doc_number: docNumber,
      doc_type: 'delivery',
      status: 'sent',
      customer_id: order.customer_id,
      price_list_id: order.price_list_id,
      issue_date: today,
      currency: order.currency,
      exchange_rate: order.exchange_rate,
      subtotal,
      total_discount: discount,
      total_tax: tax,
      total,
      amount_paid: 0,
      converted_from_id: orderId,
      stock_committed: true,
      stock_committed_at: now,
      assigned_user_id: order.assigned_user_id,
      created_by: userId,
      issued_at: now,
      created_at: now,
      updated_at: now,
      notes: `Guia gerada via separação ${fulfillmentId}`,
    });

    if (lineRows.length) await trx('sales_document_lines').insert(lineRows);

    return newDocId;
  }

  async cancel(id: string, dto: CancelFulfillmentDto, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    return this.knex.transaction(async (trx) => {
      const f = await trx<FulfillmentRow>('sales_fulfillments')
        .where({ id, organization_id: organizationId })
        .first();
      if (!f) throw new NotFoundException('Não encontrado');
      if (['shipped', 'delivered', 'cancelled'].includes(f.status))
        throw new BadRequestException('Não é possível cancelar após expedição');

      await trx('sales_fulfillments').where({ id }).update({
        status: 'cancelled',
        cancelled_at: new Date(),
        internal_notes: dto.reason ?? null,
        updated_at: new Date(),
      });

      // Libera reservas se eram desta order e não há outro fulfillment ativo
      const otherActive = await trx('sales_fulfillments')
        .where({ organization_id: organizationId, order_id: f.order_id })
        .whereNotIn('status', ['cancelled', 'shipped', 'delivered'])
        .whereNot({ id })
        .first();
      if (!otherActive) {
        await this.reservations.releaseByReference(
          'sales_order',
          f.order_id,
          organizationId,
          trx,
        );
      }
    }).then(() => this.getById(id, user));
  }
}
