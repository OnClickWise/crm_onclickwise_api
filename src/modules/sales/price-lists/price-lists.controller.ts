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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { SalesPriceListsService } from './price-lists.service';
import {
  CreatePriceListDto,
  UpdatePriceListDto,
  UpsertPriceListItemDto,
} from './dtos/price-list.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('sales/price-lists')
@UseGuards(JwtAuthGuard)
export class SalesPriceListsController {
  constructor(private readonly service: SalesPriceListsService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('activeOnly', new DefaultValuePipe(true), ParseBoolPipe) activeOnly?: boolean,
  ) {
    return this.service.list(req.user, { activeOnly });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreatePriceListDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePriceListDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }

  @Put(':id/items')
  upsertItem(
    @Param('id', ParseUUIDPipe) priceListId: string,
    @Body() body: UpsertPriceListItemDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.upsertItem(priceListId, body, req.user);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseUUIDPipe) priceListId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.removeItem(priceListId, itemId, req.user);
  }
}
