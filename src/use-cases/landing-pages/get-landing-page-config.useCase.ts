import { Injectable } from '@nestjs/common';
import { OrganizationService } from '@/modules/organization/organization.service';

@Injectable()
export class GetLandingPageConfigUseCase {
  constructor(private readonly organizationService: OrganizationService) {}

  async execute(slug: string) {
    const organization = await this.organizationService.findBySlug(slug);

    return {
      success: true,
      landing: {
        slug: organization.slug,
        name: organization.name,
        organization_id: organization.id,
        logo_url: organization.logo_url ?? null,
        primary_color: organization.primary_color ?? null,
        secondary_color: organization.secondary_color ?? null,
        email: organization.email ?? null,
        phone: organization.phone ?? null,
      },
    };
  }
}
