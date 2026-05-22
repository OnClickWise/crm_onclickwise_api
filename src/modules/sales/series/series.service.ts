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
import { CreateSeriesDto, SeriesDocType, UpdateSeriesDto } from './dtos/series.dto';

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
const READ_ROLES = [...ADMIN_ROLES, 'sales', 'sdr', 'employee', 'accountant'] as const;

export interface SeriesRow {
  id: string;
  organization_id: string;
  doc_type: SeriesDocType;
  series_code: string;
  name: string;
  prefix: string;
  year: number;
  last_number: number;
  is_default: boolean;
  is_active: boolean;
  fiscal_authorization_code: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Séries de documento — substitui a numeração simples por séries
 * configuráveis (FAT-2026/A, FAT-2026/ONLINE, ORC-2026/B…).
 *
 * Cada (org, doc_type, series_code, year) é único e tem seu próprio contador
 * atômico (FOR UPDATE). Documentos antigos com series_id NULL continuam
 * funcionando porque a migração mantém sales_document_numbering.
 */
@Injectable()
export class SalesDocumentSeriesService {
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
  private ensureAdmin(role: string) {
    if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para gerir séries');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar séries');
  }

  async list(user: AuthUserPayload, docType?: SeriesDocType): Promise<SeriesRow[]> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    return this.knex<SeriesRow>('sales_document_series')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (docType) q.andWhere({ doc_type: docType });
      })
      .orderBy([
        { column: 'doc_type', order: 'asc' },
        { column: 'year', order: 'desc' },
        { column: 'is_default', order: 'desc' },
        { column: 'series_code', order: 'asc' },
      ]);
  }

  async getById(id: string, user: AuthUserPayload): Promise<SeriesRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);
    const row = await this.knex<SeriesRow>('sales_document_series')
      .where({ id, organization_id: organizationId })
      .first();
    if (!row) throw new NotFoundException('Série não encontrada');
    return row;
  }

  async create(dto: CreateSeriesDto, user: AuthUserPayload): Promise<SeriesRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureAdmin(role);

    const year = dto.year ?? new Date().getUTCFullYear();
    const dup = await this.knex('sales_document_series')
      .where({
        organization_id: organizationId,
        doc_type: dto.docType,
        series_code: dto.seriesCode,
        year,
      })
      .first();
    if (dup) throw new ConflictException('Já existe série com este código nesse tipo+ano');

    return this.knex.transaction(async (trx) => {
      if (dto.isDefault) {
        await trx('sales_document_series')
          .where({
            organization_id: organizationId,
            doc_type: dto.docType,
            is_default: true,
          })
          .update({ is_default: false });
      }

      const id = randomUUID();
      const now = new Date();
      await trx('sales_document_series').insert({
        id,
        organization_id: organizationId,
        doc_type: dto.docType,
        series_code: dto.seriesCode,
        name: dto.name,
        prefix: dto.prefix,
        year,
        last_number: 0,
        is_default: dto.isDefault ?? false,
        is_active: dto.isActive ?? true,
        fiscal_authorization_code: dto.fiscalAuthorizationCode ?? null,
        created_by: userId,
        created_at: now,
        updated_at: now,
      });

      return (await trx<SeriesRow>('sales_document_series').where({ id }).first()) as SeriesRow;
    });
  }

  async update(id: string, dto: UpdateSeriesDto, user: AuthUserPayload): Promise<SeriesRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    return this.knex.transaction(async (trx) => {
      const existing = await trx<SeriesRow>('sales_document_series')
        .where({ id, organization_id: organizationId })
        .first();
      if (!existing) throw new NotFoundException('Série não encontrada');

      if (dto.isDefault) {
        await trx('sales_document_series')
          .where({
            organization_id: organizationId,
            doc_type: existing.doc_type,
            is_default: true,
          })
          .whereNot({ id })
          .update({ is_default: false });
      }

      await trx('sales_document_series').where({ id }).update({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.isDefault !== undefined && { is_default: dto.isDefault }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        ...(dto.fiscalAuthorizationCode !== undefined && {
          fiscal_authorization_code: dto.fiscalAuthorizationCode ?? null,
        }),
        updated_at: new Date(),
      });

      return (await trx<SeriesRow>('sales_document_series').where({ id }).first()) as SeriesRow;
    });
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    // Não permite excluir se já tem documentos emitidos
    const inUse = await this.knex('sales_documents')
      .where({ series_id: id, organization_id: organizationId })
      .first();
    if (inUse) {
      await this.knex('sales_document_series').where({ id }).update({ is_active: false });
      return { success: true };
    }

    const deleted = await this.knex('sales_document_series')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Série não encontrada');
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NUMERAÇÃO ATÔMICA — usada pelo SalesDocumentsService
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Resolve uma série + gera próximo número. Lógica:
   *  1. Se seriesId fornecido, usa ela direto
   *  2. Senão, pega a série default ativa de (org, doc_type, year)
   *  3. Se não existe default, cria uma série 'A' automaticamente
   *
   * Retorna: { seriesId, docNumber, series }
   */
  async nextNumber(
    organizationId: string,
    docType: SeriesDocType,
    year: number,
    trx: Knex.Transaction,
    opts: { seriesId?: string | null; defaultPrefix?: string } = {},
  ): Promise<{ seriesId: string; docNumber: string }> {
    let series: SeriesRow | undefined;

    if (opts.seriesId) {
      series = await trx<SeriesRow>('sales_document_series')
        .where({ id: opts.seriesId, organization_id: organizationId, doc_type: docType, year })
        .forUpdate()
        .first();
      if (!series)
        throw new BadRequestException(
          `Série ${opts.seriesId} inválida para tipo ${docType} ano ${year}`,
        );
      if (!series.is_active) throw new BadRequestException('Série inativa');
    } else {
      series = await trx<SeriesRow>('sales_document_series')
        .where({
          organization_id: organizationId,
          doc_type: docType,
          year,
          is_default: true,
          is_active: true,
        })
        .forUpdate()
        .first();

      if (!series) {
        // Cria série default automática 'A'
        const id = randomUUID();
        const prefix = opts.defaultPrefix ?? this.defaultPrefixForType(docType);
        const now = new Date();
        await trx('sales_document_series').insert({
          id,
          organization_id: organizationId,
          doc_type: docType,
          series_code: 'A',
          name: 'Série Principal',
          prefix,
          year,
          last_number: 0,
          is_default: true,
          is_active: true,
          created_at: now,
          updated_at: now,
        });
        series = (await trx<SeriesRow>('sales_document_series')
          .where({ id })
          .forUpdate()
          .first()) as SeriesRow;
      }
    }

    const next = series.last_number + 1;
    await trx('sales_document_series')
      .where({ id: series.id })
      .update({ last_number: next, updated_at: new Date() });

    // Formato: "FAT-2026/A-0042" — separa série do número
    const padded = String(next).padStart(4, '0');
    const docNumber =
      series.series_code === 'A'
        ? `${series.prefix}-${series.year}-${padded}`
        : `${series.prefix}-${series.year}/${series.series_code}-${padded}`;

    return { seriesId: series.id, docNumber };
  }

  private defaultPrefixForType(docType: SeriesDocType): string {
    const map: Record<SeriesDocType, string> = {
      quote: 'ORC',
      order: 'ENC',
      delivery: 'GR',
      invoice: 'FAT',
      credit_note: 'NC',
      customer_return: 'DEV',
    };
    return map[docType] ?? 'DOC';
  }
}
