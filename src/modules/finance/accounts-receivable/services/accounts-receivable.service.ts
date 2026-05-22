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
import { ReceivableRepository } from '../repositories/receivable.repository';
import {
  CreateReceivableDto,
  RecordPaymentDto,
  UpdateReceivableDto,
} from '../dtos/create-receivable.dto';
import { randomUUID } from 'crypto';
import { AutoJournalService } from '@/modules/accounting/auto-journal/auto-journal.service';

@Injectable()
export class AccountsReceivableService {
  private readonly logger = new Logger(AccountsReceivableService.name);

  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly receivableRepository: ReceivableRepository,
    private readonly autoJournal: AutoJournalService,
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
    const allowedRoles = ['master', 'admin', 'accountant', 'financial_operator', 'sales'];
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException('User without permission for financial operations');
    }
  }

  async createReceivable(dto: CreateReceivableDto, user: any) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    return this.knex.transaction(async (trx) => {
      const receivable = await this.receivableRepository.create(organizationId, dto, userId);

      // Auto-generate accounting journal entry (Debit: Customer, Credit: Revenue)
      try {
        await this.generateAccountingEntry(trx, receivable, userId, organizationId);
      } catch (error) {
        this.logger.warn(`Failed to auto-generate accounting entry: ${error.message}`);
      }

      return receivable;
    });
  }

  async listReceivables(user: any, limit = 100) {
    const { organizationId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    return this.receivableRepository.findByOrganization(organizationId, Math.min(limit, 500));
  }

  async getReceivable(id: string, user: any) {
    const { organizationId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    const receivable = await this.receivableRepository.findById(id, organizationId);
    if (!receivable) {
      throw new NotFoundException('Receivable not found');
    }

    const payments = await this.receivableRepository.getPayments(id, organizationId);
    return { receivable, payments };
  }

  async getReceivablesByStatus(status: string, user: any) {
    const { organizationId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    return this.receivableRepository.findByStatus(organizationId, status);
  }

  async recordPayment(id: string, dto: RecordPaymentDto, user: any) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    const receivable = await this.receivableRepository.findById(id, organizationId);
    if (!receivable) {
      throw new NotFoundException('Receivable not found');
    }

    return this.knex.transaction(async (trx) => {
      const payment = await this.receivableRepository.recordPayment(id, organizationId, dto.amount, dto, userId);

      // Lançamento contábil automático via motor configurável (sales_payment)
      await this.autoJournal.generate(
        {
          organizationId,
          userId,
          eventType: 'sales_payment',
          referenceType: 'receivable_payment',
          referenceId: payment?.id ?? `${id}:${Date.now()}`,
          description: `Recebimento de ${receivable.customer_name}`,
          entryDate: new Date(),
          amounts: { payment_amount: Number(dto.amount) },
        },
        trx,
      );

      return payment;
    });
  }

  private async generateAccountingEntry(trx: Knex.Transaction, receivable: any, userId: string, organizationId: string) {
    // Get chart of accounts (Debit: Customer/Receivable, Credit: Revenue)
    const customerAccount = await trx('accounting_chart_accounts')
      .where({ organization_id: organizationId, account_type: 'asset' })
      .andWhere('name', 'ilike', '%receiv%')
      .first();

    const revenueAccount = await trx('accounting_chart_accounts')
      .where({ organization_id: organizationId, account_type: 'revenue' })
      .first();

    if (!customerAccount || !revenueAccount) {
      this.logger.warn('Default accounting accounts not found for AR entry');
      return;
    }

    const entryId = randomUUID();
    const now = new Date();

    await trx('accounting_journal_entries').insert({
      id: entryId,
      organization_id: organizationId,
      status: 'posted',
      entry_date: now,
      description: `Receivable from ${receivable.customer_name}`,
      reference_type: 'receivable',
      reference_id: receivable.id,
      created_by: userId,
      updated_by: userId,
      posted_by: userId,
      posted_at: now,
      created_at: now,
      updated_at: now,
    });

    // Debit: Customer account
    await trx('accounting_journal_entry_lines').insert({
      id: randomUUID(),
      journal_entry_id: entryId,
      organization_id: organizationId,
      account_id: customerAccount.id,
      line_type: 'debit',
      amount: (Number(receivable.original_amount) * 100) / 100,
      created_by: userId,
      created_at: now,
    });

    // Credit: Revenue account
    await trx('accounting_journal_entry_lines').insert({
      id: randomUUID(),
      journal_entry_id: entryId,
      organization_id: organizationId,
      account_id: revenueAccount.id,
      line_type: 'credit',
      amount: (Number(receivable.original_amount) * 100) / 100,
      created_by: userId,
      created_at: now,
    });
  }

  /**
   * Atualiza campos editáveis de um recebível.
   * Não permite alterar valores monetários se já há pagamentos registrados — preserva integridade contábil.
   */
  async updateReceivable(id: string, dto: UpdateReceivableDto, user: any) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    const current = await this.receivableRepository.findById(id, organizationId);
    if (!current) {
      throw new NotFoundException('Recebível não encontrado');
    }

    const hasPayments = Number(current.paid_amount) > 0;

    // Se já houve pagamento, NÃO deixa cancelar nem mudar status para draft.
    if (hasPayments && dto.status && ['draft', 'cancelled'].includes(dto.status)) {
      throw new BadRequestException(
        'Não é possível alterar status para rascunho/cancelado em recebível com pagamentos registrados.',
      );
    }

    return this.receivableRepository.update(id, organizationId, dto, userId);
  }

  /**
   * Lista pagamentos parciais de um recebível, com agregação de totais.
   * UMA query no repo + agregação em memória — evita N+1.
   */
  async listPayments(id: string, user: any) {
    const { organizationId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    const receivable = await this.receivableRepository.findById(id, organizationId);
    if (!receivable) {
      throw new NotFoundException('Recebível não encontrado');
    }

    const payments = await this.receivableRepository.getPayments(id, organizationId);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      receivableId: id,
      payments,
      totals: {
        count: payments.length,
        totalPaid: Number(totalPaid.toFixed(2)),
        outstanding: Number((Number(receivable.original_amount) - totalPaid).toFixed(2)),
      },
    };
  }

  async deleteReceivable(id: string, user: any) {
    const { organizationId, role } = this.getScope(user);
    this.ensureFinanceRole(role);

    const receivable = await this.receivableRepository.findById(id, organizationId);
    if (!receivable) {
      throw new NotFoundException('Receivable not found');
    }

    if (receivable.status === 'paid' || receivable.paid_amount > 0) {
      throw new ForbiddenException('Cannot delete receivable with payments recorded');
    }

    await this.receivableRepository.delete(id, organizationId);
    return { success: true };
  }
}
