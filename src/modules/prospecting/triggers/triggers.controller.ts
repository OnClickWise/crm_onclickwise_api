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
import { ProspectingTriggersService } from './triggers.service';
import {
  CreateManualEventDto,
  CreateTriggerDto,
  UpdateEventStatusDto,
  UpdateTriggerDto,
} from './dtos/trigger.dto';
import type { EventStatus, TriggerStatus } from './dtos/trigger.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('prospecting/triggers')
@UseGuards(JwtAuthGuard)
export class ProspectingTriggersController {
  constructor(private readonly service: ProspectingTriggersService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query('status') status?: TriggerStatus) {
    return this.service.list(req.user, status);
  }

  @Get('events')
  listEvents(
    @Req() req: AuthRequest,
    @Query('status') status?: EventStatus,
    @Query('triggerId') triggerId?: string,
  ) {
    return this.service.listEvents(req.user, { status, triggerId });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreateTriggerDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTriggerDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }

  /** Roda o check manual do gatilho (gera eventos se houver matches). */
  @Post(':id/check')
  runCheck(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.runCheck(id, req.user);
  }

  /** Cria evento manual (cliente pode usar via UI). */
  @Post(':id/events')
  createEvent(
    @Param('id', ParseUUIDPipe) triggerId: string,
    @Body() body: CreateManualEventDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.createManualEvent(triggerId, body, req.user);
  }

  @Patch('events/:eventId/status')
  updateEventStatus(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: UpdateEventStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateEventStatus(eventId, body, req.user);
  }
}
