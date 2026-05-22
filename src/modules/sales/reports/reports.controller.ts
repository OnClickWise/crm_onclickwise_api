import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { SalesReportsService } from './reports.service';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('sales/reports')
@UseGuards(JwtAuthGuard)
export class SalesReportsController {
  constructor(private readonly service: SalesReportsService) {}

  @Get('overview')
  overview(
    @Req() req: AuthRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.overview(req.user, { from, to });
  }

  @Get('sales-by-month')
  byMonth(@Req() req: AuthRequest, @Query('months') months?: string) {
    return this.service.salesByMonth(req.user, {
      months: months ? Number(months) : undefined,
    });
  }

  @Get('top-customers')
  topCustomers(
    @Req() req: AuthRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.topCustomers(req.user, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('top-products')
  topProducts(
    @Req() req: AuthRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.topProducts(req.user, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('funnel')
  funnel(@Req() req: AuthRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.funnel(req.user, { from, to });
  }

  @Get('top-sellers')
  topSellers(
    @Req() req: AuthRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.topSellers(req.user, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
