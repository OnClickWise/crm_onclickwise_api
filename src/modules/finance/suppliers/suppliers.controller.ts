import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dtos/create-supplier.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('finance/suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Post()
  create(@Body() body: CreateSupplierDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('isActive') isActive?: string,
    @Query('query') query?: string,
    @Query('country') country?: string,
  ) {
    const normalizedIsActive =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.list(req.user, { isActive: normalizedIsActive, query, country, limit });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSupplierDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}
