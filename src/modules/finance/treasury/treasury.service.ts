import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { CreateBankAccountDto } from './dtos/create-bank-account.dto';
import { UpdateBankAccountDto } from './dtos/update-bank-account.dto';
import {
  CreateCashMovementDto,
  CreateTransferDto,
} from './dtos/cash-movement.dto';
import { BankAccount } from './entities/bank-account.entity';

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

/**
 * Service de Tesouraria — gestão de caixas/bancos, movimentos e transferências.
 *
 * Inspiração Primavera (TESOURARIA V10): "Caixas e Bancos" cobre criação de contas,
 * abertura/fecho de caixa, movimentos em conta, transferências bancárias e extrato.
 *
 * Decisões de design:
 *  - Multi-tenant estrito (organização sempre validada).
 *  - Saldo é mantido em coluna materializada (`current_balance`) e atualizado em transação
 *    com cada movimento — evita scan na tabela de transações para mostrar saldo na UI.
 *  - Movimentos são persistidos como `finance_transactions` (tabela já existente) —
 *    não duplicamos histórico em nova tabela.
 *  - Transferências usam transação Knex única para garantir atomicidade.
 */
@Injectable()
export class TreasuryService {
  private readonly logger = new Logger(TreasuryService.name);

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

  private ensureWriteRole(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number])) {
      throw new ForbiddenException('Usuário sem permissão para operar tesouraria');
    }
  }

  private ensureReadRole(role: string) {
    if (!READ_ROLES.includes(role as (typeof READ_ROLES)[number])) {
      throw new ForbiddenException('Usuário sem permissão para consultar tesouraria');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTAS (CAIXA / BANCO)
  // ═══════════════════════════════════════════════════════════════════════════

  async createBankAccount(dto: CreateBankAccountDto, user: AuthUserPayload): Promise<BankAccount> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      // unique(organization_id, bank_code, account_number) — checa antes para mensagem amigável
      const exists = await trx('bank_accounts')
        .where({
          organization_id: organizationId,
          bank_code: dto.bankCode,
          account_number: dto.accountNumber,
        })
        .first();
      if (exists) {
        throw new BadRequestException(
          `Já existe uma conta com código ${dto.bankCode} e número ${dto.accountNumber}`,
        );
      }

      const id = randomUUID();
      const now = new Date();
      const initial = Number(dto.initialBalance ?? 0);

      await trx('bank_accounts').insert({
        id,
        organization_id: organizationId,
        bank_code: dto.bankCode,
        bank_name: dto.bankName,
        account_number: dto.accountNumber,
        account_type: dto.accountType,
        account_holder: dto.accountHolder,
        current_balance: initial.toFixed(2),
        available_balance: initial.toFixed(2),
        is_active: dto.isActive ?? true,
        currency: dto.currency ?? 'BRL',
        notes: dto.notes ?? null,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      });

      // Se houver saldo inicial, registra como movimento de "abertura" para auditoria.
      if (initial > 0) {
        await trx('finance_transactions').insert({
          id: randomUUID(),
          organization_id: organizationId,
          transaction_type: 'treasury',
          status: 'posted',
          occurred_at: now,
          currency: dto.currency ?? 'BRL',
          amount: initial.toFixed(2),
          description: `Saldo de abertura — ${dto.bankName} ${dto.accountNumber}`,
          reference_type: 'bank_account_opening',
          reference_id: id,
          created_by: userId,
          updated_by: userId,
          posted_at: now,
          created_at: now,
          updated_at: now,
        });
      }

      const created = await trx('bank_accounts').where({ id }).first<BankAccount>();
      if (!created) {
        throw new Error('Falha ao recuperar conta criada');
      }
      return created;
    });
  }

  async listBankAccounts(
    user: AuthUserPayload,
    filters?: { isActive?: boolean; accountType?: string },
  ): Promise<BankAccount[]> {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const query = this.knex<BankAccount>('bank_accounts')
      .where({ organization_id: organizationId })
      .orderBy([
        { column: 'is_active', order: 'desc' },
        { column: 'account_type', order: 'asc' },
        { column: 'bank_name', order: 'asc' },
      ]);

    if (typeof filters?.isActive === 'boolean') {
      query.andWhere({ is_active: filters.isActive });
    }
    if (filters?.accountType) {
      query.andWhere({ account_type: filters.accountType });
    }

    return query;
  }

  async getBankAccount(id: string, user: AuthUserPayload): Promise<BankAccount> {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const account = await this.knex<BankAccount>('bank_accounts')
      .where({ id, organization_id: organizationId })
      .first();
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }
    return account;
  }

  async updateBankAccount(
    id: string,
    dto: UpdateBankAccountDto,
    user: AuthUserPayload,
  ): Promise<BankAccount> {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    const current = await this.knex<BankAccount>('bank_accounts')
      .where({ id, organization_id: organizationId })
      .first();
    if (!current) {
      throw new NotFoundException('Conta não encontrada');
    }

    // Build patch só com colunas que vieram no DTO (evita sobrescrever com null).
    const patch: Record<string, unknown> = { updated_by: userId, updated_at: new Date() };
    if (dto.bankName !== undefined) patch.bank_name = dto.bankName;
    if (dto.accountType !== undefined) patch.account_type = dto.accountType;
    if (dto.accountHolder !== undefined) patch.account_holder = dto.accountHolder;
    if (dto.currency !== undefined) patch.currency = dto.currency;
    if (dto.isActive !== undefined) patch.is_active = dto.isActive;
    if (dto.notes !== undefined) patch.notes = dto.notes;

    await this.knex('bank_accounts')
      .where({ id, organization_id: organizationId })
      .update(patch);

    const updated = await this.knex<BankAccount>('bank_accounts')
      .where({ id, organization_id: organizationId })
      .first();
    if (!updated) {
      throw new Error('Falha ao recuperar conta atualizada');
    }
    return updated;
  }

  async removeBankAccount(id: string, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const account = await trx<BankAccount>('bank_accounts')
        .where({ id, organization_id: organizationId })
        .first();
      if (!account) {
        throw new NotFoundException('Conta não encontrada');
      }

      // Inativa em vez de apagar quando há histórico ou saldo — preserva auditoria.
      const usage = await trx('finance_transactions')
        .where({ organization_id: organizationId, reference_type: 'treasury_movement', reference_id: id })
        .first();

      const balance = Number(account.current_balance);
      if (usage || Math.abs(balance) > 0.001) {
        await trx('bank_accounts')
          .where({ id, organization_id: organizationId })
          .update({ is_active: false, updated_by: userId, updated_at: new Date() });
        return { success: true, action: 'inactivated' };
      }

      await trx('bank_accounts').where({ id, organization_id: organizationId }).delete();
      return { success: true, action: 'deleted' };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOVIMENTOS (entrada / saída)
  // ═══════════════════════════════════════════════════════════════════════════

  async recordMovement(dto: CreateCashMovementDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    return this.knex.transaction(async (trx) => {
      const account = await trx<BankAccount>('bank_accounts')
        .where({ id: dto.bankAccountId, organization_id: organizationId })
        .forUpdate() // lock pessimista — evita race condition no saldo sob concorrência
        .first();
      if (!account) {
        throw new NotFoundException('Conta não encontrada');
      }
      if (!account.is_active) {
        throw new BadRequestException('Conta inativa — reative para movimentar');
      }

      const amount = Number(dto.amount);
      const signedAmount = dto.direction === 'inflow' ? amount : -amount;
      const newBalance = Number(account.current_balance) + signedAmount;

      if (newBalance < 0) {
        throw new BadRequestException(
          `Saldo insuficiente. Saldo atual: ${Number(account.current_balance).toFixed(2)} ${account.currency}.`,
        );
      }

      const movementId = randomUUID();
      const now = new Date();

      await trx('finance_transactions').insert({
        id: movementId,
        organization_id: organizationId,
        transaction_type: 'treasury',
        status: 'posted',
        occurred_at: new Date(dto.movementDate),
        currency: account.currency,
        amount: amount.toFixed(2),
        description: dto.description,
        reference_type: 'treasury_movement',
        reference_id: dto.bankAccountId,
        created_by: userId,
        updated_by: userId,
        posted_at: now,
        created_at: now,
        updated_at: now,
      });

      await trx('bank_accounts')
        .where({ id: dto.bankAccountId, organization_id: organizationId })
        .update({
          current_balance: newBalance.toFixed(2),
          available_balance: newBalance.toFixed(2),
          updated_by: userId,
          updated_at: now,
        });

      return {
        movementId,
        bankAccountId: dto.bankAccountId,
        direction: dto.direction,
        amount,
        previousBalance: Number(account.current_balance),
        newBalance,
        currency: account.currency,
      };
    });
  }

  async recordTransfer(dto: CreateTransferDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.getScope(user);
    this.ensureWriteRole(role);

    if (dto.fromBankAccountId === dto.toBankAccountId) {
      throw new BadRequestException('Conta de origem e destino devem ser diferentes');
    }

    return this.knex.transaction(async (trx) => {
      // Lock both accounts in deterministic order to prevent deadlocks
      const [first, second] = [dto.fromBankAccountId, dto.toBankAccountId].sort();
      const accountsLocked = await trx<BankAccount>('bank_accounts')
        .whereIn('id', [first, second])
        .andWhere({ organization_id: organizationId })
        .forUpdate();

      if (accountsLocked.length !== 2) {
        throw new NotFoundException('Uma ou ambas as contas não foram encontradas');
      }

      const fromAccount = accountsLocked.find((a) => a.id === dto.fromBankAccountId);
      const toAccount = accountsLocked.find((a) => a.id === dto.toBankAccountId);
      if (!fromAccount || !toAccount) {
        throw new NotFoundException('Conta(s) inválida(s)');
      }
      if (!fromAccount.is_active || !toAccount.is_active) {
        throw new BadRequestException('Uma das contas está inativa');
      }
      if (fromAccount.currency !== toAccount.currency) {
        throw new BadRequestException(
          'Transferência entre moedas diferentes não é suportada nesta versão (use movimentos manuais com câmbio).',
        );
      }

      const amount = Number(dto.amount);
      const fromNew = Number(fromAccount.current_balance) - amount;
      if (fromNew < 0) {
        throw new BadRequestException(
          `Saldo insuficiente na conta ${fromAccount.bank_name} (${Number(fromAccount.current_balance).toFixed(2)} ${fromAccount.currency}).`,
        );
      }
      const toNew = Number(toAccount.current_balance) + amount;

      const occurredAt = new Date(dto.movementDate);
      const now = new Date();
      const transferId = randomUUID();

      // Saída da origem
      await trx('finance_transactions').insert({
        id: randomUUID(),
        organization_id: organizationId,
        transaction_type: 'transfer',
        status: 'posted',
        occurred_at: occurredAt,
        currency: fromAccount.currency,
        amount: amount.toFixed(2),
        description: `Transferência → ${toAccount.bank_name}: ${dto.description}`,
        reference_type: 'treasury_transfer_out',
        reference_id: transferId,
        created_by: userId,
        updated_by: userId,
        posted_at: now,
        created_at: now,
        updated_at: now,
      });

      // Entrada no destino
      await trx('finance_transactions').insert({
        id: randomUUID(),
        organization_id: organizationId,
        transaction_type: 'transfer',
        status: 'posted',
        occurred_at: occurredAt,
        currency: toAccount.currency,
        amount: amount.toFixed(2),
        description: `Transferência ← ${fromAccount.bank_name}: ${dto.description}`,
        reference_type: 'treasury_transfer_in',
        reference_id: transferId,
        created_by: userId,
        updated_by: userId,
        posted_at: now,
        created_at: now,
        updated_at: now,
      });

      await trx('bank_accounts')
        .where({ id: fromAccount.id, organization_id: organizationId })
        .update({
          current_balance: fromNew.toFixed(2),
          available_balance: fromNew.toFixed(2),
          updated_by: userId,
          updated_at: now,
        });

      await trx('bank_accounts')
        .where({ id: toAccount.id, organization_id: organizationId })
        .update({
          current_balance: toNew.toFixed(2),
          available_balance: toNew.toFixed(2),
          updated_by: userId,
          updated_at: now,
        });

      return {
        transferId,
        amount,
        from: { id: fromAccount.id, newBalance: fromNew },
        to: { id: toAccount.id, newBalance: toNew },
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRATO E RESUMO
  // ═══════════════════════════════════════════════════════════════════════════

  async getStatement(
    bankAccountId: string,
    user: AuthUserPayload,
    filters: { startDate?: string; endDate?: string; limit?: number } = {},
  ) {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const account = await this.knex<BankAccount>('bank_accounts')
      .where({ id: bankAccountId, organization_id: organizationId })
      .first();
    if (!account) {
      throw new NotFoundException('Conta não encontrada');
    }

    const limit = Math.max(1, Math.min(filters.limit ?? 100, 500));

    const query = this.knex('finance_transactions')
      .where({
        organization_id: organizationId,
        reference_id: bankAccountId,
      })
      .whereIn('reference_type', [
        'treasury_movement',
        'treasury_transfer_out',
        'treasury_transfer_in',
        'bank_account_opening',
      ])
      .orderBy('occurred_at', 'desc')
      .limit(limit);

    if (filters.startDate) query.andWhere('occurred_at', '>=', new Date(filters.startDate));
    if (filters.endDate) query.andWhere('occurred_at', '<=', new Date(filters.endDate));

    const movements = await query;

    return {
      account,
      movements,
      meta: {
        count: movements.length,
        limitApplied: limit,
      },
    };
  }

  /**
   * Resumo geral da tesouraria: total por moeda + por tipo de conta.
   * UMA query com aggregation — sem N+1.
   */
  async getOverview(user: AuthUserPayload) {
    const { organizationId, role } = this.getScope(user);
    this.ensureReadRole(role);

    const rows = await this.knex('bank_accounts')
      .where({ organization_id: organizationId, is_active: true })
      .select(
        'currency',
        'account_type',
        this.knex.raw('COUNT(*)::int AS accounts'),
        this.knex.raw('COALESCE(SUM(current_balance), 0)::float8 AS total_balance'),
      )
      .groupBy(['currency', 'account_type']);

    return {
      byCurrency: this.groupByKey(rows, 'currency'),
      byType: this.groupByKey(rows, 'account_type'),
      raw: rows,
    };
  }

  private groupByKey<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
    const acc: Record<string, { accounts: number; totalBalance: number }> = {};
    for (const row of rows) {
      const k = String(row[key]);
      if (!acc[k]) acc[k] = { accounts: 0, totalBalance: 0 };
      acc[k].accounts += Number(row.accounts ?? 0);
      acc[k].totalBalance += Number(row.total_balance ?? 0);
    }
    return acc;
  }
}
