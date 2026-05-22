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
import {
  AddTransferItemDto,
  CreateAdjustmentDto,
  CreateTransferDto,
  MovementType,
} from './dtos/movement.dto';
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

const ADMIN_ROLES = ['master', 'admin', 'manager'] as const;
const OPERATOR_ROLES = [...ADMIN_ROLES, 'employee', 'sales'] as const;
const READ_ROLES = [...OPERATOR_ROLES, 'sdr', 'accountant'] as const;

/** Sinal de cada tipo de movimento no balanço. */
const MOVEMENT_SIGN: Record<MovementType, 1 | -1> = {
  in: 1,
  out: -1,
  transfer_in: 1,
  transfer_out: -1,
  adjustment_positive: 1,
  adjustment_negative: -1,
  inventory_count: 1, // sinal específico tratado caso a caso
  opening: 1,
};

export interface StockMovementRow {
  id: string;
  organization_id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: MovementType;
  quantity: string | number;
  unit_cost: string | number | null;
  balance_after: string | number;
  reference_type: string;
  reference_id: string | null;
  reference_number: string | null;
  lot_number: string | null;
  serial_number: string | null;
  notes: string | null;
  created_by: string | null;
  movement_date: Date;
  created_at: Date;
}

export interface BalanceRow {
  id: string;
  organization_id: string;
  product_id: string;
  warehouse_id: string;
  quantity: string | number;
  avg_cost: string | number;
  updated_at: Date;
}

/**
 * Engine central de inventário. TODA alteração de quantidade passa por aqui
 * via `applyMovement` — garante:
 *   1. Movimento imutável registrado em stock_movements
 *   2. Balanço atualizado em stock_warehouse_balances
 *   3. Custo médio ponderado recalculado em entradas
 *   4. Snapshot agregado em sales_products.stock_qty (compatibilidade)
 *
 * Métodos públicos para outros módulos (Sales, Purchases) usarem:
 *   - applyMovement(input, trx) — chamado dentro de transação do caller
 *   - createAdjustment(dto) — ajuste manual com nova transação
 *   - transfer(dto, items) — transferência entre armazéns
 *   - listMovements(filters) — extrato
 *   - getBalance(productId, warehouseId)
 *   - getAggregatedBalance(productId) — soma todos warehouses
 */
