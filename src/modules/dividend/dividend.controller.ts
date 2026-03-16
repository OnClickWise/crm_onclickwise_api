import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { DividendService } from './services/dividend.service';

@Controller('dividends')
export class DividendController {
  constructor(private readonly dividendService: DividendService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.dividendService.createDividend(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Request() req: any) {
    return this.dividendService.listDividends(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.dividendService.updateDividend(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.dividendService.deleteDividend(id, req.user);
  }
}