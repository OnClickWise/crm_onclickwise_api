import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { FinancialFlowService } from './services/financial-flow.service';

@Controller('financial-flows')
export class FinancialFlowController {
  constructor(private readonly financialFlowService: FinancialFlowService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    return this.financialFlowService.createFlow(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Request() req: any) {
    return this.financialFlowService.listFlows(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.financialFlowService.updateFlow(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.financialFlowService.deleteFlow(id, req.user);
  }
}