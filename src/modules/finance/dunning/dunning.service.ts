import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { EmailService } from '@/modules/communications/email/email.service';
import { CreateDunningRuleDto, UpdateDunningRuleDto } from './dtos/dunning.dto';

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

export interface DunningRuleRow {
  id: string;
  organization_id: string;
  name: string;
  offset_days: number;
  subject_template: string;
  body_template: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface DunningRunResult {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
}

/** Régua de cobrança padrão criada pelo seedDefaults. */
const DEFAULT_RULES: Array<Omit<CreateDunningRuleDto, 'isActive'>> = [
  {
    name: 'Lembrete — 3 dias antes do vencimento',
    offsetDays: -3,
    subjectTemplate: 'Lembrete: fatura {doc_number} vence em breve',
    bodyTemplate:
      'Olá {customer_name},\n\nLembramos que a fatura {doc_number}, no valor de {amount}, vence em {due_date}.\n\nCaso já tenha efetuado o pagamento, desconsidere este e-mail.\n\nObrigado.',
    sortOrder: 1,
  },
  {
    name: 'No dia do vencimento',
    offsetDays: 0,
    subjectTemplate: 'Sua fatura {doc_number} vence hoje',
    bodyTemplate:
      'Olá {customer_name},\n\nA fatura {doc_number}, no valor de {amount}, vence hoje ({due_date}).\n\nContamos com o seu pagamento. Obrigado.',
    sortOrder: 2,
  },
  {
    name: 'Cobrança — 5 dias em atraso',
    offsetDays: 5,
    subjectTemplate: 'Fatura {doc_number} em atraso',
    bodyTemplate:
      'Olá {customer_name},\n\nIdentificamos que a fatura {doc_number}, no valor de {outstanding}, está em atraso há {days_overdue} dia(s) (vencimento {due_date}).\n\nPor favor, regularize o pagamento o quanto antes. Em caso de dúvida, entre em contato.',
    sortOrder: 3,
  },
  {
    name: 'Cobrança — 15 dias em atraso',
    offsetDays: 15,
    subjectTemplate: 'Pendência financeira — fatura {doc_number}',
    bodyTemplate:
      'Olá {customer_name},\n\nA fatura {doc_number} ({outstanding}) permanece em aberto há {days_overdue} dias.\n\nSolicitamos a regularização para evitar a suspensão de fornecimento/serviços.',
    sortOrder: 4,
  },
  {
    name: 'Cobrança final — 30 dias em atraso',
    offsetDays: 30,
    subjectTemplate: 'Aviso final — fatura {doc_number}',
    bodyTemplate:
      'Olá {customer_name},\n\nA fatura {doc_number}, no valor de {outstanding}, está em atraso há {days_overdue} dias.\n\nEste é um aviso final antes do encaminhamento para cobrança. Entre em contato com urgência para negociar.',
    sortOrder: 5,
  },
];

@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly emailService: EmailService,
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
      throw new ForbiddenException('Sem permissão para gerir a régua de cobrança');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRUD DE REGRAS
  // ═══════════════════════════════════════════════════════════════════════

  async listRules(user: AuthUserPayload): Promise<DunningRuleRow[]> {
    const { organizationId, role } = this.scope(user);
    this.ensureFinance(role);
    return this.knex<DunningRuleRow>('dunning_rules')
      .where({ organization_id: organizationId })
      .orderBy('offset_days', 'asc');
  }

