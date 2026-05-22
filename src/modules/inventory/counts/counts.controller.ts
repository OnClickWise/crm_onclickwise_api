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
import { InventoryCountsService } from './counts.service';
import { CreateCountDto, RecordCountDto } from './dtos/count.dto';
import type { CountStatus } from './dtos/count.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('inventory/counts')
@UseGuards(JwtAuthGuard)
export class InventoryCountsController {
  constructor(private readonly service: InventoryCountsService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query('status') status?: CountStatus) {
    return this.service.list(req.user, status);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreateCountDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Post(':id/items/:itemId/count')
  recordItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: RecordCountDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.recordItemCount(id, itemId, body, req.user);
  }

  @Post(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.close(id, req.user);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.cancel(id, req.user);
  }
}
