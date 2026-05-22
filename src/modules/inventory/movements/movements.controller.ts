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
import { StockMovementsService } from './movements.service';
import {
  AddTransferItemDto,
  CreateAdjustmentDto,
  CreateTransferDto,
} from './dtos/movement.dto';
import type { MovementType } from './dtos/movement.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class StockMovementsController {
  constructor(private readonly service: StockMovementsService) {}

  // ─── Movements (extrato) ──────────────────────────────────────────────
  @Get('movements')
  listMovements(
    @Req() req: AuthRequest,
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('movementType') movementType?: MovementType,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listMovements(req.user, {
      productId,
      warehouseId,
      movementType,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('products/:productId/balance')
  getBalance(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.getAggregatedBalance(productId, req.user);
  }

  @Post('adjustments')
  createAdjustment(@Body() body: CreateAdjustmentDto, @Req() req: AuthRequest) {
    return this.service.createAdjustment(body, req.user);
  }

  // ─── Transfers ────────────────────────────────────────────────────────
  @Get('transfers')
  listTransfers(@Req() req: AuthRequest, @Query('status') status?: string) {
    return this.service.listTransfers(req.user, status);
  }

  @Get('transfers/:id')
  getTransfer(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getTransfer(id, req.user);
  }

  @Post('transfers')
  createTransfer(@Body() body: CreateTransferDto, @Req() req: AuthRequest) {
    return this.service.createTransfer(body, req.user);
  }

  @Post('transfers/:id/items')
  addTransferItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddTransferItemDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.addTransferItem(id, body, req.user);
  }

  @Post('transfers/:id/confirm')
  confirmTransfer(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.confirmTransfer(id, req.user);
  }
}
