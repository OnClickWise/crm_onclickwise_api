import { Module } from '@nestjs/common';
import { OrganizationModule } from '@/modules/organization/organization.module';
import { LeadsModule } from '@/modules/leads/leads.module';
import { LandingPagesController } from './landing-pages.controller';
import { GetLandingPageConfigUseCase } from '@/use-cases/landing-pages/get-landing-page-config.useCase';
import { SubmitPublicLandingLeadUseCase } from '@/use-cases/landing-pages/submit-public-landing-lead.useCase';

@Module({
  imports: [OrganizationModule, LeadsModule],
  controllers: [LandingPagesController],
  providers: [GetLandingPageConfigUseCase, SubmitPublicLandingLeadUseCase],
})
export class LandingPagesModule {}
