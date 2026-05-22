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
import { CountStatus, CountType, CreateCountDto, RecordCountDto } from './dtos/count.dto';
import { StockMovementsService } from '../movements/movements.service';

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

export interface InventoryCountRow {
  id: string;
  organization_id: string;
  warehouse_id: string;
  count_number: string;
  name: string;
  status: CountStatus;
  count_type: CountType;
  category_filter: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  closed_at: Date | null;
}

export interface InventoryCountItemRow {
  id: string;
  organization_id: string;
  count_id: string;
  product_id: string;
  expected_quantity: string | number;
  counted_quantity: string | number | null;
  difference: string | number | null;
  notes: string | null;
  counted_by_user_id: string | null;
  counted_at: Date | null;
}

/**
 * Contagem física cíclica do armazém.
 *
 * Fluxo:
 *   1. Admin abre contagem (status='open') → sistema fotografa os balances
 *      atuais de todos produtos do warehouse (snapshot em expected_quantity)
 *   2. Operadores entram em cada item, registram counted_quantity
 *   3. Sistema calcula difference = counted - expected
 *   4. Admin fecha contagem (status='closed') → para cada item com diferença,
 *      gera um movimento 'inventory_count' que ajusta o balance
 */
@Injectable()
export class InventoryCountsService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
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
      throw new ForbiddenException('Sem permissão administrativa');
  }
  private ensureOperator(role: string) {
    if (!OPERATOR_ROLES.includes(role as (typeof OPERATOR_ROLES)[number]))
      throw new ForbiddenException('Sem permissão de inventário');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar');
  }

  async list(user: AuthUserPayload, status?: CountStatus) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    return this.knex('stock_inventory_counts as c')
      .leftJoin('stock_warehouses as w', 'c.warehouse_id', 'w.id')
      .where('c.organization_id', organizationId)
      .modify((q) => {
        if (status) q.andWhere('c.status', status);
      })
      .select(
        'c.*',
        { warehouse_name: 'w.name' },
        { warehouse_code: 'w.code' },
      )
      .orderBy('c.created_at', 'desc')
      .limit(200);
  }

  async getById(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    const c = await this.knex('stock_inventory_counts as c')
      .leftJoin('stock_warehouses as w', 'c.warehouse_id', 'w.id')
      .where({ 'c.id': id, 'c.organization_id': organizationId })
      .select('c.*', { warehouse_name: 'w.name' }, { warehouse_code: 'w.code' })
      .first();
    if (!c) throw new NotFoundException('Contagem não encontrada');

    const items = await this.knex('stock_inventory_count_items as i')
      .leftJoin('sales_products as p', 'i.product_id', 'p.id')
      .leftJoin('users as u', 'i.counted_by_user_id', 'u.id')
      .where('i.count_id', id)
      .select(
        'i.*',
        { product_name: 'p.name' },
        { product_code: 'p.code' },
        { product_unit: 'p.unit' },
        { counter_name: 'u.name' },
      )
      .orderBy('p.name', 'asc');

    return { ...c, items };
  }

  async create(dto: CreateCountDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureAdmin(role);

    return this.knex.transaction(async (trx) => {
      const warehouse = await trx('stock_warehouses')
        .where({ id: dto.warehouseId, organization_id: organizationId })
        .first();
      if (!warehouse) throw new BadRequestException('Armazém inválido');

      // Gera número
      const year = new Date().getUTCFullYear();
      const last = await trx('stock_inventory_counts')
        .where({ organization_id: organizationId })
        .andWhereRaw('EXTRACT(YEAR FROM created_at) = ?', [year])
        .orderBy('created_at', 'desc')
        .first<{ count_number: string } | undefined>();
      let nextNum = 1;
      if (last?.count_number) {
        const m = /(\d+)$/.exec(last.count_number);
        if (m) nextNum = Number(m[1]) + 1;
      }
      const countNumber = `INV-${year}-${String(nextNum).padStart(4, '0')}`;

      const id = randomUUID();
      const now = new Date();
      await trx('stock_inventory_counts').insert({
        id,
        organization_id: organizationId,
        warehouse_id: dto.warehouseId,
        count_number: countNumber,
        name: dto.name,
        status: 'open',
        count_type: dto.countType ?? 'full',
        category_filter: dto.categoryFilter ?? null,
        notes: dto.notes ?? null,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });

      // Snapshot dos balances → cria items
      const balancesQuery = trx('stock_warehouse_balances as b')
        .innerJoin('sales_products as p', 'b.product_id', 'p.id')
        .where('b.organization_id', organizationId)
        .andWhere('b.warehouse_id', dto.warehouseId)
        .andWhere('p.is_active', true);
      if (dto.categoryFilter) balancesQuery.andWhere('p.category', dto.categoryFilter);
      const balances = await balancesQuery.select<
        Array<{ product_id: string; quantity: string | number }>
      >('b.product_id', 'b.quantity');

      if (balances.length === 0) {
        // Permite contagem mesmo sem balances (operador pode adicionar produtos)
        return id;
      }

      const itemRows = balances.map((b) => ({
        id: randomUUID(),
        organization_id: organizationId,
        count_id: id,
        product_id: b.product_id,
        expected_quantity: Number(b.quantity),
        created_at: now,
      }));
      await trx('stock_inventory_count_items').insert(itemRows);

      return id;
    }).then((id) => this.getById(id, user));
  }

  async recordItemCount(
    countId: string,
    itemId: string,
    dto: RecordCountDto,
    user: AuthUserPayload,
  ) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureOperator(role);

    const count = await this.knex('stock_inventory_counts')
      .where({ id: countId, organization_id: organizationId })
      .first<{ status: string } | undefined>();
    if (!count) throw new NotFoundException('Contagem não encontrada');
    if (!['open', 'counting'].includes(count.status))
      throw new BadRequestException('Contagem já fechada');

    const item = await this.knex<InventoryCountItemRow>('stock_inventory_count_items')
      .where({ id: itemId, count_id: countId })
      .first();
    if (!item) throw new NotFoundException('Item não encontrado');

    const expected = Number(item.expected_quantity);
    const counted = Number(dto.countedQuantity);
    const difference = counted - expected;

    const now = new Date();
    await this.knex('stock_inventory_count_items').where({ id: itemId }).update({
      counted_quantity: counted,
      difference,
      notes: dto.notes ?? null,
      counted_by_user_id: userId,
      counted_at: now,
    });

    // Se ainda está 'open' → muda pra 'counting'
    if (count.status === 'open') {
      await this.knex('stock_inventory_counts').where({ id: countId }).update({
        status: 'counting',
        updated_at: now,
      });
    }

    return this.getById(countId, user);
  }

  /**
   * Fecha a contagem: para cada item com counted_quantity definida e
   * difference != 0, gera um stock_movement do tipo 'inventory_count'
   * que ajusta o balance pra bater com a contagem.
   *
   * Items não contados são ignorados (mantém balance atual).
   */
  async close(countId: string, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureAdmin(role);

    return this.knex.transaction(async (trx) => {
      const count = await trx('stock_inventory_counts')
        .where({ id: countId, organization_id: organizationId })
        .forUpdate()
        .first<{ id: string; status: string; warehouse_id: string; count_number: string }>();
      if (!count) throw new NotFoundException('Contagem não encontrada');
      if (!['open', 'counting'].includes(count.status))
        throw new BadRequestException('Contagem já fechada ou cancelada');

      const items = await trx<InventoryCountItemRow>('stock_inventory_count_items')
        .where({ count_id: countId })
        .whereNotNull('counted_quantity');

      let adjustments = 0;
      for (const item of items) {
        const diff = Number(item.difference ?? 0);
        if (diff === 0) continue;
        const sign: 1 | -1 = diff > 0 ? 1 : -1;
        await this.movements.applyMovement(
          {
            organizationId,
            productId: item.product_id,
            warehouseId: count.warehouse_id,
            movementType: 'inventory_count',
            quantity: Math.abs(diff),
            signOverride: sign,
            referenceType: 'inventory_count',
            referenceId: countId,
            referenceNumber: count.count_number,
            notes: `Ajuste de contagem ${count.count_number}: esperado=${item.expected_quantity}, contado=${item.counted_quantity}`,
            userId,
          },
          trx,
        );
        adjustments++;
      }

      const now = new Date();
      await trx('stock_inventory_counts').where({ id: countId }).update({
        status: 'closed',
        closed_at: now,
        updated_at: now,
      });

      return { id: countId, adjustments };
    }).then(async (r) => {
      const detail = await this.getById(r.id, user);
      return { ...detail, _adjustments: r.adjustments };
    });
  }

  async cancel(countId: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);
    const existing = await this.knex('stock_inventory_counts')
      .where({ id: countId, organization_id: organizationId })
      .first<{ status: string } | undefined>();
    if (!existing) throw new NotFoundException('Não encontrada');
    if (existing.status === 'closed') throw new BadRequestException('Contagem já fechada');
    await this.knex('stock_inventory_counts').where({ id: countId }).update({
      status: 'cancelled',
      updated_at: new Date(),
    });
    return this.getById(countId, user);
  }
}
