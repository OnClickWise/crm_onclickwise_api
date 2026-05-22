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
import * as nodemailer from 'nodemailer';
import { EmailSettingsService } from './email-settings.service';
import { BrandingService } from '../branding/branding.service';
import { SalesDocumentPdfService } from '../pdf/sales-document-pdf.service';
import { SendDocumentEmailDto } from './dtos/email.dto';

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

const WRITE_ROLES = ['master', 'admin', 'sales', 'manager', 'accountant'] as const;

const DOC_TYPE_LABELS: Record<string, string> = {
  quote: 'Orçamento',
  order: 'Encomenda',
  delivery: 'Guia de Remessa',
  invoice: 'Fatura',
  credit_note: 'Nota de Crédito',
  customer_return: 'Devolução de Cliente',
};

export interface SentEmailRow {
  id: string;
  organization_id: string;
  sent_by: string | null;
  reference_type: string | null;
  reference_id: string | null;
  to_email: string;
  cc: string | null;
  bcc: string | null;
  subject: string;
  body: string;
  attachments_meta: Record<string, unknown> | null;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  error_message: string | null;
  smtp_message_id: string | null;
  queued_at: Date;
  sent_at: Date | null;
}

/**
 * Envio de emails transacionais. Hoje suporta:
 *   - sendSalesDocument: envia orçamento/fatura/etc por email com PDF anexo
 *
 * Toda mensagem fica registrada em sent_emails (auditoria ISO 9001).
 */
@Injectable()
export class EmailService {
  constructor(
    @Inject('knex') private readonly knex: Knex,
    private readonly settingsService: EmailSettingsService,
    private readonly brandingService: BrandingService,
    private readonly pdfService: SalesDocumentPdfService,
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
  private ensureWrite(role: string) {
    if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para enviar emails');
  }

  async listSentForDocument(documentId: string, user: AuthUserPayload): Promise<SentEmailRow[]> {
    const { organizationId } = this.scope(user);
    return this.knex<SentEmailRow>('sent_emails')
      .where({
        organization_id: organizationId,
        reference_type: 'sales_document',
        reference_id: documentId,
      })
      .orderBy('queued_at', 'desc');
  }

  async sendSalesDocument(
    documentId: string,
    dto: SendDocumentEmailDto,
    user: AuthUserPayload,
  ): Promise<SentEmailRow> {
    const { organizationId, userId, role } = this.scope(user);
    this.ensureWrite(role);

    const settings = await this.settingsService.getForOrg(organizationId);
    if (!settings)
      throw new BadRequestException(
        'SMTP não configurado para esta organização. Configure em /sales/settings/email.',
      );

    const doc = await this.knex('sales_documents')
      .where({ id: documentId, organization_id: organizationId })
      .first();
    if (!doc) throw new NotFoundException('Documento não encontrado');

    const customer = await this.knex('customers')
      .where({ id: doc.customer_id })
      .first<{ name: string; email: string | null } | undefined>();
    const branding = await this.brandingService.getForOrg(organizationId);

    // Monta assunto + corpo defaults
    const docLabel = DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type;
    const subject = dto.subject ?? `${docLabel} ${doc.doc_number}`;
    const greeting = customer?.name ? `Olá ${customer.name.split(' ')[0]},` : 'Olá,';
    const defaultBody =
      dto.message ??
      `${greeting}\n\nSegue em anexo o ${docLabel.toLowerCase()} ${doc.doc_number}.\n\nEm caso de dúvidas, fique à vontade para responder este email.\n\nObrigado pela preferência!`;

    const signature = branding?.email_signature
      ? `\n\n---\n${branding.email_signature}`
      : `\n\n---\n${branding?.company_legal_name ?? settings.from_name}`;

    const body = `${defaultBody}${signature}`;

    // Gera PDF se solicitado (default: true para faturas/orçamentos)
    const attachPdf = dto.attachPdf ?? true;
    let pdfAttachment: { filename: string; content: Buffer; contentType: string } | undefined;
    if (attachPdf) {
      const { buffer, fileName } = await this.pdfService.generate(documentId, user);
      pdfAttachment = {
        filename: fileName,
        content: buffer,
        contentType: 'application/pdf',
      };
    }

    // Registra no audit log ANTES do envio (status 'queued')
    const emailId = randomUUID();
    const queuedAt = new Date();
    await this.knex('sent_emails').insert({
      id: emailId,
      organization_id: organizationId,
      sent_by: userId,
      reference_type: 'sales_document',
      reference_id: documentId,
      to_email: dto.to.join('; '),
      cc: dto.cc?.join('; ') ?? null,
      bcc: settings.bcc ?? null,
      subject,
      body,
      attachments_meta: pdfAttachment
        ? { filename: pdfAttachment.filename, size: pdfAttachment.content.length }
        : null,
      status: 'queued',
      queued_at: queuedAt,
    });

    // Envia
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_secure,
      auth: { user: settings.smtp_user, pass: settings.smtp_password },
    });