  async createRule(dto: CreateDunningRuleDto, user: AuthUserPayload): Promise<DunningRuleRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureFinance(role);
    const id = randomUUID();
    const now = new Date();
    await this.knex('dunning_rules').insert({
      id,
      organization_id: organizationId,
      name: dto.name,
      offset_days: dto.offsetDays,
      subject_template: dto.subjectTemplate,
      body_template: dto.bodyTemplate,
      is_active: dto.isActive ?? true,
      sort_order: dto.sortOrder ?? 0,
      created_by: userId,
      created_at: now,
      updated_at: now,
    });
    return (await this.knex<DunningRuleRow>('dunning_rules').where({ id }).first()) as DunningRuleRow;
  }

  async updateRule(
    id: string,
    dto: UpdateDunningRuleDto,
    user: AuthUserPayload,
  ): Promise<DunningRuleRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureFinance(role);
    const existing = await this.knex('dunning_rules')
      .where({ id, organization_id: organizationId })
      .first();
    if (!existing) throw new NotFoundException('Regra não encontrada');
    await this.knex('dunning_rules')
      .where({ id })
      .update({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.offsetDays !== undefined && { offset_days: dto.offsetDays }),
        ...(dto.subjectTemplate !== undefined && { subject_template: dto.subjectTemplate }),
        ...(dto.bodyTemplate !== undefined && { body_template: dto.bodyTemplate }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sort_order: dto.sortOrder }),
        updated_at: new Date(),
      });
    return (await this.knex<DunningRuleRow>('dunning_rules').where({ id }).first()) as DunningRuleRow;
  }

  async removeRule(id: string, user: AuthUserPayload): Promise<{ success: boolean }> {
    const { organizationId, role } = this.scope(user);
    this.ensureFinance(role);
    const deleted = await this.knex('dunning_rules')
      .where({ id, organization_id: organizationId })
      .delete();
    if (deleted === 0) throw new NotFoundException('Regra não encontrada');
    return { success: true };
  }

  async seedDefaults(user: AuthUserPayload): Promise<{ created: number }> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureFinance(role);
    const existing = await this.knex('dunning_rules')
      .where({ organization_id: organizationId })
      .first();
    if (existing) return { created: 0 };
    const now = new Date();
    const rows = DEFAULT_RULES.map((r) => ({
      id: randomUUID(),
      organization_id: organizationId,
      name: r.name,
      offset_days: r.offsetDays,
      subject_template: r.subjectTemplate,
      body_template: r.bodyTemplate,
      is_active: true,
      sort_order: r.sortOrder ?? 0,
      created_by: userId,
      created_at: now,
      updated_at: now,
    }));
    await this.knex('dunning_rules').insert(rows);
    return { created: rows.length };
  }

  async listLogs(user: AuthUserPayload) {
    const { organizationId, role } = this.scope(user);
    this.ensureFinance(role);
    return this.knex('dunning_logs as dl')
      .leftJoin('accounts_receivable as ar', 'dl.receivable_id', 'ar.id')
      .leftJoin('dunning_rules as dr', 'dl.rule_id', 'dr.id')
      .where('dl.organization_id', organizationId)
      .select(
        'dl.*',
        { receivable_number: 'ar.reference_number' },
        { customer_name: 'ar.customer_name' },
        { rule_name: 'dr.name' },
      )
      .orderBy('dl.created_at', 'desc')
      .limit(300);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MOTOR DA RÉGUA
  // ═══════════════════════════════════════════════════════════════════════

  /** Disparo manual da régua para a organização do usuário. */
  async runForMyOrg(user: AuthUserPayload): Promise<DunningRunResult> {
    const { organizationId, role } = this.scope(user);
    this.ensureFinance(role);
    return this.runForOrg(organizationId);
  }

  /**
   * Executa a régua para uma organização: para cada conta a receber em aberto,
   * determina o passo de cobrança corrente e envia o e-mail (se ainda não foi
   * enviado). Idempotente via dunning_logs.
   */
  async runForOrg(organizationId: string): Promise<DunningRunResult> {
    const result: DunningRunResult = { scanned: 0, sent: 0, failed: 0, skipped: 0 };

    const rules = await this.knex<DunningRuleRow>('dunning_rules')
      .where({ organization_id: organizationId, is_active: true })
      .orderBy('offset_days', 'asc');
    if (rules.length === 0) return result;

    // Contas a receber em aberto + e-mail do cliente
    const receivables = await this.knex('accounts_receivable as ar')
      .leftJoin('customers as c', 'ar.customer_id', 'c.id')
      .where('ar.organization_id', organizationId)
      .whereIn('ar.status', ['issued', 'partial', 'overdue'])
      .select<
        Array<{
          id: string;
          customer_name: string;
          reference_number: string | null;
          original_amount: string | number;
          outstanding_amount: string | number;
          due_date: Date;
          customer_email: string | null;
        }>
      >(
        'ar.id',
        'ar.customer_name',
        'ar.reference_number',
        'ar.original_amount',
        'ar.outstanding_amount',
        'ar.due_date',
        { customer_email: 'c.email' },
      );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const ar of receivables) {
      result.scanned++;

      const due = new Date(ar.due_date);
      due.setHours(0, 0, 0, 0);
      const daysFromDue = Math.floor((today.getTime() - due.getTime()) / 86400000);

      // Passo corrente = regra de maior offset_days que já "chegou a hora"
      const applicable = rules.filter((r) => r.offset_days <= daysFromDue);
      if (applicable.length === 0) {
        result.skipped++;
        continue;
      }
      const step = applicable.reduce((a, b) => (b.offset_days > a.offset_days ? b : a));

      // Já enviado este passo para esta conta?
      const already = await this.knex('dunning_logs')
        .where({
          organization_id: organizationId,
          receivable_id: ar.id,
          rule_id: step.id,
        })
        .first();
      if (already) {
        result.skipped++;
        continue;
      }

      // Sem e-mail do cliente → registra como skipped (não há para onde enviar)
      if (!ar.customer_email) {
        await this.knex('dunning_logs').insert({
          id: randomUUID(),
          organization_id: organizationId,
          receivable_id: ar.id,
          rule_id: step.id,
          recipient_email: '',
          days_from_due: daysFromDue,
          status: 'skipped',
          detail: 'Cliente sem e-mail cadastrado',
          created_at: new Date(),
        });
        result.skipped++;
        continue;
      }

      const vars = this.buildVars(ar, daysFromDue);
      const subject = this.render(step.subject_template, vars);
      const body = this.render(step.body_template, vars);

      const sendResult = await this.emailService.sendTransactional({
        organizationId,
        to: ar.customer_email,
        subject,
        body,
        referenceType: 'dunning',
        referenceId: ar.id,
      });

      await this.knex('dunning_logs').insert({
        id: randomUUID(),
        organization_id: organizationId,
        receivable_id: ar.id,
        rule_id: step.id,
        recipient_email: ar.customer_email,
        days_from_due: daysFromDue,
        status: sendResult.sent ? 'sent' : 'failed',
        detail: sendResult.reason ?? null,
        sent_email_id: sendResult.emailId,
        created_at: new Date(),
      });

      if (sendResult.sent) result.sent++;
      else result.failed++;
    }

    return result;
  }

  private buildVars(
    ar: {
      customer_name: string;
      reference_number: string | null;
      original_amount: string | number;
      outstanding_amount: string | number;
      due_date: Date;
    },
    daysFromDue: number,
  ): Record<string, string> {
    const fmt = (v: string | number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));
    return {
      customer_name: ar.customer_name,
      doc_number: ar.reference_number ?? 's/ número',
      amount: fmt(ar.original_amount),
      outstanding: fmt(ar.outstanding_amount),
      due_date: new Date(ar.due_date).toLocaleDateString('pt-BR'),
      days_overdue: String(Math.max(0, daysFromDue)),
    };
  }

  private render(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRON DIÁRIO
  // ═══════════════════════════════════════════════════════════════════════

  /** Executa a régua de cobrança para todas as organizações, diariamente. */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async dailyDunning(): Promise<void> {
    try {
      const orgs = await this.knex('organizations').select<Array<{ id: string }>>('id');
      let totalSent = 0;
      for (const org of orgs) {
        const r = await this.runForOrg(org.id);
        totalSent += r.sent;
      }
      if (totalSent > 0) {
        this.logger.log(`Régua de cobrança: ${totalSent} e-mail(s) enviado(s).`);
      }
    } catch (err) {
      this.logger.error(
        `Falha no cron de cobrança: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
