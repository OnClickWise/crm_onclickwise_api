import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { BillingGenerationService } from './billing-generation.service';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('billing/generation')
@UseGuards(JwtAuthGuard)
export class BillingGenerationController {
  constructor(private readonly service: BillingGenerationService) {}

  /** Disparo manual da geração (além do cron diário 6h). */
  @Post('run')
  run(@Req() req: AuthRequest) {
    return this.service.runForMyOrg(req.user);
  }
}
