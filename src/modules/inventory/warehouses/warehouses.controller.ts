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
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dtos/warehouse.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('inventory/warehouses')
@UseGuards(JwtAuthGuard)
export class WarehousesController {
  constructor(private readonly service: WarehousesService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('activeOnly', new DefaultValuePipe(true), ParseBoolPipe) activeOnly?: boolean,
  ) {
    return this.service.list(req.user, activeOnly);
  }

  @Get('default')
  getDefault(@Req() req: AuthRequest) {
    return this.service.getDefault(req.user);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreateWarehouseDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateWarehouseDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}
