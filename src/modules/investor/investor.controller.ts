import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { InvestorService } from './services/investor.service';

@Controller('investors')
export class InvestorController {
  constructor(private readonly investorService: InvestorService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.investorService.createInvestor(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Request() req: any) {
    return this.investorService.listInvestors(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.investorService.getInvestorById(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.investorService.updateInvestor(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.investorService.deleteInvestor(id, req.user);
  }
}
