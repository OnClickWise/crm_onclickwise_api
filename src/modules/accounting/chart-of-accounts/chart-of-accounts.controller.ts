import { Body, Controller, DefaultValuePipe, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { CreateChartAccountDto } from './dtos/create-chart-account.dto';
import { UpdateChartAccountDto } from './dtos/update-chart-account.dto';

@Controller('accounting/chart-of-accounts')
@UseGuards(JwtAuthGuard)
export class ChartOfAccountsController {
  constructor(private readonly chartOfAccountsService: ChartOfAccountsService) {}

  @Post()
  create(@Body() body: CreateChartAccountDto, @Req() req: any) {
    return this.chartOfAccountsService.create(body, req.user);
  }

  @Get()
  list(
    @Req() req: any,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('accountType') accountType?: string,
    @Query('isActive') isActive?: string,
    @Query('query') query?: string,
  ) {
    const normalizedIsActive =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;

    return this.chartOfAccountsService.list(req.user, { limit, accountType, isActive: normalizedIsActive, query });
  }

  @Get(':id')
  getById(@Param('id') id: string, @Req() req: any) {
    return this.chartOfAccountsService.getById(id, req.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateChartAccountDto, @Req() req: any) {
    return this.chartOfAccountsService.update(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.chartOfAccountsService.remove(id, req.user);
  }
}