@Injectable()
export class StockMovementsService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
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
  private ensureOperator(role: string) {
    if (!OPERATOR_ROLES.includes(role as (typeof OPERATOR_ROLES)[number]))
      throw new ForbiddenException('Sem permissão de inventário');
  }
  private ensureAdmin(role: string) {
    if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]))
      throw new ForbiddenException('Sem permissão administrativa de inventário');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar inventário');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CORE: applyMovement — chamado por outros módulos dentro de uma trx
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Aplica um movimento de stock atomicamente. Retorna o movimento criado +
   * novo balance. Caller fornece a transação (encadeamento com outras
   * operações relacionadas, ex.: SalesFulfillments.ship).
   *
   * Importante: NÃO valida permissão (caller é responsável). Apenas integridade.
   */
  async applyMovement(
    input: {
      organizationId: string;
      productId: string;
      warehouseId: string;
      movementType: MovementType;
      /** Sempre positiva, sinal vem do movement_type ou sinalDelta */
      quantity: number;
      /** Override do sinal padrão (usado em 'inventory_count' que pode ser +/-) */
      signOverride?: 1 | -1;
      unitCost?: number | null;
      referenceType: string;
      referenceId?: string | null;
      referenceNumber?: string | null;
      lotNumber?: string | null;
      serialNumber?: string | null;
      notes?: string | null;
      userId?: string | null;
      movementDate?: Date;
      /**
       * Se true, permite balance negativo (back-order). Default: false (lança erro).
       * Movimentos de ajuste/contagem sempre permitem.
       */
      allowNegative?: boolean;
    },
    trx: Knex.Transaction,
  ): Promise<{ movement: StockMovementRow; newBalance: number; newAvgCost: number }> {
    // Lock balance row (ou cria se não existe) — FOR UPDATE
    let balance = await trx<BalanceRow>('stock_warehouse_balances')
      .where({ product_id: input.productId, warehouse_id: input.warehouseId })
      .forUpdate()
      .first();

    const now = input.movementDate ?? new Date();
    const qty = Math.abs(Number(input.quantity));
    if (qty === 0) throw new BadRequestException('Quantidade não pode ser zero');

    const sign =
      input.signOverride ??
      MOVEMENT_SIGN[input.movementType] ??
      (() => {
        throw new BadRequestException('Tipo de movimento inválido');
      })();

    const currentQty = balance ? Number(balance.quantity) : 0;
    const currentAvgCost = balance ? Number(balance.avg_cost) : 0;
    const newQty = currentQty + sign * qty;

    const allowNeg =
      input.allowNegative ??
      ['adjustment_negative', 'adjustment_positive', 'inventory_count', 'opening'].includes(
        input.movementType,
      );
    if (newQty < 0 && !allowNeg) {
      throw new ConflictException(
        `Stock insuficiente no armazém ${input.warehouseId} para produto ${input.productId}: ${currentQty} disponível, ${qty} solicitado`,
      );
    }

    // Recalcula custo médio ponderado APENAS em entradas com unit_cost informado
    let newAvgCost = currentAvgCost;
    if (sign > 0 && input.unitCost != null && input.unitCost >= 0 && newQty > 0) {
      const incomingValue = qty * Number(input.unitCost);
      const currentValue = currentQty * currentAvgCost;
      newAvgCost = (currentValue + incomingValue) / newQty;
      newAvgCost = Math.round(newAvgCost * 10000) / 10000;
    }

    // Upsert balance
    if (balance) {
      await trx('stock_warehouse_balances').where({ id: balance.id }).update({
        quantity: newQty,
        avg_cost: newAvgCost,
        updated_at: now,
      });
    } else {
      await trx('stock_warehouse_balances').insert({
        id: randomUUID(),
        organization_id: input.organizationId,
        product_id: input.productId,
        warehouse_id: input.warehouseId,
        quantity: newQty,
        avg_cost: newAvgCost,
        updated_at: now,
      });
    }

    // Insere movimento
    const movementId = randomUUID();
    await trx('stock_movements').insert({
      id: movementId,
      organization_id: input.organizationId,
      product_id: input.productId,
      warehouse_id: input.warehouseId,
      movement_type: input.movementType,
      quantity: qty,
      unit_cost: input.unitCost ?? null,
      balance_after: newQty,
      reference_type: input.referenceType,
      reference_id: input.referenceId ?? null,
      reference_number: input.referenceNumber ?? null,
      lot_number: input.lotNumber ?? null,
      serial_number: input.serialNumber ?? null,
      notes: input.notes ?? null,
      created_by: input.userId ?? null,
      movement_date: now,
      created_at: now,
    });

    // Atualiza agregado em sales_products.stock_qty (soma de TODOS warehouses)
    // Mantém compatibilidade com queries antigas + UI que mostra stock total.
    const total = await trx('stock_warehouse_balances')
      .where({ organization_id: input.organizationId, product_id: input.productId })
      .sum<{ total: string | null }[]>('quantity as total')
      .first();
    await trx('sales_products').where({ id: input.productId }).update({
      stock_qty: Number(total?.total ?? 0),
      updated_at: now,
    });

    const movement = (await trx<StockMovementRow>('stock_movements')
      .where({ id: movementId })
      .first()) as StockMovementRow;

    return { movement, newBalance: newQty, newAvgCost };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AJUSTES MANUAIS (perdas, sobras avulsas)
  // ═══════════════════════════════════════════════════════════════════════

  async createAdjustment(
    dto: CreateAdjustmentDto,
    user: AuthUserPayload,
  ): Promise<StockMovementRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureAdmin(role);
    if (dto.delta === 0) throw new BadRequestException('Delta não pode ser zero');

    const movementType: MovementType =
      dto.delta > 0 ? 'adjustment_positive' : 'adjustment_negative';

    return this.knex.transaction(async (trx) => {
      const { movement, newAvgCost } = await this.applyMovement(
        {
          organizationId,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          movementType,
          quantity: Math.abs(dto.delta),
          unitCost: dto.unitCost ?? null,
          referenceType: 'manual_adjustment',
          notes: dto.reason,
          userId,
        },
        trx,
      );

      // Lançamento contábil automático do ajuste (valorizado a custo)
      const unitValue = dto.unitCost ?? Number(newAvgCost ?? 0);
      const totalValue = Math.round(Math.abs(dto.delta) * unitValue * 100) / 100;
      if (totalValue > 0) {
        await this.autoJournal.generate(
          {
            organizationId,
            userId,
            eventType: dto.delta > 0 ? 'stock_adjustment_in' : 'stock_adjustment_out',
            referenceType: 'stock_movement',
            referenceId: movement.id,
            description: `Ajuste de estoque — ${dto.reason}`,
            entryDate: new Date(),
            amounts: { total: totalValue },
          },
          trx,
        );
      }

      return movement;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TRANSFERÊNCIAS ENTRE ARMAZÉNS
  // ═══════════════════════════════════════════════════════════════════════

  async createTransfer(dto: CreateTransferDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureOperator(role);

    if (dto.warehouseFromId === dto.warehouseToId)
      throw new BadRequestException('Armazém de origem e destino devem ser diferentes');

    // Valida ambos os armazéns
    const wcount = await this.knex('stock_warehouses')
      .whereIn('id', [dto.warehouseFromId, dto.warehouseToId])
      .andWhere({ organization_id: organizationId })
      .count<{ c: string }[]>('* as c')
      .first();
    if (Number(wcount?.c ?? 0) !== 2) throw new BadRequestException('Armazém inválido');

    return this.knex.transaction(async (trx) => {
      const year = new Date(dto.transferDate).getUTCFullYear();
      const last = await trx('stock_transfers')
        .where({ organization_id: organizationId })
        .andWhereRaw("EXTRACT(YEAR FROM transfer_date) = ?", [year])
        .orderBy('created_at', 'desc')
        .first<{ transfer_number: string } | undefined>();
      let nextNum = 1;
      if (last?.transfer_number) {
        const m = /(\d+)$/.exec(last.transfer_number);
        if (m) nextNum = Number(m[1]) + 1;
      }
      const transferNumber = `TRF-${year}-${String(nextNum).padStart(4, '0')}`;

      const id = randomUUID();
      const now = new Date();
      await trx('stock_transfers').insert({
        id,
        organization_id: organizationId,
        transfer_number: transferNumber,
        warehouse_from_id: dto.warehouseFromId,
        warehouse_to_id: dto.warehouseToId,
        status: 'draft',
        transfer_date: dto.transferDate,
        notes: dto.notes ?? null,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });

      return (await trx('stock_transfers').where({ id }).first()) as Record<string, unknown>;
    });
  }

  async addTransferItem(transferId: string, dto: AddTransferItemDto, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureOperator(role);

    const transfer = await this.knex('stock_transfers')
      .where({ id: transferId, organization_id: organizationId })
      .first<{ status: string } | undefined>();
    if (!transfer) throw new NotFoundException('Transferência não encontrada');
    if (transfer.status !== 'draft')
      throw new BadRequestException('Apenas transferências em rascunho aceitam novos itens');

    const id = randomUUID();
    await this.knex('stock_transfer_items')
      .insert({
        id,
        organization_id: organizationId,
        transfer_id: transferId,
        product_id: dto.productId,
        quantity: dto.quantity,
        notes: dto.notes ?? null,
        created_at: new Date(),
      })
      .onConflict(['transfer_id', 'product_id'])
      .merge({ quantity: dto.quantity, notes: dto.notes ?? null });
    return this.getTransfer(transferId, user);
  }

  async getTransfer(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const t = await this.knex('stock_transfers as t')
      .leftJoin('stock_warehouses as wf', 't.warehouse_from_id', 'wf.id')
      .leftJoin('stock_warehouses as wt', 't.warehouse_to_id', 'wt.id')
      .where({ 't.id': id, 't.organization_id': organizationId })
      .select(
        't.*',
        { warehouse_from_name: 'wf.name' },
        { warehouse_to_name: 'wt.name' },
      )
      .first();
    if (!t) throw new NotFoundException('Transferência não encontrada');

    const items = await this.knex('stock_transfer_items as i')
      .leftJoin('sales_products as p', 'i.product_id', 'p.id')
      .where('i.transfer_id', id)
      .select(
        'i.*',
        { product_name: 'p.name' },
        { product_code: 'p.code' },
        { product_unit: 'p.unit' },
      );

    return { ...t, items };
  }

  async listTransfers(user: AuthUserPayload, status?: string) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    return this.knex('stock_transfers as t')
      .leftJoin('stock_warehouses as wf', 't.warehouse_from_id', 'wf.id')
      .leftJoin('stock_warehouses as wt', 't.warehouse_to_id', 'wt.id')
      .where('t.organization_id', organizationId)
      .modify((q) => {
        if (status) q.andWhere('t.status', status);
      })
      .select(
        't.*',
        { warehouse_from_name: 'wf.name' },
        { warehouse_to_name: 'wt.name' },
      )
      .orderBy('t.transfer_date', 'desc')
      .limit(200);
  }

  /**
   * Confirma transferência: gera 2 movimentos por item (out na origem,
   * in no destino), preserva custo médio do produto na origem.
   */
  async confirmTransfer(id: string, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureOperator(role);

    return this.knex.transaction(async (trx) => {
      const t = await trx('stock_transfers')
        .where({ id, organization_id: organizationId })
        .forUpdate()
        .first<{
          id: string;
          warehouse_from_id: string;
          warehouse_to_id: string;
          status: string;
          transfer_number: string;
        }>();
      if (!t) throw new NotFoundException('Transferência não encontrada');
      if (t.status !== 'draft') throw new BadRequestException('Já confirmada ou cancelada');

      const items = await trx('stock_transfer_items')
        .where({ transfer_id: id })
        .select<Array<{ product_id: string; quantity: string | number; notes: string | null }>>(
          'product_id',
          'quantity',
          'notes',
        );
      if (items.length === 0) throw new BadRequestException('Transferência sem itens');

      for (const it of items) {
        const qty = Number(it.quantity);
        // Pega custo médio na origem para preservar valorização
        const originBalance = await trx('stock_warehouse_balances')
          .where({ product_id: it.product_id, warehouse_id: t.warehouse_from_id })
          .first<{ avg_cost: string | number } | undefined>();
        const unitCost = Number(originBalance?.avg_cost ?? 0);

        await this.applyMovement(
          {
            organizationId,
            productId: it.product_id,
            warehouseId: t.warehouse_from_id,
            movementType: 'transfer_out',
            quantity: qty,
            unitCost,
            referenceType: 'stock_transfer',
            referenceId: id,
            referenceNumber: t.transfer_number,
            notes: it.notes,
            userId,
          },
          trx,
        );
        await this.applyMovement(
          {
            organizationId,
            productId: it.product_id,
            warehouseId: t.warehouse_to_id,
            movementType: 'transfer_in',
            quantity: qty,
            unitCost,
            referenceType: 'stock_transfer',
            referenceId: id,
            referenceNumber: t.transfer_number,
            notes: it.notes,
            userId,
          },
          trx,
        );
      }

      await trx('stock_transfers').where({ id }).update({
        status: 'confirmed',
        confirmed_at: new Date(),
        updated_at: new Date(),
      });
    }).then(() => this.getTransfer(id, user));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONSULTAS
  // ═══════════════════════════════════════════════════════════════════════

  /** Extrato de movimentos com filtros. Default: últimos 200 do produto. */
  async listMovements(
    user: AuthUserPayload,
    opts: {
      productId?: string;
      warehouseId?: string;
      from?: string;
      to?: string;
      movementType?: MovementType;
      limit?: number;
    } = {},
  ) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    return this.knex('stock_movements as m')
      .leftJoin('sales_products as p', 'm.product_id', 'p.id')
      .leftJoin('stock_warehouses as w', 'm.warehouse_id', 'w.id')
      .leftJoin('users as u', 'm.created_by', 'u.id')
      .where('m.organization_id', organizationId)
      .modify((q) => {
        if (opts.productId) q.andWhere('m.product_id', opts.productId);
        if (opts.warehouseId) q.andWhere('m.warehouse_id', opts.warehouseId);
        if (opts.movementType) q.andWhere('m.movement_type', opts.movementType);
        if (opts.from) q.andWhere('m.movement_date', '>=', opts.from);
        if (opts.to) q.andWhere('m.movement_date', '<=', opts.to);
      })
      .select(
        'm.*',
        { product_name: 'p.name' },
        { product_code: 'p.code' },
        { product_unit: 'p.unit' },
        { warehouse_name: 'w.name' },
        { warehouse_code: 'w.code' },
        { user_name: 'u.name' },
      )
      .orderBy('m.movement_date', 'desc')
      .orderBy('m.created_at', 'desc')
      .limit(opts.limit ?? 200);
  }

  async getBalance(productId: string, warehouseId: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    const row = await this.knex<BalanceRow>('stock_warehouse_balances')
      .where({ organization_id: organizationId, product_id: productId, warehouse_id: warehouseId })
      .first();
    return {
      productId,
      warehouseId,
      quantity: Number(row?.quantity ?? 0),
      avgCost: Number(row?.avg_cost ?? 0),
    };
  }

  /** Saldo agregado por produto em todos os armazéns. */
  async getAggregatedBalance(productId: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    const rows = await this.knex('stock_warehouse_balances as b')
      .leftJoin('stock_warehouses as w', 'b.warehouse_id', 'w.id')
      .where('b.organization_id', organizationId)
      .andWhere('b.product_id', productId)
      .select(
        'b.warehouse_id',
        'b.quantity',
        'b.avg_cost',
        { warehouse_name: 'w.name' },
        { warehouse_code: 'w.code' },
      );
    const total = rows.reduce((s, r) => s + Number(r.quantity), 0);
    return {
      productId,
      total,
      byWarehouse: rows.map((r) => ({
        warehouseId: (r as { warehouse_id: string }).warehouse_id,
        warehouseName: (r as { warehouse_name: string | null }).warehouse_name,
        warehouseCode: (r as { warehouse_code: string | null }).warehouse_code,
        quantity: Number((r as { quantity: string | number }).quantity),
        avgCost: Number((r as { avg_cost: string | number }).avg_cost),
      })),
    };
  }
}
