import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { DunningService } from './dunning.service';
import { CreateDunningRuleDto, UpdateDunningRuleDto } from './dtos/dunning.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('finance/dunning')
@UseGuards(JwtAuthGuard)
export class DunningController {
  constructor(private readonly service: DunningService) {}

  @Get('rules')
  listRules(@Req() req: AuthRequest) {
    return this.service.listRules(req.user);
  }

  @Post('rules')
  createRule(@Body() body: CreateDunningRuleDto, @Req() req: AuthRequest) {
    return this.service.createRule(body, req.user);
  }

  @Patch('rules/:id')
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDunningRuleDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateRule(id, body, req.user);
  }

  @Delete('rules/:id')
  removeRule(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.removeRule(id, req.user);
  }

  @Post('rules/seed-defaults')
  seedDefaults(@Req() req: AuthRequest) {
    return this.service.seedDefaults(req.user);
  }

  /** Dispara a régua manualmente (além do cron diário). */
  @Post('run')
  run(@Req() req: AuthRequest) {
    return this.service.runForMyOrg(req.user);
  }

  @Get('logs')
  logs(@Req() req: AuthRequest) {
    return this.service.listLogs(req.user);
  }
}
