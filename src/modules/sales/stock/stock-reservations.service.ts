import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';

export interface StockReservationRow {
  id: string;
  organization_id: string;
  product_id: string;
  reference_type: string;
  reference_id: string | null;
  quantity: string | number;
  status: 'active' | 'consumed' | 'released' | 'expired';
  expires_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  consumed_at: Date | null;
  released_at: Date | null;
}

/**
 * Helper de reservas de stock.
 *
 * Conceito-chave: `stock_qty` é o físico. Disponível = físico - SUM(reservations active).
 * Evita overselling quando 2 vendedores criam encomendas pra mesmo produto
 * com stock limitado.
 *
 * Operações são atômicas (devem ser chamadas dentro de transação do caller
 * quando combinadas com mudanças correlatas em fulfillment/document).
 */
@Injectable()
export class StockReservationsService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  /** Quantidade reservada (ativa) para um produto na org. */
  async getReservedQty(
    productId: string,
    organizationId: string,
    trx?: Knex.Transaction,
  ): Promise<number> {
    const q = (trx ?? this.knex)('sales_stock_reservations')
      .where({ organization_id: organizationId, product_id: productId, status: 'active' })
      .sum<{ total: string | number | null }[]>('quantity as total')
      .first();
    const row = await q;
    return Number(row?.total ?? 0);
  }

  /** Disponível = physical - reserved. */
  async getAvailable(
    productId: string,
    organizationId: string,
    trx?: Knex.Transaction,
  ): Promise<{ physical: number; reserved: number; available: number; stockTrack: boolean }> {
    const product = await (trx ?? this.knex)('sales_products')
      .where({ id: productId, organization_id: organizationId })
      .first<{ stock_qty: string | number; stock_track: boolean } | undefined>();
    if (!product)
      return { physical: 0, reserved: 0, available: 0, stockTrack: false };
    const physical = Number(product.stock_qty);
    const reserved = await this.getReservedQty(productId, organizationId, trx);
    return {
      physical,
      reserved,
      available: physical - reserved,
      stockTrack: product.stock_track,
    };
  }

  /**
   * Cria reserva ativa. Não valida disponibilidade — caller decide se
   * permite oversell (modo "back-order") ou bloqueia.
   * Retorna o ID da reserva criada.
   */
  async reserve(
    input: {
      productId: string;
      organizationId: string;
      quantity: number;
      referenceType: string; // 'sales_order' | 'manual'
      referenceId?: string | null;
      userId?: string | null;
      notes?: string | null;
      expiresAt?: Date | null;
    },
    trx: Knex.Transaction,
  ): Promise<string> {
    const id = randomUUID();
    const now = new Date();
    await trx('sales_stock_reservations').insert({
      id,
      organization_id: input.organizationId,
      product_id: input.productId,
      reference_type: input.referenceType,
      reference_id: input.referenceId ?? null,
      quantity: input.quantity,
      status: 'active',
      expires_at: input.expiresAt ?? null,
      notes: input.notes ?? null,
      created_by: input.userId ?? null,
      created_at: now,
      updated_at: now,
    });
    return id;
  }

  /** Libera (cancela) todas reservas ativas vinculadas a uma referência. */
  async releaseByReference(
    referenceType: string,
    referenceId: string,
    organizationId: string,
    trx: Knex.Transaction,
  ): Promise<number> {
    const now = new Date();
    return trx('sales_stock_reservations')
      .where({
        organization_id: organizationId,
        reference_type: referenceType,
        reference_id: referenceId,
        status: 'active',
      })
      .update({ status: 'released', released_at: now, updated_at: now });
  }

  /**
   * Consome reserva = stock sai do "reservado" mas também sai do físico.
   * Use quando o produto foi efetivamente expedido. Caller deve decrementar
   * stock_qty separadamente.
   */
  async consumeByReference(
    referenceType: string,
    referenceId: string,
    organizationId: string,
    trx: Knex.Transaction,
  ): Promise<number> {
    const now = new Date();
    return trx('sales_stock_reservations')
      .where({
        organization_id: organizationId,
        reference_type: referenceType,
        reference_id: referenceId,
        status: 'active',
      })
      .update({ status: 'consumed', consumed_at: now, updated_at: now });
  }

  /**
   * Retorna mapa product_id → { physical, reserved, available } para uma lista.
   * Usado pela UI de produtos pra evitar N+1.
   */
  async getAvailabilityBatch(
    productIds: string[],
    organizationId: string,
  ): Promise<Record<string, { physical: number; reserved: number; available: number }>> {
    if (productIds.length === 0) return {};

    const products = await this.knex('sales_products')
      .whereIn('id', productIds)
      .andWhere({ organization_id: organizationId })
      .select<Array<{ id: string; stock_qty: string | number }>>('id', 'stock_qty');

    const reservations = await this.knex('sales_stock_reservations')
      .whereIn('product_id', productIds)
      .andWhere({ organization_id: organizationId, status: 'active' })
      .groupBy('product_id')
      .select('product_id')
      .sum<Array<{ product_id: string; total: string }>>('quantity as total');

    const resMap = new Map(reservations.map((r) => [r.product_id, Number(r.total)]));
    const result: Record<string, { physical: number; reserved: number; available: number }> = {};
    for (const p of products) {
      const reserved = resMap.get(p.id) ?? 0;
      const physical = Number(p.stock_qty);
      result[p.id] = { physical, reserved, available: physical - reserved };
    }
    return result;
  }
}
