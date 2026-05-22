import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';

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

const READ_ROLES = ['master', 'admin', 'sales', 'manager', 'accountant', 'sdr'] as const;

/**
 * Analytics de vendas — agregações otimizadas no banco.
 *
 * Convenção: todos os reports filtram por organization_id + janela de datas
 * opcional (from/to). Status `cancelled` e `draft` são ignorados em valores
 * faturados; `quote` entra no funil mas não nos totais de faturamento.
 */
@Injectable()
export class SalesReportsService {
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
  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para ver relatórios de vendas');
  }

  /**
   * Visão geral: KPIs principais da janela.
   * - faturado: soma de invoice (não-cancelled) - credit_notes (não-cancelled)
   * - aberto: faturado - amount_paid
   * - ticket médio: faturado / nº de faturas
   */
  async overview(user: AuthUserPayload, opts: { from?: string; to?: string } = {}) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const q = this.knex('sales_documents')
      .where({ organization_id: organizationId })
      .whereNotIn('status', ['draft', 'cancelled'])
      .modify((qb) => {
        if (opts.from) qb.andWhere('issue_date', '>=', opts.from);
        if (opts.to) qb.andWhere('issue_date', '<=', opts.to);
      });

    const invoiceAgg = await q.clone()
      .where('doc_type', 'invoice')
      .select(this.knex.raw('COALESCE(SUM(total), 0) as total'))
      .select(this.knex.raw('COALESCE(SUM(amount_paid), 0) as paid'))
      .count<{ total: string; paid: string; count: string }[]>('* as count')
      .first();

    const creditAgg = await q.clone()
      .where('doc_type', 'credit_note')
      .select(this.knex.raw('COALESCE(SUM(total), 0) as total'))
      .first<{ total: string }>();

    const quoteAgg = await q.clone()
      .where('doc_type', 'quote')
      .count<{ count: string }[]>('* as count')
      .first();

    const acceptedQuotes = await q.clone()
      .where('doc_type', 'quote')
      .whereIn('status', ['accepted', 'invoiced'])
      .count<{ count: string }[]>('* as count')
      .first();

    const invoiced = Number(invoiceAgg?.total ?? 0) - Number(creditAgg?.total ?? 0);
    const paid = Number(invoiceAgg?.paid ?? 0);
    const invoiceCount = Number(invoiceAgg?.count ?? 0);
    const quotesCount = Number(quoteAgg?.count ?? 0);
    const quotesAccepted = Number(acceptedQuotes?.count ?? 0);

    return {
      invoiced,
      paid,
      outstanding: invoiced - paid,
      invoiceCount,
      avgTicket: invoiceCount > 0 ? invoiced / invoiceCount : 0,
      quotesCount,
      quotesAccepted,
      conversionRate: quotesCount > 0 ? quotesAccepted / quotesCount : 0,
    };
  }

  /**
   * Vendas por mês (últimos N meses). Agrega total faturado por mês de issue_date.
   * Postgres: date_trunc('month', issue_date).
   */
  async salesByMonth(
    user: AuthUserPayload,
    opts: { months?: number } = {},
  ): Promise<Array<{ month: string; invoiced: number; paid: number; count: number }>> {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const months = Math.min(Math.max(opts.months ?? 12, 1), 36);
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - (months - 1));
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const rows = await this.knex('sales_documents')
      .where({ organization_id: organizationId })
      .where('doc_type', 'invoice')
      .whereNotIn('status', ['draft', 'cancelled'])
      .andWhere('issue_date', '>=', since)
      .groupByRaw("date_trunc('month', issue_date)")
      .orderByRaw("date_trunc('month', issue_date) asc")
      .select(this.knex.raw("date_trunc('month', issue_date) as month"))
      .select(this.knex.raw('COALESCE(SUM(total), 0) as invoiced'))
      .select(this.knex.raw('COALESCE(SUM(amount_paid), 0) as paid'))
      .count<Array<{ month: Date; invoiced: string; paid: string; count: string }>>('* as count');

    return rows.map((r) => ({
      month: new Date(r.month).toISOString().slice(0, 7), // YYYY-MM
      invoiced: Number(r.invoiced),
      paid: Number(r.paid),
      count: Number(r.count),
    }));
  }

  /** Top N clientes por valor faturado. */
  async topCustomers(
    user: AuthUserPayload,
    opts: { from?: string; to?: string; limit?: number } = {},
  ) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);

    const rows = await this.knex('sales_documents as d')
      .leftJoin('customers as c', 'd.customer_id', 'c.id')
      .where('d.organization_id', organizationId)
      .where('d.doc_type', 'invoice')
      .whereNotIn('d.status', ['draft', 'cancelled'])
      .modify((q) => {
        if (opts.from) q.andWhere('d.issue_date', '>=', opts.from);
        if (opts.to) q.andWhere('d.issue_date', '<=', opts.to);
      })
      .groupBy('d.customer_id', 'c.name', 'c.code')
      .select('d.customer_id', { customer_name: 'c.name', customer_code: 'c.code' })
      .select(this.knex.raw('COALESCE(SUM(d.total), 0) as invoiced'))
      .select(this.knex.raw('COALESCE(SUM(d.amount_paid), 0) as paid'))
      .count<Array<{ customer_id: string; customer_name: string | null; customer_code: string | null; invoiced: string; paid: string; doc_count: string }>>('* as doc_count')
      .orderByRaw('SUM(d.total) desc nulls last')
      .limit(limit);

    return rows.map((r) => ({
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerCode: r.customer_code,
      invoiced: Number(r.invoiced),
      paid: Number(r.paid),
      outstanding: Number(r.invoiced) - Number(r.paid),
      docCount: Number(r.doc_count),
    }));
  }

  /** Top N produtos por valor vendido (linhas de faturas). */
  async topProducts(
    user: AuthUserPayload,
    opts: { from?: string; to?: string; limit?: number } = {},
  ) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);

    const rows = await this.knex('sales_document_lines as l')
      .innerJoin('sales_documents as d', 'l.document_id', 'd.id')
      .leftJoin('sales_products as p', 'l.product_id', 'p.id')
      .where('l.organization_id', organizationId)
      .where('d.doc_type', 'invoice')
      .whereNotIn('d.status', ['draft', 'cancelled'])
      .whereNotNull('l.product_id')
      .modify((q) => {
        if (opts.from) q.andWhere('d.issue_date', '>=', opts.from);
        if (opts.to) q.andWhere('d.issue_date', '<=', opts.to);
      })
      .groupBy('l.product_id', 'p.name', 'p.code', 'p.unit')
      .select('l.product_id', { product_name: 'p.name', product_code: 'p.code', unit: 'p.unit' })
      .select(this.knex.raw('COALESCE(SUM(l.quantity), 0) as qty'))
      .select(this.knex.raw('COALESCE(SUM(l.line_total), 0) as revenue'))
      .orderByRaw('SUM(l.line_total) desc nulls last')
      .limit(limit);

    return rows.map((r) => ({
      productId: (r as { product_id: string }).product_id,
      productName: (r as { product_name: string | null }).product_name,
      productCode: (r as { product_code: string | null }).product_code,
      unit: (r as { unit: string | null }).unit,
      qty: Number((r as { qty: string }).qty),
      revenue: Number((r as { revenue: string }).revenue),
    }));
  }

  /**
   * Funil de conversão: orçamentos criados → enviados → aceitos → faturados
   * → pagos. Útil pra medir saúde do pipeline comercial.
   */
  async funnel(user: AuthUserPayload, opts: { from?: string; to?: string } = {}) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const base = this.knex('sales_documents')
      .where({ organization_id: organizationId })
      .modify((q) => {
        if (opts.from) q.andWhere('issue_date', '>=', opts.from);
        if (opts.to) q.andWhere('issue_date', '<=', opts.to);
      });

    const quotesCreated = await base.clone().where('doc_type', 'quote').count<{ c: string }[]>('* as c').first();
    const quotesSent = await base.clone()
      .where('doc_type', 'quote')
      .whereIn('status', ['sent', 'accepted', 'invoiced', 'rejected'])
      .count<{ c: string }[]>('* as c')
      .first();
    const quotesAccepted = await base.clone()
      .where('doc_type', 'quote')
      .whereIn('status', ['accepted', 'invoiced'])
      .count<{ c: string }[]>('* as c')
      .first();
    const invoiced = await base.clone()
      .where('doc_type', 'invoice')
      .whereNotIn('status', ['draft', 'cancelled'])
      .count<{ c: string }[]>('* as c')
      .first();
    const paid = await base.clone()
      .where('doc_type', 'invoice')
      .where('status', 'paid')
      .count<{ c: string }[]>('* as c')
      .first();

    return {
      quotesCreated: Number(quotesCreated?.c ?? 0),
      quotesSent: Number(quotesSent?.c ?? 0),
      quotesAccepted: Number(quotesAccepted?.c ?? 0),
      invoiced: Number(invoiced?.c ?? 0),
      paid: Number(paid?.c ?? 0),
    };
  }

  /** Top N vendedores por valor faturado. */
  async topSellers(
    user: AuthUserPayload,
    opts: { from?: string; to?: string; limit?: number } = {},
  ) {
    const { organizationId, role } = this.scope(user);
    this.ensureRead(role);

    const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);

    const rows = await this.knex('sales_documents as d')
      .leftJoin('users as u', 'd.assigned_user_id', 'u.id')
      .where('d.organization_id', organizationId)
      .where('d.doc_type', 'invoice')
      .whereNotIn('d.status', ['draft', 'cancelled'])
      .whereNotNull('d.assigned_user_id')
      .modify((q) => {
        if (opts.from) q.andWhere('d.issue_date', '>=', opts.from);
        if (opts.to) q.andWhere('d.issue_date', '<=', opts.to);
      })
      .groupBy('d.assigned_user_id', 'u.name', 'u.email')
      .select('d.assigned_user_id', { user_name: 'u.name', user_email: 'u.email' })
      .select(this.knex.raw('COALESCE(SUM(d.total), 0) as invoiced'))
      .count<Array<{ assigned_user_id: string; user_name: string | null; user_email: string | null; invoiced: string; doc_count: string }>>('* as doc_count')
      .orderByRaw('SUM(d.total) desc nulls last')
      .limit(limit);

    return rows.map((r) => ({
      userId: r.assigned_user_id,
      userName: r.user_name,
      userEmail: r.user_email,
      invoiced: Number(r.invoiced),
      docCount: Number(r.doc_count),
    }));
  }
}
