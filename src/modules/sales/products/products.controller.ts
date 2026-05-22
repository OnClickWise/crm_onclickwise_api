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
import { SalesProductsService } from './products.service';
import { CreateProductDto, StockMovementDto, UpdateProductDto } from './dtos/product.dto';
import type { ProductType } from './dtos/product.dto';
import { StockReservationsService } from '../stock/stock-reservations.service';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('sales/products')
@UseGuards(JwtAuthGuard)
export class SalesProductsController {
  constructor(
    private readonly service: SalesProductsService,
    private readonly reservations: StockReservationsService,
  ) {}

  @Get(':id/availability')
  async availability(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    // Garante que produto pertence à org
    await this.service.getById(id, req.user);
    return this.reservations.getAvailable(id, req.user.organizationId);
  }

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('query') query?: string,
    @Query('type') type?: ProductType,
    @Query('activeOnly', new DefaultValuePipe(true), ParseBoolPipe) activeOnly?: boolean,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(req.user, {
      query,
      type,
      activeOnly,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreateProductDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProductDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }

  @Post(':id/stock-adjust')
  adjustStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StockMovementDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.adjustStock(id, body, req.user);
  }
}
