import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CashFlowService } from './cash-flow.service';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('finance/cash-flow')
@UseGuards(JwtAuthGuard)
export class CashFlowController {
  constructor(private readonly service: CashFlowService) {}

  /** Projeção de fluxo de caixa para os próximos N meses (default 6). */
  @Get('projection')
  projection(@Req() req: AuthRequest, @Query('months') months?: string) {
    return this.service.project(req.user, months ? Number(months) : 6);
  }
}
