import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { BillingPlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dtos/plan.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('billing/plans')
@UseGuards(JwtAuthGuard)
export class BillingPlansController {
  constructor(private readonly service: BillingPlansService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('activeOnly', new DefaultValuePipe(false), ParseBoolPipe) activeOnly?: boolean,
  ) {
    return this.service.list(req.user, activeOnly);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreatePlanDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePlanDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}
