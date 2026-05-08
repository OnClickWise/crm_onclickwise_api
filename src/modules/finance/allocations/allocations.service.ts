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
import { AllocatePaymentDto, AllocationLineDto } from './dtos/create-allocation.dto';

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

const WRITE_ROLES = ['master', 'admin', 'accountant', 'financial_operator'] as const;
const READ_ROLES = [...WRITE_ROLES, 'sales', 'procurement'] as const;

export interface AllocationRow {
  id: string;
  organization_id: string;
  payment_kind: 'receivable' | 'payable';
  payment_id: string;
  invoice_kind: 'receivable' | 'payable';
  invoice_id: string;
  amount: string | number;
  payment_currency: string | null;
  invoice_currency: string | null;
  exchange_rate: string | number | null;
  notes: string | null;
  created_at: Date;
}

/**
 * Liquidações: vincula um pagamento a uma ou várias faturas.
 *
 * Regras:
 *  - Soma das alocações ≤ valor do pagamento.
 *  - Cada alocação ≤ saldo pendente daquela fatura.
 *  - Tudo dentro de UMA transação para evitar overbooking sob concorrência.
 *  - Lock pessimista (forUpdate) na fatura impede alocação dupla simultânea.
 *
 * Não cria journal entries adicionais — assume-se que o pagamento já foi lançado
 * contabilmente quando registrado em AR/AP. Allocations são apenas matching.
 */
@Injectable()
export class AllocationsService {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private getScope(user: AuthUserPayload | undefined): AuthScope {
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
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para gerenciar liquidações');
    }
  }

  private ensureRead(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Sem permissão para consultar liquidações');
    }
  }

  /**
   * Aloca um pagamento existente em uma ou mais faturas.
   * Idempotência: chamadas repetidas não duplicam — substitui as alocações
   * anteriores deste pagamento (transacionalmente).
   */
  async allocate(dto: AllocatePaymentDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWrite(role);

    const paymentTable = dto.paymentKind === 'receivable' ? 'receivable_payments' : 'payable_payments';
    const invoiceTablePrefix = (kind: 'receivable' | 'payable') =>
      kind === 'receivable' ? 'accounts_receivable' : 'accounts_payable';

    return this.knex.transaction(async (trx) => {
      // Carrega o pagamento.
      const payment = await trx(paymentTable)
        .where({ id: dto.paymentId, organization_id: organizationId })
        .first();
      if (!payment) {
        throw new NotFoundException('Pagamento não encontrado');
      }

      const paymentAmount = Number(payment.amount);
      const totalAllocated = dto.allocations.reduce((s, a) => s + Number(a.amount), 0);
      if (totalAllocated > paymentAmount + 0.001) {
        throw new BadRequestException(
          `Soma das alocações (${totalAllocated.toFixed(2)}) excede o valor do pagamento (${paymentAmount.toFixed(2)})`,
        );
      }

      // Apaga alocações anteriores DESTE pagamento (idempotência).
      await trx('payment_allocations')
        .where({
          organization_id: organizationId,
          payment_kind: dto.paymentKind,
          payment_id: dto.paymentId,
        })
        .delete();

      // Carrega TODAS as faturas referenciadas com lock — em ordem determinística.
      const invoiceIdsByKind: Record<'receivable' | 'payable', string[]> = {
        receivable: [],
        payable: [],
      };
      for (const a of dto.allocations) {
        invoiceIdsByKind[a.invoiceKind].push(a.invoiceId);
      }

      const invoicesByKind: Record<'receivable' | 'payable', Map<string, Record<string, unknown>>> = {
        receivable: new Map(),
        payable: new Map(),
      };

      for (const kind of ['receivable', 'payable'] as const) {
        if (invoiceIdsByKind[kind].length === 0) continue;
        const rows = await trx(invoiceTablePrefix(kind))
          .whereIn('id', invoiceIdsByKind[kind])
          .andWhere({ organization_id: organizationId })
          .forUpdate();
        for (const row of rows) {
          invoicesByKind[kind].set(String(row.id), row as Record<string, unknown>);
        }
      }

      // Valida que cada alocação cabe no saldo da fatura.
      // Calcula saldo pendente = original_amount - SUM(allocations já existentes para essa fatura).
      const inserts: Array<Partial<AllocationRow> & { id: string }> = [];
      const now = new Date();

      for (const a of dto.allocations) {
        const invoice = invoicesByKind[a.invoiceKind].get(a.invoiceId);
        if (!invoice) {
          throw new NotFoundException(`Fatura ${a.invoiceKind}/${a.invoiceId.slice(0, 8)} não encontrada`);
        }

        // Saldo pendente vindo da própria tabela AR/AP (mantido em outstanding_amount).
        const outstanding = Number(invoice.outstanding_amount ?? 0);
        if (Number(a.amount) > outstanding + 0.001) {
          const code = (invoice.reference_number ?? invoice.id) as string;
          throw new BadRequestException(
            `Alocação ${a.amount.toFixed(2)} excede o saldo pendente (${outstanding.toFixed(2)}) da fatura ${code}`,
          );
        }

        inserts.push({
          id: randomUUID(),
          organization_id: organizationId,
          payment_kind: dto.paymentKind,
          payment_id: dto.paymentId,
          invoice_kind: a.invoiceKind,
          invoice_id: a.invoiceId,
          amount: Number(a.amount).toFixed(2) as unknown as string,
          payment_currency: (payment.currency as string | null) ?? null,
          invoice_currency: (invoice.currency as string | null) ?? null,
          exchange_rate: (payment.exchange_rate as string | null) ?? null,
          notes: a.notes ?? null,
        });
      }

      if (inserts.length > 0) {
        await trx('payment_allocations').insert(
          inserts.map((row) => ({ ...row, created_by: userId, created_at: now })),
        );
      }

      return {
        success: true,
        paymentId: dto.paymentId,
        allocations: inserts.length,
        totalAllocated: Number(totalAllocated.toFixed(2)),
        unallocated: Number((paymentAmount - totalAllocated).toFixed(2)),
      };
    });
  }

  async listForPayment(
    paymentKind: 'receivable' | 'payable',
    paymentId: string,
    user: AuthUserPayload,
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    return this.knex<AllocationRow>('payment_allocations')
      .where({ organization_id: organizationId, payment_kind: paymentKind, payment_id: paymentId })
      .orderBy('created_at', 'asc');
  }

  async listForInvoice(
    invoiceKind: 'receivable' | 'payable',
    invoiceId: string,
    user: AuthUserPayload,
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureRead(role);

    return this.knex<AllocationRow>('payment_allocations')
      .where({ organization_id: organizationId, invoice_kind: invoiceKind, invoice_id: invoiceId })
      .orderBy('created_at', 'asc');
  }

  async remove(id: string, user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureWrite(role);

    const deleted = await this.knex('payment_allocations')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Alocação não encontrada');
    return { success: true };
  }
}
