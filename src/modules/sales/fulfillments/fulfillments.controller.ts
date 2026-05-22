import {
  Body,
  Controller,
  DefaultValuePipe,
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
import { SalesFulfillmentsService } from './fulfillments.service';
import {
  AssignFulfillmentDto,
  CancelFulfillmentDto,
  PackFulfillmentDto,
  RecordPickDto,
  ShipFulfillmentDto,
  UpdateFulfillmentDto,
} from './dtos/fulfillment.dto';
import type {
  FulfillmentPriority,
  FulfillmentStatus,
} from './dtos/fulfillment.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('sales/fulfillments')
@UseGuards(JwtAuthGuard)
export class SalesFulfillmentsController {
  constructor(private readonly service: SalesFulfillmentsService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('status') status?: FulfillmentStatus,
    @Query('priority') priority?: FulfillmentPriority,
    @Query('assignedToMe', new DefaultValuePipe(false), ParseBoolPipe) assignedToMe?: boolean,
  ) {
    return this.service.list(req.user, { status, priority, assignedToMe });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateFulfillmentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Post(':id/assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignFulfillmentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.assign(id, body, req.user);
  }

  @Post(':id/start')
  start(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.startPicking(id, req.user);
  }

  @Post(':id/items/:itemId/pick')
  recordPick(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: RecordPickDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.recordPick(id, itemId, body, req.user);
  }

  @Post(':id/pack')
  pack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PackFulfillmentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.pack(id, body, req.user);
  }

  @Post(':id/ship')
  ship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ShipFulfillmentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.ship(id, body, req.user);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CancelFulfillmentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.cancel(id, body, req.user);
  }
}
