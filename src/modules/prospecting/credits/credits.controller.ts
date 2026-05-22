import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ProspectingCreditsService } from './credits.service';
import { ApolloApiClient } from '../apollo/apollo-api.client';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('prospecting/credits')
@UseGuards(JwtAuthGuard)
export class ProspectingCreditsController {
  constructor(
    private readonly service: ProspectingCreditsService,
    private readonly apollo: ApolloApiClient,
  ) {}

  @Get()
  overview(@Req() req: AuthRequest) {
    return this.service.getOverview(req.user);
  }

  @Put('quota')
  setQuota(@Body() body: { monthlyQuota: number }, @Req() req: AuthRequest) {
    return this.service.setQuota(req.user, Number(body.monthlyQuota));
  }

  /**
   * Diagnóstico — verifica se APOLLO_API_KEY funciona e qual é o problema se 401/403.
   * Endpoint público (precisa só do JWT, não consome crédito).
   * GET /api/prospecting/credits/health
   */
  @Get('health')
  health() {
    return this.apollo.healthCheck();
  }
}
