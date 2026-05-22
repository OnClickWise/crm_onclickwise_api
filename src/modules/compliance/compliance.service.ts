import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { AuditService } from '../audit/audit.service';

interface AuthScope {
  organizationId: string;
  userId: string;
  role: string;
}
interface AuthUserPayload {
  organizationId?: string;
  userId?: string;
  role?: string;
  name?: string;
}

const EXPORT_ROLES = ['master', 'admin', 'accountant'] as const;
const ANONYMIZE_ROLES = ['master', 'admin'] as const;

/**
 * Compliance LGPD/GDPR.
 *
 *  - `exportDataSubject`: reúne TODOS os dados de um titular (cliente) em
 *    um JSON estruturado — atende ao direito de acesso/portabilidade.
 *
 *  - `anonymizeDataSubject`: remove os dados pessoais identificáveis do
 *    cliente (direito ao esquecimento), preservando os registros
 *    transacionais/fiscais (faturas, contas a receber) — exigência legal
 *    de retenção contábil. O vínculo continua via ID, mas sem PII.
 */
@Injectable()
export class ComplianceService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly auditService: AuditService,
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

  /** Exporta todos os dados de um titular (cliente) em JSON. */
  async exportDataSubject(customerId: string, user: AuthUserPayload) {
    const { organizationId, userId, role } = this.scope(user);
    if (!EXPORT_ROLES.includes(role as (typeof EXPORT_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para exportar dados de titular');

    const customer = await this.knex('customers')
      .where({ id: customerId, organization_id: organizationId })
      .first();
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const salesDocuments = await this.knex('sales_documents')
      .where({ organization_id: organizationId, customer_id: customerId })
      .orderBy('issue_date', 'desc');

    const accountsReceivable = await this.knex('accounts_receivable')
      .where({ organization_id: organizationId, customer_id: customerId })
      .orderBy('issue_date', 'desc');

    const auditTrail = await this.knex('audit_logs')
      .where({ organization_id: organizationId, entity_id: customerId })
      .orderBy('created_at', 'desc')
      .limit(500);

    // Registra a exportação na auditoria (a própria exportação é um evento sensível)
    await this.auditService.record({
      organizationId,
      userId,
      userName: user?.name ?? null,
      userRole: role,
      action: 'export',
      entityType: 'compliance/data-subject',
      entityId: customerId,
      changes: { exportedSections: ['customer', 'salesDocuments', 'accountsReceivable', 'auditTrail'] },
    });

    return {
      generatedAt: new Date().toISOString(),
      dataSubject: customer,
      relatedData: {
        salesDocuments,
        accountsReceivable,
      },
      auditTrail,
      meta: {
        salesDocumentsCount: salesDocuments.length,
        accountsReceivableCount: accountsReceivable.length,
        note: 'Documento gerado em conformidade com LGPD (art. 18) / GDPR (art. 15 e 20).',
      },
    };
  }

  /** Anonimiza os dados pessoais de um cliente (direito ao esquecimento). */
  async anonymizeDataSubject(
    customerId: string,
    user: AuthUserPayload,
  ): Promise<{ success: boolean; alreadyAnonymized: boolean }> {
    const { organizationId, userId, role } = this.scope(user);
    if (!ANONYMIZE_ROLES.includes(role as (typeof ANONYMIZE_ROLES)[number]))
      throw new ForbiddenException('Apenas master/admin podem anonimizar titulares');

    const customer = await this.knex('customers')
      .where({ id: customerId, organization_id: organizationId })
      .first<{ id: string; is_anonymized: boolean } | undefined>();
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    if (customer.is_anonymized) {
      return { success: true, alreadyAnonymized: true };
    }

    const shortId = customerId.slice(0, 8);
    const now = new Date();

    await this.knex.transaction(async (trx) => {
      await trx('customers')
        .where({ id: customerId, organization_id: organizationId })
        .update({
          name: `[ANONIMIZADO ${shortId}]`,
          legal_name: null,
          tax_id: null,
          tax_id_type: null,
          email: null,
          phone: null,
          mobile: null,
          website: null,
          address_line1: null,
          address_line2: null,
          city: null,
          state: null,
          postal_code: null,
          notes: null,
          is_anonymized: true,
          anonymized_at: now,
          updated_by: userId,
          updated_at: now,
        });

      // Atualiza o snapshot do nome do cliente em documentos para não vazar PII
      await trx('accounts_receivable')
        .where({ organization_id: organizationId, customer_id: customerId })
        .update({ customer_name: `[ANONIMIZADO ${shortId}]`, updated_at: now });
    });

    await this.auditService.record({
      organizationId,
      userId,
      userName: user?.name ?? null,
      userRole: role,
      action: 'anonymize',
      entityType: 'compliance/data-subject',
      entityId: customerId,
      changes: { note: 'Dados pessoais anonimizados; registros fiscais preservados.' },
    });

    return { success: true, alreadyAnonymized: false };
  }
}
