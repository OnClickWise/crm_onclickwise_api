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
  CreateProductDto,
  ProductType,
  StockMovementDto,
  UpdateProductDto,
} from './dtos/product.dto';
import { StockMovementsService } from '../../inventory/movements/movements.service';
import { WarehousesService } from '../../inventory/warehouses/warehouses.service';

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

export interface ProductRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  barcode: string | null;
  product_type: ProductType;
  unit: string;
  price_sale: string | number;
  price_cost: string | number;
  currency: string;
  default_tax_rate_id: string | null;
  category: string | null;
  brand: string | null;
  stock_track: boolean;
  stock_qty: string | number;
  stock_min: string | number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class SalesProductsService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly movements: StockMovementsService,
    private readonly warehouses: WarehousesService,
  ) {}

  private scope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('Usuário sem organização vinculada');
    }
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }
  private ensureWrite(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para gerenciar produtos');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar produtos');
  }

  async list(
    user: AuthUserPayload,
    opts: { query?: string; type?: ProductType; activeOnly?: boolean; limit?: number } = {},
  ): Promise<ProductRow[]> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    return this.knex<ProductRow>('sales_products')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (opts.activeOnly ?? true) q.andWhere({ is_active: true });
        if (opts.type) q.andWhere({ product_type: opts.type });
        if (opts.query) {
          const term = `%${opts.query.toLowerCase()}%`;
          q.andWhere((sub) =>
            sub
              .whereRaw('LOWER(name) like ?', [term])
              .orWhereRaw('LOWER(code) like ?', [term])
              .orWhereRaw('LOWER(coalesce(barcode, \'\')) like ?', [term]),
          );
        }
      })
      .orderBy('name', 'asc')
      .limit(opts.limit ?? 200);
  }

  async getById(id: string, user: AuthUserPayload): Promise<ProductRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    const row = await this.knex<ProductRow>('sales_products')
      .where({ id, organization_id: organizationId })
      .first();
    if (!row) throw new NotFoundException('Produto não encontrado');
    return row;
  }

  async create(dto: CreateProductDto, user: AuthUserPayload): Promise<ProductRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    // Garante unicidade do code
    const existing = await this.knex('sales_products')
      .where({ organization_id: organizationId, code: dto.code })
      .first();
    if (existing) throw new ConflictException('Já existe um produto com este código');

    if (dto.defaultTaxRateId) await this.assertTaxBelongsToOrg(dto.defaultTaxRateId, organizationId);

    const id = randomUUID();
    const now = new Date();
    await this.knex('sales_products').insert({
      id,
      organization_id: organizationId,
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      barcode: dto.barcode ?? null,
      product_type: dto.productType ?? 'product',
      unit: dto.unit ?? 'un',
      price_sale: dto.priceSale ?? 0,
      price_cost: dto.priceCost ?? 0,
      currency: dto.currency ?? 'BRL',
      default_tax_rate_id: dto.defaultTaxRateId ?? null,
      category: dto.category ?? null,
      brand: dto.brand ?? null,
      stock_track: dto.stockTrack ?? false,
      stock_qty: dto.stockQty ?? 0,
      stock_min: dto.stockMin ?? 0,
      is_active: dto.isActive ?? true,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
    return this.getById(id, user);
  }

  async update(id: string, dto: UpdateProductDto, user: AuthUserPayload): Promise<ProductRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    const existing = await this.knex<ProductRow>('sales_products')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Produto não encontrado');

    if (dto.code && dto.code !== existing.code) {
      const dup = await this.knex('sales_products')
        .where({ organization_id: organizationId, code: dto.code })
        .whereNot({ id })
        .first();
      if (dup) throw new ConflictException('Código já em uso por outro produto');
    }
    if (dto.defaultTaxRateId) await this.assertTaxBelongsToOrg(dto.defaultTaxRateId, organizationId);

    await this.knex('sales_products')
      .where({ id })
      .update({
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode ?? null }),
        ...(dto.productType !== undefined && { product_type: dto.productType }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.priceSale !== undefined && { price_sale: dto.priceSale }),
        ...(dto.priceCost !== undefined && { price_cost: dto.priceCost }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.defaultTaxRateId !== undefined && { default_tax_rate_id: dto.defaultTaxRateId ?? null }),
        ...(dto.category !== undefined && { category: dto.category ?? null }),
        ...(dto.brand !== undefined && { brand: dto.brand ?? null }),
        ...(dto.stockTrack !== undefined && { stock_track: dto.stockTrack }),
        ...(dto.stockQty !== undefined && { stock_qty: dto.stockQty }),
        ...(dto.stockMin !== undefined && { stock_min: dto.stockMin }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        updated_at: new Date(),
      });
    return this.getById(id, user);
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    // Verifica se tem documento usando esse produto
    const inUse = await this.knex('sales_document_lines')
      .where({ product_id: id, organization_id: organizationId })
      .first();
    if (inUse) {
      // Soft-delete: inativa em vez de quebrar histórico
      await this.knex('sales_products').where({ id, organization_id: organizationId }).update({
        is_active: false,
        updated_at: new Date(),
      });
      return { success: true };
    }

    const deleted = await this.knex('sales_products')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Produto não encontrado');
    return { success: true };
  }

  /**
   * Ajuste manual de stock (entrada/saída avulsa).
   *
   * Agora delega para o motor de inventário: gera um stock_movement do tipo
   * 'adjustment_positive' ou 'adjustment_negative' no armazém default do
   * produto (ou da org), atualizando balance + extrato auditável.
   */
  async adjustStock(id: string, dto: StockMovementDto, user: AuthUserPayload): Promise<ProductRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);
    if (!Number.isFinite(dto.delta) || dto.delta === 0) {
      throw new BadRequestException('Delta de stock deve ser != 0');
    }

    const product = await this.knex<ProductRow>('sales_products')
      .where({ id, organization_id: organizationId })
      .first();
    if (!product) throw new NotFoundException('Produto não encontrado');
    if (!product.stock_track) throw new BadRequestException('Produto não controla stock');

    // Resolve warehouse: default do produto ou default da org
    let warehouseId =
      (product as { default_warehouse_id?: string | null }).default_warehouse_id ?? null;
    if (!warehouseId) {
      const def = await this.warehouses.getDefault(user);
      if (!def) throw new BadRequestException('Nenhum armazém padrão configurado');
      warehouseId = def.id;
    }

    const movementType =
      dto.delta > 0 ? ('adjustment_positive' as const) : ('adjustment_negative' as const);

    await this.knex.transaction(async (trx) => {
      await this.movements.applyMovement(
        {
          organizationId,
          productId: id,
          warehouseId: warehouseId as string,
          movementType,
          quantity: Math.abs(dto.delta),
          referenceType: 'manual_adjustment',
          notes: dto.reason ?? 'Ajuste manual via produto',
          userId,
        },
        trx,
      );
    });

    return (await this.knex<ProductRow>('sales_products').where({ id }).first()) as ProductRow;
  }

  private async assertTaxBelongsToOrg(taxId: string, organizationId: string) {
    const tax = await this.knex('tax_rates')
      .where({ id: taxId, organization_id: organizationId })
      .first();
    if (!tax) throw new BadRequestException('Tax rate inválido');
  }
}
