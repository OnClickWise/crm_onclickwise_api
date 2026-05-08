import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { FinanceConfigService } from './finance-config.service';
import { UpdateFinanceConfigDto } from './dtos/update-finance-config.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('finance/config')
@UseGuards(JwtAuthGuard)
export class FinanceConfigController {
  constructor(private readonly service: FinanceConfigService) {}

  @Get()
  get(@Req() req: AuthRequest) {
    return this.service.get(req.user);
  }

  @Put()
  update(@Body() body: UpdateFinanceConfigDto, @Req() req: AuthRequest) {
    return this.service.update(body, req.user);
  }
}
