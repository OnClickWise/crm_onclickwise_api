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
import { TaxRatesService } from './tax-rates.service';
import { CreateTaxRateDto } from './dtos/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dtos/update-tax-rate.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('finance/tax-rates')
@UseGuards(JwtAuthGuard)
export class TaxRatesController {
  constructor(private readonly service: TaxRatesService) {}

  @Post()
  create(@Body() body: CreateTaxRateDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('isActive') isActive?: string,
    @Query('taxType') taxType?: string,
    @Query('country') country?: string,
  ) {
    const normalizedIsActive =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.list(req.user, { isActive: normalizedIsActive, taxType, country });
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTaxRateDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}
