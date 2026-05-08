import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { PayableRepository } from '../repositories/payable.repository';
import {
  CreatePayableDto,
  RecordPaymentDto,
  UpdatePayableDto,
} from '../dtos/create-payable.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class AccountsPayableService {
  private readonly logger = new Logger(AccountsPayableService.name);

  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly payableRepository: PayableRepository,
  ) {}

  private getScope(user: any): { organizationId: string; userId: string; role: string } {
    if (!user?.organizationId || !user?.userId) {
      throw new UnauthorizedException('User without organization attached');
    }

    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user?.role || '').toLowerCase(),
    };
  }

  private ensureFinanceRole(role: string) {
    const allowedRoles = ['master', 'admin', 'accountant', 'financial_operator', 'procurement'];
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException('User without permission for financial operations');
    }
  }

  async createPayable(dto: CreatePayableDto, user: any) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    return this.knex.transaction(async (trx) => {
      const payable = await this.payableRepository.create(organizationId, dto, userId);

      // Auto-generate accounting journal entry (Debit: Expense, Credit: Supplier)
      try {
        await this.generateAccountingEntry(trx, payable, userId, organizationId);
      } catch (error) {
        this.logger.warn(`Failed to auto-generate accounting entry: ${error.message}`);
      }

      return payable;
    });
  }

  async listPayables(user: any, limit = 100) {
    const { organizationId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    return this.payableRepository.findByOrganization(organizationId, Math.min(limit, 500));
  }

  async getPayable(id: string, user: any) {
    const { organizationId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    const payable = await this.payableRepository.findById(id, organizationId);
    if (!payable) {
      throw new NotFoundException('Payable not found');
    }

    const payments = await this.payableRepository.getPayments(id, organizationId);
    return { payable, payments };
  }

  async getPayablesByStatus(status: string, user: any) {
    const { organizationId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    return this.payableRepository.findByStatus(organizationId, status);
  }

  async recordPayment(id: string, dto: RecordPaymentDto, user: any) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    const payable = await this.payableRepository.findById(id, organizationId);
    if (!payable) {
      throw new NotFoundException('Payable not found');
    }

    return this.knex.transaction(async (trx) => {
      const payment = await this.payableRepository.recordPayment(id, organizationId, dto.amount, dto, userId);

      // Auto-generate accounting entry (Debit: Supplier, Credit: Bank/Cash)
      try {
        await this.generatePaymentAccountingEntry(trx, payable, Number(dto.amount), userId, organizationId);
      } catch (error) {
        this.logger.warn(`Failed to auto-generate payment accounting entry: ${error.message}`);
      }

      return payment;
    });
  }

  private async generateAccountingEntry(trx: Knex.Transaction, payable: any, userId: string, organizationId: string) {
    // Get chart of accounts (Debit: Expense, Credit: Supplier/Payable)
    const expenseAccount = await trx('accounting_chart_accounts')
      .where({ organization_id: organizationId, account_type: 'expense' })
      .first();

    const supplierAccount = await trx('accounting_chart_accounts')
      .where({ organization_id: organizationId, account_type: 'liability' })
      .andWhere('name', 'ilike', '%payable%')
      .first();

    if (!expenseAccount || !supplierAccount) {
      this.logger.warn('Default accounting accounts not found for AP entry');
      return;
    }

    const entryId = randomUUID();
    const now = new Date();

    await trx('accounting_journal_entries').insert({
      id: entryId,
      organization_id: organizationId,
      status: 'posted',
      entry_date: now,
      description: `Payable to ${payable.supplier_name}`,
      reference_type: 'payable',
      reference_id: payable.id,
      created_by: userId,
      updated_by: userId,
      posted_by: userId,
      posted_at: now,
      created_at: now,
      updated_at: now,
    });

    // Debit: Expense account
    await trx('accounting_journal_entry_lines').insert({
      id: randomUUID(),
      journal_entry_id: entryId,
      organization_id: organizationId,
      account_id: expenseAccount.id,
      line_type: 'debit',
      amount: (Number(payable.original_amount) * 100) / 100,
      created_by: userId,
      created_at: now,
    });

    // Credit: Supplier account
    await trx('accounting_journal_entry_lines').insert({
      id: randomUUID(),
      journal_entry_id: entryId,
      organization_id: organizationId,
      account_id: supplierAccount.id,
      line_type: 'credit',
      amount: (Number(payable.original_amount) * 100) / 100,
      created_by: userId,
      created_at: now,
    });
  }

  private async generatePaymentAccountingEntry(
    trx: Knex.Transaction,
    payable: any,
    amount: number,
    userId: string,
    organizationId: string,
  ) {
    const supplierAccount = await trx('accounting_chart_accounts')
      .where({ organization_id: organizationId, account_type: 'liability' })
      .andWhere('name', 'ilike', '%payable%')
      .first();

    const bankAccount = await trx('accounting_chart_accounts')
      .where({ organization_id: organizationId, account_type: 'asset' })
      .andWhere('name', 'ilike', '%bank%')
      .first();

    if (!supplierAccount || !bankAccount) {
      this.logger.warn('Default accounting accounts not found for payment entry');
      return;
    }

    const entryId = randomUUID();
    const now = new Date();

    await trx('accounting_journal_entries').insert({
      id: entryId,
      organization_id: organizationId,
      status: 'posted',
      entry_date: now,
      description: `Payment to ${payable.supplier_name}`,
      reference_type: 'payable_payment',
      reference_id: payable.id,
      created_by: userId,
      updated_by: userId,
      posted_by: userId,
      posted_at: now,
      created_at: now,
      updated_at: now,
    });

    // Debit: Supplier account
    await trx('accounting_journal_entry_lines').insert({
      id: randomUUID(),
      journal_entry_id: entryId,
      organization_id: organizationId,
      account_id: supplierAccount.id,
      line_type: 'debit',
      amount: (amount * 100) / 100,
      created_by: userId,
      created_at: now,
    });

    // Credit: Bank/Cash account
    await trx('accounting_journal_entry_lines').insert({
      id: randomUUID(),
      journal_entry_id: entryId,
      organization_id: organizationId,
      account_id: bankAccount.id,
      line_type: 'credit',
      amount: (amount * 100) / 100,
      created_by: userId,
      created_at: now,
    });
  }

  /**
   * Atualiza campos editáveis de um pagável.
   * Bloqueia mudanças destrutivas se já há pagamentos parciais.
   */
  async updatePayable(id: string, dto: UpdatePayableDto, user: any) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    const current = await this.payableRepository.findById(id, organizationId);
    if (!current) {
      throw new NotFoundException('Pagável não encontrado');
    }

    const hasPayments = Number(current.paid_amount) > 0;
    if (hasPayments && dto.status && ['draft', 'cancelled'].includes(dto.status)) {
      throw new BadRequestException(
        'Não é possível alterar status para rascunho/cancelado em pagável com pagamentos registrados.',
      );
    }

    return this.payableRepository.update(id, organizationId, dto, userId);
  }

  /**
   * Lista pagamentos parciais de um pagável + agregados.
   */
  async listPayments(id: string, user: any) {
    const { organizationId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    const payable = await this.payableRepository.findById(id, organizationId);
    if (!payable) {
      throw new NotFoundException('Pagável não encontrado');
    }

    const payments = await this.payableRepository.getPayments(id, organizationId);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      payableId: id,
      payments,
      totals: {
        count: payments.length,
        totalPaid: Number(totalPaid.toFixed(2)),
        outstanding: Number((Number(payable.original_amount) - totalPaid).toFixed(2)),
      },
    };
  }

  async deletePayable(id: string, user: any) {
    const { organizationId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    const payable = await this.payableRepository.findById(id, organizationId);
    if (!payable) {
      throw new NotFoundException('Payable not found');
    }

    if (payable.status === 'paid' || payable.paid_amount > 0) {
      throw new ForbiddenException('Cannot delete payable with payments recorded');
    }

    await this.payableRepository.delete(id, organizationId);
    return { success: true };
  }
}
