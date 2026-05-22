import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ApprovalRequestsService } from './requests.service';
import { DecideRequestDto } from './dtos/request.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('approvals/requests')
@UseGuards(JwtAuthGuard)
export class ApprovalRequestsController {
  constructor(private readonly service: ApprovalRequestsService) {}

  /** Inbox do aprovador: requests pendentes onde ele é elegível. */
  @Get('inbox')
  myInbox(@Req() req: AuthRequest) {
    return this.service.myInbox(req.user);
  }

  /** Listagem completa (admin). */
  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('status') status?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.service.list(req.user, { status, entityType });
  }

  /** Busca o request mais recente vinculado a uma entidade específica. */
  @Get('by-entity/:entityType/:entityId')
  byEntity(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.getByEntity(entityType, entityId, req.user);
  }

  @Post(':id/decide')
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecideRequestDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.decide(id, body, req.user);
  }
}
