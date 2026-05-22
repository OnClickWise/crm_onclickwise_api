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
  CreatePriceListDto,
  UpdatePriceListDto,
  UpsertPriceListItemDto,
} from './dtos/price-list.dto';

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

export interface PriceListRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  currency: string;
  is_default: boolean;
  is_active: boolean;
  valid_from: Date | string | null;
  valid_to: Date | string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PriceListItemRow {
  id: string;
  organization_id: string;
  price_list_id: string;
  product_id: string;
  price: string | number;
  discount_pct: string | number;
  min_quantity: string | number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Tabelas de preço: agrupam preços diferenciados (Atacado, VIP, Promo Q2…).
 * - Cada org pode ter várias tabelas; apenas uma `is_default`.
 * - Itens: preço específico por produto + quantidade mínima (atacado a partir de N un.).
 */
@Injectable()
export class SalesPriceListsService {
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
      throw new ForbiddenException('Sem permissão para gerenciar tabelas de preço');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar tabelas de preço');
  }

  async list(
    user: AuthUserPayload,
    opts: { activeOnly?: boolean } = {},
  ): Promise<Array<PriceListRow & { item_count: number }>> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const rows = await this.knex<PriceListRow>('sales_price_lists')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (opts.activeOnly ?? true) q.andWhere({ is_active: true });
      })
      .orderBy([
        { column: 'is_default', order: 'desc' },
        { column: 'name', order: 'asc' },
      ]);

    if (rows.length === 0) return [];

    const counts = await this.knex('sales_price_list_items')
      .whereIn(
        'price_list_id',
        rows.map((r) => r.id),
      )
      .groupBy('price_list_id')
      .select('price_list_id')
      .count<{ price_list_id: string; count: string }[]>('* as count');
    const map = new Map(counts.map((c) => [c.price_list_id, Number(c.count)]));

    return rows.map((r) => ({ ...r, item_count: map.get(r.id) ?? 0 }));
  }

  async getById(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const row = await this.knex<PriceListRow>('sales_price_lists')
      .where({ id, organization_id: organizationId })
      .first();
    if (!row) throw new NotFoundException('Tabela de preços não encontrada');

    const items = await this.knex('sales_price_list_items as i')
      .leftJoin('sales_products as p', 'i.product_id', 'p.id')
      .where('i.price_list_id', id)
      .select(
        'i.*',
        { product_name: 'p.name' },
        { product_code: 'p.code' },
        { product_unit: 'p.unit' },
        { product_default_price: 'p.price_sale' },
      )
      .orderBy('p.name', 'asc');

    return { ...row, items };
  }

  async create(dto: CreatePriceListDto, user: AuthUserPayload): Promise<PriceListRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    const existing = await this.knex('sales_price_lists')
      .where({ organization_id: organizationId, name: dto.name })
      .first();
    if (existing) throw new ConflictException('Já existe uma tabela com este nome');

    return this.knex.transaction(async (trx) => {
      if (dto.isDefault) {
        await trx('sales_price_lists')
          .where({ organization_id: organizationId, is_default: true })
          .update({ is_default: false });
      }

      const id = randomUUID();
      const now = new Date();
      await trx('sales_price_lists').insert({
        id,
        organization_id: organizationId,
        name: dto.name,
        description: dto.description ?? null,
        currency: dto.currency ?? 'BRL',
        is_default: dto.isDefault ?? false,
        is_active: dto.isActive ?? true,
        valid_from: dto.validFrom ?? null,
        valid_to: dto.validTo ?? null,
        created_at: now,
        updated_at: now,
      });
      return (await trx<PriceListRow>('sales_price_lists').where({ id }).first()) as PriceListRow;
    });
  }

  async update(id: string, dto: UpdatePriceListDto, user: AuthUserPayload): Promise<PriceListRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    return this.knex.transaction(async (trx) => {
      const existing = await trx<PriceListRow>('sales_price_lists')
        .where({ id, organization_id: organizationId })
        .first();
      if (!existing) throw new NotFoundException('Tabela de preços não encontrada');

      if (dto.isDefault) {
        await trx('sales_price_lists')
          .where({ organization_id: organizationId, is_default: true })
          .whereNot({ id })
          .update({ is_default: false });
      }

      await trx('sales_price_lists')
        .where({ id })
        .update({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description ?? null }),
          ...(dto.currency !== undefined && { currency: dto.currency }),
          ...(dto.isDefault !== undefined && { is_default: dto.isDefault }),
          ...(dto.isActive !== undefined && { is_active: dto.isActive }),
          ...(dto.validFrom !== undefined && { valid_from: dto.validFrom ?? null }),
          ...(dto.validTo !== undefined && { valid_to: dto.validTo ?? null }),
          updated_at: new Date(),
        });
      return (await trx<PriceListRow>('sales_price_lists').where({ id }).first()) as PriceListRow;
    });
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const inUse = await this.knex('sales_documents')
      .where({ organization_id: organizationId, price_list_id: id })
      .first();
    if (inUse) {
      // Soft-deactivate
      await this.knex('sales_price_lists').where({ id }).update({ is_active: false });
      return { success: true };
    }
    const deleted = await this.knex('sales_price_lists')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Tabela não encontrada');
    return { success: true };
  }

  // ─── Items ─────────────────────────────────────────────────────────────

  async upsertItem(
    priceListId: string,
    dto: UpsertPriceListItemDto,
    user: AuthUserPayload,
  ): Promise<PriceListItemRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    const list = await this.knex<PriceListRow>('sales_price_lists')
      .where({ id: priceListId, organization_id: organizationId })
      .first();
    if (!list) throw new NotFoundException('Tabela não encontrada');

    const product = await this.knex('sales_products')
      .where({ id: dto.productId, organization_id: organizationId })
      .first();
    if (!product) throw new BadRequestException('Produto inválido');

    const minQty = dto.minQuantity ?? 1;
    const existing = await this.knex<PriceListItemRow>('sales_price_list_items')
      .where({ price_list_id: priceListId, product_id: dto.productId, min_quantity: minQty })
      .first();

    const now = new Date();
    if (existing) {
      await this.knex('sales_price_list_items').where({ id: existing.id }).update({
        price: dto.price,
        discount_pct: dto.discountPct ?? 0,
        updated_at: now,
      });
      return (await this.knex<PriceListItemRow>('sales_price_list_items')
        .where({ id: existing.id })
        .first()) as PriceListItemRow;
    }

    const id = randomUUID();
    await this.knex('sales_price_list_items').insert({
      id,
      organization_id: organizationId,
      price_list_id: priceListId,
      product_id: dto.productId,
      price: dto.price,
      discount_pct: dto.discountPct ?? 0,
      min_quantity: minQty,
      created_at: now,
      updated_at: now,
    });
    return (await this.knex<PriceListItemRow>('sales_price_list_items')
      .where({ id })
      .first()) as PriceListItemRow;
  }

  async removeItem(
    priceListId: string,
    itemId: string,
    user: AuthUserPayload,
  ): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const deleted = await this.knex('sales_price_list_items')
      .where({
        id: itemId,
        price_list_id: priceListId,
        organization_id: organizationId,
      })
      .delete();
    if (deleted === 0) throw new NotFoundException('Item não encontrado');
    return { success: true };
  }

  /**
   * Helper consultivo: resolve o melhor preço de um produto considerando
   * uma tabela específica e a quantidade. Útil pra UI mostrar "preço Atacado".
   * Sem tabela → retorna o `price_sale` padrão do produto.
   */
  async resolvePrice(
    productId: string,
    priceListId: string | null,
    quantity: number,
    user: AuthUserPayload,
  ): Promise<{ price: number; discountPct: number; source: 'price_list' | 'product_default' }> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const product = await this.knex('sales_products')
      .where({ id: productId, organization_id: organizationId })
      .first<{ price_sale: string | number } | undefined>();
    if (!product) throw new NotFoundException('Produto não encontrado');

    if (priceListId) {
      // Procura item compatível: menor min_quantity <= quantity (escolhe maior aplicável).
      const item = await this.knex<PriceListItemRow>('sales_price_list_items')
        .where({
          organization_id: organizationId,
          price_list_id: priceListId,
          product_id: productId,
        })
        .andWhere('min_quantity', '<=', quantity)
        .orderBy('min_quantity', 'desc')
        .first();
      if (item) {
        return {
          price: Number(item.price),
          discountPct: Number(item.discount_pct),
          source: 'price_list',
        };
      }
    }
    return {
      price: Number(product.price_sale),
      discountPct: 0,
      source: 'product_default',
    };
  }
}
