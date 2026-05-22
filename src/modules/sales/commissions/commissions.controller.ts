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
import { SalesCommissionsService } from './commissions.service';
import {
  CreateCommissionDto,
  UpdateCommissionStatusDto,
} from './dtos/commission.dto';
import type { CommissionStatus } from './dtos/commission.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('sales/commissions')
@UseGuards(JwtAuthGuard)
export class SalesCommissionsController {
  constructor(private readonly service: SalesCommissionsService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('status') status?: CommissionStatus,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.list(req.user, { status, userId, from, to });
  }

  @Get('summary')
  summary(@Req() req: AuthRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.summaryByUser(req.user, { from, to });
  }

  @Post()
  create(@Body() body: CreateCommissionDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCommissionStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.updateStatus(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}
