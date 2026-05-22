import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { SalesTeamService } from './team.service';

class SetCommissionPctDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  pct?: number | null;
}

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('sales/team')
@UseGuards(JwtAuthGuard)
export class SalesTeamController {
  constructor(private readonly service: SalesTeamService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.service.listTeam(req.user);
  }

  @Put(':userId/commission-pct')
  setPct(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SetCommissionPctDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.setCommissionPct(userId, body.pct ?? null, req.user);
  }
}
