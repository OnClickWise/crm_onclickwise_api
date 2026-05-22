import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { AuditService } from './audit.service';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly service: AuditService) {}

  /** Lista paginada da trilha de auditoria, com filtros. */
  @Get('logs')
  list(
    @Req() req: AuthRequest,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list(req.user, {
      action,
      entityType,
      entityId,
      userId,
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /** Trilha completa de uma entidade específica. */
  @Get('logs/entity/:entityType/:entityId')
  forEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.listForEntity(req.user, entityType, entityId);
  }
}