    try {
      await this.knex('sent_emails').where({ id: emailId }).update({ status: 'sending' });

      const info = await transporter.sendMail({
        from: `"${settings.from_name}" <${settings.from_email}>`,
        to: dto.to.join(', '),
        cc: dto.cc?.join(', '),
        bcc: settings.bcc ?? undefined,
        replyTo: settings.reply_to ?? undefined,
        subject,
        text: body,
        attachments: pdfAttachment ? [pdfAttachment] : undefined,
      });

      await this.knex('sent_emails').where({ id: emailId }).update({
        status: 'sent',
        sent_at: new Date(),
        smtp_message_id: info.messageId ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      await this.knex('sent_emails').where({ id: emailId }).update({
        status: 'failed',
        error_message: msg,
      });
      throw new BadRequestException(`Falha no envio: ${msg}`);
    }

    return (await this.knex<SentEmailRow>('sent_emails')
      .where({ id: emailId })
      .first()) as SentEmailRow;
  }

  /**
   * Envio transacional genérico (sem anexo). Usado por módulos como a régua
   * de cobrança. Reusa o SMTP da organização e registra em sent_emails.
   * NÃO lança exceção se o SMTP não estiver configurado — retorna { sent:false }.
   */
  async sendTransactional(input: {
    organizationId: string;
    to: string;
    subject: string;
    body: string;
    userId?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
  }): Promise<{ sent: boolean; reason?: string; emailId: string }> {
    const settings = await this.settingsService.getForOrg(input.organizationId);
    const emailId = randomUUID();
    const now = new Date();

    await this.knex('sent_emails').insert({
      id: emailId,
      organization_id: input.organizationId,
      sent_by: input.userId ?? null,
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      to_email: input.to,
      cc: null,
      bcc: settings?.bcc ?? null,
      subject: input.subject,
      body: input.body,
      attachments_meta: null,
      status: settings ? 'queued' : 'failed',
      error_message: settings ? null : 'SMTP não configurado',
      queued_at: now,
    });

    if (!settings) {
      return { sent: false, reason: 'SMTP não configurado', emailId };
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_secure,
      auth: { user: settings.smtp_user, pass: settings.smtp_password },
    });

    try {
      await this.knex('sent_emails').where({ id: emailId }).update({ status: 'sending' });
      const info = await transporter.sendMail({
        from: `"${settings.from_name}" <${settings.from_email}>`,
        to: input.to,
        bcc: settings.bcc ?? undefined,
        replyTo: settings.reply_to ?? undefined,
        subject: input.subject,
        text: input.body,
      });
      await this.knex('sent_emails').where({ id: emailId }).update({
        status: 'sent',
        sent_at: new Date(),
        smtp_message_id: info.messageId ?? null,
      });
      return { sent: true, emailId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      await this.knex('sent_emails').where({ id: emailId }).update({
        status: 'failed',
        error_message: msg,
      });
      return { sent: false, reason: msg, emailId };
    }
  }
}
