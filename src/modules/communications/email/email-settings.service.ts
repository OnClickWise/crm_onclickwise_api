import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import * as nodemailer from 'nodemailer';
import { TestSmtpDto, UpsertEmailSettingsDto } from './dtos/email.dto';

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

const ADMIN_ROLES = ['master', 'admin', 'manager'] as const;

export interface EmailSettingsRow {
  id: string;
  organization_id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password: string;
  is_encrypted: boolean;
  from_email: string;
  from_name: string;
  reply_to: string | null;
  bcc: string | null;
  is_active: boolean;
  last_test_at: Date | null;
  last_test_result: string | null;
}

@Injectable()
export class EmailSettingsService {
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
  private ensureAdmin(role: string) {
    if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]))
      throw new ForbiddenException('Sem permissão para configurar email');
  }

  /** Para UI — esconde a senha. */
  async get(user: AuthUserPayload): Promise<Omit<EmailSettingsRow, 'smtp_password'> | null> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);
    const row = await this.knex<EmailSettingsRow>('organization_email_settings')
      .where({ organization_id: organizationId })
      .first();
    if (!row) return null;
    const { smtp_password: _omit, ...safe } = row;
    void _omit;
    return safe;
  }

  /** Uso interno (EmailService) — retorna tudo incluindo senha. */
  async getForOrg(organizationId: string): Promise<EmailSettingsRow | null> {
    const row = await this.knex<EmailSettingsRow>('organization_email_settings')
      .where({ organization_id: organizationId, is_active: true })
      .first();
    return row ?? null;
  }

  async upsert(
    dto: UpsertEmailSettingsDto,
    user: AuthUserPayload,
  ): Promise<Omit<EmailSettingsRow, 'smtp_password'>> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    const existing = await this.knex('organization_email_settings')
      .where({ organization_id: organizationId })
      .first();

    const payload = {
      smtp_host: dto.smtpHost,
      smtp_port: dto.smtpPort,
      smtp_secure: dto.smtpSecure ?? false,
      smtp_user: dto.smtpUser,
      smtp_password: dto.smtpPassword,
      is_encrypted: false, // MVP — KMS depois
      from_email: dto.fromEmail,
      from_name: dto.fromName,
      reply_to: dto.replyTo ?? null,
      bcc: dto.bcc ?? null,
      is_active: dto.isActive ?? true,
      updated_at: new Date(),
    };

    if (existing) {
      await this.knex('organization_email_settings')
        .where({ organization_id: organizationId })
        .update(payload);
    } else {
      await this.knex('organization_email_settings').insert({
        id: randomUUID(),
        organization_id: organizationId,
        ...payload,
        created_at: new Date(),
      });
    }

    return (await this.get(user)) as Omit<EmailSettingsRow, 'smtp_password'>;
  }

  /** Testa SMTP enviando email simples ao endereço fornecido. */
  async test(dto: TestSmtpDto, user: AuthUserPayload): Promise<{ success: boolean; message: string }> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    const settings = await this.knex<EmailSettingsRow>('organization_email_settings')
      .where({ organization_id: organizationId })
      .first();
    if (!settings) throw new NotFoundException('Configure o SMTP primeiro');

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_secure,
      auth: { user: settings.smtp_user, pass: settings.smtp_password },
    });

    try {
      await transporter.verify();
      await transporter.sendMail({
        from: `"${settings.from_name}" <${settings.from_email}>`,
        to: dto.testRecipient,
        subject: 'Teste de configuração SMTP — OnClickWise',
        text: `Olá! Este é um email de teste enviado a partir das configurações de SMTP da sua organização.\n\nSe você está lendo isto, o SMTP está funcionando corretamente. ✅\n\n— OnClickWise`,
      });

      await this.knex('organization_email_settings')
        .where({ organization_id: organizationId })
        .update({
          last_test_at: new Date(),
          last_test_result: 'Sucesso',
        });
      return { success: true, message: `Email de teste enviado para ${dto.testRecipient}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      await this.knex('organization_email_settings')
        .where({ organization_id: organizationId })
        .update({
          last_test_at: new Date(),
          last_test_result: `Falha: ${msg}`,
        });
      return { success: false, message: msg };
    }
  }
}
