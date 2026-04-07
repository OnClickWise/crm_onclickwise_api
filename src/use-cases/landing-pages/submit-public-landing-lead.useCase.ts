import { Injectable } from '@nestjs/common';
import { OrganizationService } from '@/modules/organization/organization.service';
import { CreateLeadUseCase } from '@/use-cases/leads/createLead.useCase';
import { PublicLandingLeadDto } from '@/modules/landing-pages/dtos/public-landing-lead.dto';

@Injectable()
export class SubmitPublicLandingLeadUseCase {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly createLeadUseCase: CreateLeadUseCase,
  ) {}

  async execute(slug: string, data: PublicLandingLeadDto) {
    const organization = await this.organizationService.findBySlug(slug);

    const { lead } = await this.createLeadUseCase.execute(organization.id, {
      ...data,
      organization_id: organization.id,
      source: data.source ?? `landing:${slug}`,
    });

    return {
      success: true,
      organization: {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
      },
      lead,
    };
  }
}
