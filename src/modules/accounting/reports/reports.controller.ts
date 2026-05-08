import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseBoolPipe,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ReportsService } from './reports.service';

@Controller('accounting/reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('livro-diario')
  livroDiario(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.reportsService.livroDiario(req.user, { startDate, endDate, page, limit });
  }

  @Get('livro-razao')
  livroRazao(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('accountId') accountId?: string,
    @Query('limit', new DefaultValuePipe(500), ParseIntPipe) limit?: number,
  ) {
    return this.reportsService.livroRazao(req.user, { startDate, endDate, accountId, limit });
  }

  @Get('balancete')
  balancete(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('accountType') accountType?: string,
    @Query('onlyWithMovements', new DefaultValuePipe(false), ParseBoolPipe)
    onlyWithMovements?: boolean,
  ) {
    return this.reportsService.balancete(req.user, { startDate, endDate, accountType, onlyWithMovements });
  }

  @Get('dre')
  dre(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('comparisonStartDate') comparisonStartDate?: string,
    @Query('comparisonEndDate') comparisonEndDate?: string,
  ) {
    return this.reportsService.dre(req.user, {
      startDate,
      endDate,
      comparisonStartDate,
      comparisonEndDate,
    });
  }

  @Get('balanco')
  balanco(@Req() req: any, @Query('referenceDate') referenceDate: string) {
    return this.reportsService.balanco(req.user, { referenceDate });
  }
}
