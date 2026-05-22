import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { UpsertBrandingDto } from './dtos/branding.dto';

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

export interface BrandingRow {
  id: string;
  organization_id: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  company_legal_name: string | null;
  company_tax_id: string | null;
  company_tax_id_type: string | null;
  company_address: string | null;
  company_city: string | null;
  company_country: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  document_footer: string | null;
  email_signature: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class BrandingService {
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
      throw new ForbiddenException('Sem permissão para configurar branding');
  }

  async get(user: AuthUserPayload): Promise<BrandingRow | null> {
    const { organizationId } = this.scope(user);
    const row = await this.knex<BrandingRow>('organization_branding')
      .where({ organization_id: organizationId })
      .first();
    return row ?? null;
  }

  /** Acesso interno (PDF/Email services) — não checa role. */
  async getForOrg(organizationId: string): Promise<BrandingRow | null> {
    const row = await this.knex<BrandingRow>('organization_branding')
      .where({ organization_id: organizationId })
      .first();
    return row ?? null;
  }

  async upsert(dto: UpsertBrandingDto, user: AuthUserPayload): Promise<BrandingRow> {
    const { organizationId, role } = this.scope(user);
    this.ensureAdmin(role);

    const existing = await this.knex('organization_branding')
      .where({ organization_id: organizationId })
      .first();

    const payload = {
      ...(dto.logoUrl !== undefined && { logo_url: dto.logoUrl ?? null }),
      ...(dto.primaryColor !== undefined && { primary_color: dto.primaryColor }),
      ...(dto.secondaryColor !== undefined && { secondary_color: dto.secondaryColor }),
      ...(dto.companyLegalName !== undefined && { company_legal_name: dto.companyLegalName ?? null }),
      ...(dto.companyTaxId !== undefined && { company_tax_id: dto.companyTaxId ?? null }),
      ...(dto.companyTaxIdType !== undefined && { company_tax_id_type: dto.companyTaxIdType ?? null }),
      ...(dto.companyAddress !== undefined && { company_address: dto.companyAddress ?? null }),
      ...(dto.companyCity !== undefined && { company_city: dto.companyCity ?? null }),
      ...(dto.companyCountry !== undefined && { company_country: dto.companyCountry ?? null }),
      ...(dto.companyPhone !== undefined && { company_phone: dto.companyPhone ?? null }),
      ...(dto.companyEmail !== undefined && { company_email: dto.companyEmail ?? null }),
      ...(dto.companyWebsite !== undefined && { company_website: dto.companyWebsite ?? null }),
      ...(dto.documentFooter !== undefined && { document_footer: dto.documentFooter ?? null }),
      ...(dto.emailSignature !== undefined && { email_signature: dto.emailSignature ?? null }),
      updated_at: new Date(),
    };

    if (existing) {
      await this.knex('organization_branding')
        .where({ organization_id: organizationId })
        .update(payload);
    } else {
      await this.knex('organization_branding').insert({
        id: randomUUID(),
        organization_id: organizationId,
        ...payload,
        created_at: new Date(),
      });
    }
    return (await this.knex<BrandingRow>('organization_branding')
      .where({ organization_id: organizationId })
      .first()) as BrandingRow;
  }
}
