import {
  Body,
  Controller,
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
import { BillingSubscriptionsService } from './subscriptions.service';
import type { SubscriptionStatus } from './subscriptions.service';
import {
  CancelSubscriptionDto,
  ChangePlanDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
} from './dtos/subscription.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('billing/subscriptions')
@UseGuards(JwtAuthGuard)
export class BillingSubscriptionsController {
  constructor(private readonly service: BillingSubscriptionsService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query('status') status?: SubscriptionStatus) {
    return this.service.list(req.user, status);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreateSubscriptionDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSubscriptionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Post(':id/pause')
  pause(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.pause(id, req.user);
  }

  @Post(':id/resume')
  resume(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.resume(id, req.user);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelSubscriptionDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.cancel(id, body, req.user);
  }

  @Post(':id/change-plan')
  changePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangePlanDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.changePlan(id, body, req.user);
  }
}
