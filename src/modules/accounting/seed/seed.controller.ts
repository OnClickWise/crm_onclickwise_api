import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ChartTemplate, SeedService } from './seed.service';

interface SeedBody {
  template?: ChartTemplate;
}

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('accounting/seed')
@UseGuards(JwtAuthGuard)
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  /**
   * POST /accounting/seed/chart-of-accounts
   * Body opcional: { template?: 'brazil' | 'angola' }
   * Sem body, mantém comportamento legado (template = 'brazil').
   */
  @Post('chart-of-accounts')
  seedChartOfAccounts(@Req() req: AuthRequest, @Body() body?: SeedBody) {
    return this.seedService.seedChartOfAccounts(req.user, body?.template ?? 'brazil');
  }
}
