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
import { AccountsReceivableService } from '../accounts-receivable/services/accounts-receivable.service';
import { AccountsPayableService } from '../accounts-payable/services/accounts-payable.service';
import { ConfirmMatchDto, ImportStatementDto, ParseStatementDto } from './dtos/bank-import.dto';
import { parseStatement, ParsedStatementLine } from './statement-parser';

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

const FINANCE_ROLES = ['master', 'admin', 'accountant', 'financial_operator', 'manager'] as const;

export interface MatchCandidate {
  targetType: 'receivable' | 'payable';
  targetId: string;
  partyName: string;
  referenceNumber: string | null;
  outstandingAmount: number;
  dueDate: string;
  score: number; // 0-100
}

export interface LineWithMatches {
  lineId: string;
  transactionDate: string;
  amount: number;
  description: string;
  isReconciled: boolean;
  candidates: MatchCandidate[];
}

@Injectable()
export class BankImportService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly arService: AccountsReceivableService,
    private readonly apService: AccountsPayableService,
  ) {}

  private scope(user: AuthUserPayload | undefined): AuthScope {
    if (!user?.organizationId || !user?.userId)
      throw new UnauthorizedException('Usuário sem organização vinculada');
    return {
      organizationId: user.organizationId,
      userId: user.userId,
      role: String(user.role ?? '').toLowerCase(),
    };
  }
  private ensureFinance(role: string) {
    if (!FINANCE_ROLES.includes(role as (typeof FINANCE_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para operações financeiras');
  }

  /** Apenas parseia o arquivo e devolve a prévia das linhas (sem gravar). */
  parse(dto: ParseStatementDto, user: AuthUserPayload): { lines: ParsedStatementLine[]; count: number } {
    const { role } = this.scope(user);
    this.ensureFinance(role);
    const parsed = parseStatement(dto.content, dto.format);
    return { lines: parsed.lines, count: parsed.lines.length };
  }

  /** Parseia e grava o extrato + linhas. */
  async import(dto: ImportStatementDto, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureFinance(role);

    const account = await this.knex('bank_accounts')
      .where({ id: dto.bankAccountId, organization_id: organizationId })
      .first();
    if (!account) throw new BadRequestException('Conta bancária inválida');

    const parsed = parseStatement(dto.content, dto.format);
    if (parsed.lines.length === 0)
      throw new BadRequestException('Nenhuma transação encontrada no arquivo.');

    const dates = parsed.lines.map((l) => l.transactionDate).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    // Evita duplicar extrato para a mesma conta + mesma data final
    const existing = await this.knex('bank_statements')
      .where({
        organization_id: organizationId,
        bank_account_id: dto.bankAccountId,
        statement_date: endDate,
      })
      .first();
    if (existing) {
      throw new BadRequestException(
        `Já existe um extrato importado para esta conta com data ${endDate}.`,
      );
    }

    return this.knex.transaction(async (trx) => {
      const statementId = randomUUID();
      const now = new Date();
      await trx('bank_statements').insert({
        id: statementId,
        organization_id: organizationId,
        bank_account_id: dto.bankAccountId,
        statement_date: endDate,
        start_date: startDate,
        end_date: endDate,
        opening_balance: parsed.openingBalance ?? 0,
        closing_balance: parsed.closingBalance ?? 0,
        status: 'uploaded',
        notes: dto.fileName ? `Importado de ${dto.fileName}` : `Importado (${dto.format})`,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      });

      const lineRows = parsed.lines.map((l) => ({
        id: randomUUID(),
        statement_id: statementId,
        organization_id: organizationId,
        transaction_date: new Date(l.transactionDate),
        amount: l.amount,
        transaction_type: l.transactionType,
        description: l.description.slice(0, 500),
        reference: l.reference,
        is_reconciled: false,
        created_at: now,
      }));
      await trx('bank_statement_lines').insert(lineRows);

      return {
        statementId,
        linesImported: lineRows.length,
        startDate,
        endDate,
      };
    });
  }

  /** Para cada linha não reconciliada, sugere contas a receber/pagar compatíveis. */
  async suggestArApMatches(
    statementId: string,
    user: AuthUserPayload,
  ): Promise<LineWithMatches[]> {
    const { organizationId, role } = this.scope(user);
    this.ensureFinance(role);

    const statement = await this.knex('bank_statements')
      .where({ id: statementId, organization_id: organizationId })
      .first();
    if (!statement) throw new NotFoundException('Extrato não encontrado');

    const lines = await this.knex('bank_statement_lines')
      .where({ statement_id: statementId, organization_id: organizationId })
      .orderBy('transaction_date', 'asc')
      .select<
        Array<{
          id: string;
          transaction_date: Date;
          amount: string | number;
          description: string;
          is_reconciled: boolean;
        }>
      >('id', 'transaction_date', 'amount', 'description', 'is_reconciled');

    // Carrega AR e AP em aberto uma única vez
    const receivables = await this.knex('accounts_receivable')
      .where({ organization_id: organizationId })
      .whereIn('status', ['issued', 'partial', 'overdue'])
      .select<
        Array<{
          id: string;
          customer_name: string;
          outstanding_amount: string | number;
          due_date: Date;
          reference_number: string | null;
        }>
      >('id', 'customer_name', 'outstanding_amount', 'due_date', 'reference_number');

    const payables = await this.knex('accounts_payable')
      .where({ organization_id: organizationId })
      .whereIn('status', ['issued', 'partial', 'overdue'])
      .select<
        Array<{
          id: string;
          supplier_name: string;
          outstanding_amount: string | number;
          due_date: Date;
          reference_number: string | null;
        }>
      >('id', 'supplier_name', 'outstanding_amount', 'due_date', 'reference_number');

    return lines.map((line) => {
      const amount = Number(line.amount);
      const amountAbs = Math.abs(amount);
      const lineTime = new Date(line.transaction_date).getTime();
      const candidates: MatchCandidate[] = [];

      if (!line.is_reconciled) {
        // Crédito (entrada) → casa com Contas a Receber
        // Débito (saída) → casa com Contas a Pagar
        const pool =
          amount >= 0
            ? receivables.map((r) => ({
                targetType: 'receivable' as const,
                targetId: r.id,
                partyName: r.customer_name,
                referenceNumber: r.reference_number,
                outstanding: Math.abs(Number(r.outstanding_amount)),
                dueDate: r.due_date,
              }))
            : payables.map((p) => ({
                targetType: 'payable' as const,
                targetId: p.id,
                partyName: p.supplier_name,
                referenceNumber: p.reference_number,
                outstanding: Math.abs(Number(p.outstanding_amount)),
                dueDate: p.due_date,
              }));

        for (const c of pool) {
          const amountDiff = Math.abs(c.outstanding - amountAbs);
          // Só considera se o valor bate (tolerância de 2 centavos) ou
          // está a ≤ 1% de diferença
          const exact = amountDiff < 0.02;
          const close = amountDiff / Math.max(amountAbs, 1) <= 0.01;
          if (!exact && !close) continue;

          const dayDiff =
            Math.abs(new Date(c.dueDate).getTime() - lineTime) / (1000 * 60 * 60 * 24);
          // Score: valor exato vale 70, proximidade de data até 30
          let score = exact ? 70 : 55;
          score += Math.max(0, 30 - dayDiff * 2);

          candidates.push({
            targetType: c.targetType,
            targetId: c.targetId,
            partyName: c.partyName,
            referenceNumber: c.referenceNumber,
            outstandingAmount: c.outstanding,
            dueDate: new Date(c.dueDate).toISOString().slice(0, 10),
            score: Math.round(score),
          });
        }
        candidates.sort((a, b) => b.score - a.score);
      }

      return {
        lineId: line.id,
        transactionDate: new Date(line.transaction_date).toISOString().slice(0, 10),
        amount,
        description: line.description,
        isReconciled: line.is_reconciled,
        candidates: candidates.slice(0, 3),
      };
    });
  }

  /**
   * Confirma o match de uma linha: registra o pagamento na conta a receber/
   * pagar (o que dispara o lançamento contábil automático) e marca a linha
   * como reconciliada.
   */
  async confirmMatch(dto: ConfirmMatchDto, user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureFinance(role);

    const line = await this.knex('bank_statement_lines')
      .where({ id: dto.statementLineId, organization_id: organizationId })
      .first<
        { id: string; amount: string | number; transaction_date: Date; is_reconciled: boolean }
        | undefined
      >();
    if (!line) throw new NotFoundException('Linha de extrato não encontrada');
    if (line.is_reconciled)
      throw new BadRequestException('Esta linha já foi reconciliada');

    const amount = Math.abs(Number(line.amount));
    const paymentDate = new Date(line.transaction_date).toISOString();

    // Registra o pagamento — recordPayment já gera o lançamento contábil (Fase 1)
    if (dto.targetType === 'receivable') {
      if (Number(line.amount) < 0)
        throw new BadRequestException('Linha de débito não pode quitar uma conta a receber');
      await this.arService.recordPayment(
        dto.targetId,
        { amount, paymentDate, paymentMethod: 'Conciliação bancária' },
        user,
      );
    } else {
      if (Number(line.amount) > 0)
        throw new BadRequestException('Linha de crédito não pode quitar uma conta a pagar');
      await this.apService.recordPayment(
        dto.targetId,
        { amount, paymentDate, paymentMethod: 'Conciliação bancária' },
        user,
      );
    }

    await this.knex('bank_statement_lines').where({ id: dto.statementLineId }).update({
      is_reconciled: true,
      matched_transaction_id: dto.targetId,
    });

    return { success: true, targetType: dto.targetType, targetId: dto.targetId, amount };
  }
}
