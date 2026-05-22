import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ApprovalRulesService } from './rules.service';
import { CreateRuleDto, UpdateRuleDto } from './dtos/rule.dto';
import type { ApprovalEntityType } from './dtos/rule.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('approvals/rules')
@UseGuards(JwtAuthGuard)
export class ApprovalRulesController {
  constructor(private readonly service: ApprovalRulesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query('entityType') entityType?: ApprovalEntityType) {
    return this.service.list(req.user, entityType);
  }

  @Post()
  create(@Body() body: CreateRuleDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRuleDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}
