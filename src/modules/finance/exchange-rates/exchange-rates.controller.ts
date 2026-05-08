import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseFloatPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ExchangeRatesService } from './exchange-rates.service';
import { CreateExchangeRateDto } from './dtos/create-exchange-rate.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('finance/exchange-rates')
@UseGuards(JwtAuthGuard)
export class ExchangeRatesController {
  constructor(private readonly service: ExchangeRatesService) {}

  @Post()
  create(@Body() body: CreateExchangeRateDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('fromCurrency') fromCurrency?: string,
    @Query('toCurrency') toCurrency?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.service.list(req.user, { fromCurrency, toCurrency, from, to, limit });
  }

  @Get('convert')
  convert(
    @Req() req: AuthRequest,
    @Query('amount', ParseFloatPipe) amount: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('date') date: string,
  ) {
    return this.service.convert(req.user, amount, from, to, date);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}
