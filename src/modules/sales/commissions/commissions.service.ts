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
  CommissionStatus,
  CreateCommissionDto,
  UpdateCommissionStatusDto,
} from './dtos/commission.dto';

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

const WRITE_ROLES = ['master', 'admin', 'manager'] as const;
const READ_ROLES = [...WRITE_ROLES, 'sales', 'accountant'] as const;

export interface CommissionRow {
  id: string;
  organization_id: string;
  document_id: string;
  user_id: string;
  base_amount: string | number;
  commission_pct: string | number;
  commission_amount: string | number;
  currency: string;
  status: CommissionStatus;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  paid_at: Date | null;
}

/**
 * Comissões de venda: gerenciamento manual + bulk view.
 * Regra base: comissão = subtotal (sem imposto) * pct.
 * Status acompanha o ciclo: pending (faturado) → eligible (cliente pagou) → paid.
 */
@Injectable()
export class SalesCommissionsService {
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
      throw new ForbiddenException('Sem permissão para gerenciar comissões');
  }
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para consultar comissões');
  }

  async list(
    user: AuthUserPayload,
    opts: { status?: CommissionStatus; userId?: string; from?: string; to?: string } = {},
  ) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    return this.knex('sales_commissions as cm')
      .innerJoin('sales_documents as d', 'cm.document_id', 'd.id')
      .leftJoin('users as u', 'cm.user_id', 'u.id')
      .leftJoin('customers as c', 'd.customer_id', 'c.id')
      .where('cm.organization_id', organizationId)
      .modify((q) => {
        if (opts.status) q.andWhere('cm.status', opts.status);
        if (opts.userId) q.andWhere('cm.user_id', opts.userId);
        if (opts.from) q.andWhere('d.issue_date', '>=', opts.from);
        if (opts.to) q.andWhere('d.issue_date', '<=', opts.to);
      })
      .select(
        'cm.*',
        { doc_number: 'd.doc_number' },
        { doc_type: 'd.doc_type' },
        { doc_status: 'd.status' },
        { doc_total: 'd.total' },
        { doc_issue_date: 'd.issue_date' },
        { user_name: 'u.name' },
        { user_email: 'u.email' },
        { customer_name: 'c.name' },
      )
      .orderBy('cm.created_at', 'desc')
      .limit(500);
  }

  async summaryByUser(user: AuthUserPayload, opts: { from?: string; to?: string } = {}) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const rows = await this.knex('sales_commissions as cm')
      .innerJoin('sales_documents as d', 'cm.document_id', 'd.id')
      .leftJoin('users as u', 'cm.user_id', 'u.id')
      .where('cm.organization_id', organizationId)
      .modify((q) => {
        if (opts.from) q.andWhere('d.issue_date', '>=', opts.from);
        if (opts.to) q.andWhere('d.issue_date', '<=', opts.to);
      })
      .groupBy('cm.user_id', 'u.name', 'u.email', 'cm.status')
      .select(
        'cm.user_id',
        { user_name: 'u.name' },
        { user_email: 'u.email' },
        'cm.status',
      )
      .sum<{ user_id: string; status: string; total: string }[]>(
        'cm.commission_amount as total',
      );

    const map = new Map<
      string,
      {
        userId: string;
        userName: string | null;
        userEmail: string | null;
        pending: number;
        eligible: number;
        paid: number;
        cancelled: number;
        total: number;
      }
    >();
    for (const r of rows) {
      const key = r.user_id;
      const cur =
        map.get(key) ?? {
          userId: r.user_id,
          userName: (r as { user_name?: string | null }).user_name ?? null,
          userEmail: (r as { user_email?: string | null }).user_email ?? null,
          pending: 0,
          eligible: 0,
          paid: 0,
          cancelled: 0,
          total: 0,
        };
      const amount = Number(r.total ?? 0);
      cur[r.status as 'pending' | 'eligible' | 'paid' | 'cancelled'] = amount;
      cur.total += amount;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }

  async create(dto: CreateCommissionDto, user: AuthUserPayload): Promise<CommissionRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    const doc = await this.knex('sales_documents')
      .where({ id: dto.documentId, organization_id: organizationId })
      .first<{ subtotal: string | number; currency: string; status: string } | undefined>();
    if (!doc) throw new BadRequestException('Documento inválido');

    const existing = await this.knex('sales_commissions')
      .where({ document_id: dto.documentId, user_id: dto.userId })
      .first();
    if (existing) throw new ConflictException('Comissão já registrada para este vendedor');

    const base = Number(doc.subtotal);
    const amount = Math.round(((base * Number(dto.commissionPct)) / 100) * 10000) / 10000;
    const id = randomUUID();
    const now = new Date();
    await this.knex('sales_commissions').insert({
      id,
      organization_id: organizationId,
      document_id: dto.documentId,
      user_id: dto.userId,
      base_amount: base,
      commission_pct: dto.commissionPct,
      commission_amount: amount,
      currency: doc.currency,
      status: doc.status === 'paid' ? 'eligible' : 'pending',
      notes: dto.notes ?? null,
      created_at: now,
      updated_at: now,
    });

    return (await this.knex<CommissionRow>('sales_commissions')
      .where({ id })
      .first()) as CommissionRow;
  }

  async updateStatus(
    id: string,
    dto: UpdateCommissionStatusDto,
    user: AuthUserPayload,
  ): Promise<CommissionRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);

    const existing = await this.knex<CommissionRow>('sales_commissions')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Comissão não encontrada');

    const patch: Partial<CommissionRow> = {
      status: dto.status,
      updated_at: new Date(),
    };
    if (dto.notes !== undefined) patch.notes = dto.notes ?? null;
    if (dto.status === 'paid') patch.paid_at = new Date();

    await this.knex('sales_commissions').where({ id }).update(patch);
    return (await this.knex<CommissionRow>('sales_commissions')
      .where({ id })
      .first()) as CommissionRow;
  }

  async remove(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureWrite(role);
    const deleted = await this.knex('sales_commissions')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Comissão não encontrada');
    return { success: true };
  }
}
