import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { GetLandingPageConfigUseCase } from '@/use-cases/landing-pages/get-landing-page-config.useCase';
import { SubmitPublicLandingLeadUseCase } from '@/use-cases/landing-pages/submit-public-landing-lead.useCase';
import { PublicLandingLeadDto } from './dtos/public-landing-lead.dto';

@Controller('landing-pages')
export class LandingPagesController {
  constructor(
    private readonly getLandingPageConfigUseCase: GetLandingPageConfigUseCase,
    private readonly submitPublicLandingLeadUseCase: SubmitPublicLandingLeadUseCase,
  ) {}

  @Get(':slug/config')
  getConfig(@Param('slug') slug: string) {
    return this.getLandingPageConfigUseCase.execute(slug);
  }

  @Post(':slug/leads')
  createLead(@Param('slug') slug: string, @Body() body: PublicLandingLeadDto) {
    return this.submitPublicLandingLeadUseCase.execute(slug, body);
  }
}
