import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { AccountsReceivableService } from './services/accounts-receivable.service';
import { CreateReceivableDto, UpdateReceivableDto, RecordPaymentDto } from './dtos/create-receivable.dto';

@Controller('finance/accounts-receivable')
@UseGuards(JwtAuthGuard)
export class AccountsReceivableController {
  constructor(private readonly arService: AccountsReceivableService) {}

  @Post()
  async create(@Body() dto: CreateReceivableDto, @Request() req: any) {
    return this.arService.createReceivable(dto, req.user);
  }

  @Get()
  async list(
    @Request() req: any,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.arService.listReceivables(req.user, limit);
  }

  @Get('status/:status')
  async listByStatus(@Param('status') status: string, @Request() req: any) {
    return this.arService.getReceivablesByStatus(status, req.user);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.arService.getReceivable(id, req.user);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateReceivableDto, @Request() req: any) {
    return this.arService.updateReceivable(id, dto, req.user);
  }

  @Post(':id/payments')
  async recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto, @Request() req: any) {
    return this.arService.recordPayment(id, dto, req.user);
  }

  @Get(':id/payments')
  async getPayments(@Param('id') id: string, @Request() req: any) {
    return this.arService.listPayments(id, req.user);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.arService.deleteReceivable(id, req.user);
  }
}
