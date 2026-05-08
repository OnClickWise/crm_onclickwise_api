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
import { AccountsPayableService } from './services/accounts-payable.service';
import { CreatePayableDto, UpdatePayableDto, RecordPaymentDto } from './dtos/create-payable.dto';

@Controller('finance/accounts-payable')
@UseGuards(JwtAuthGuard)
export class AccountsPayableController {
  constructor(private readonly apService: AccountsPayableService) {}

  @Post()
  async create(@Body() dto: CreatePayableDto, @Request() req: any) {
    return this.apService.createPayable(dto, req.user);
  }

  @Get()
  async list(
    @Request() req: any,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.apService.listPayables(req.user, limit);
  }

  @Get('status/:status')
  async listByStatus(@Param('status') status: string, @Request() req: any) {
    return this.apService.getPayablesByStatus(status, req.user);
  }

  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    return this.apService.getPayable(id, req.user);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePayableDto, @Request() req: any) {
    return this.apService.updatePayable(id, dto, req.user);
  }

  @Post(':id/payments')
  async recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto, @Request() req: any) {
    return this.apService.recordPayment(id, dto, req.user);
  }

  @Get(':id/payments')
  async getPayments(@Param('id') id: string, @Request() req: any) {
    return this.apService.listPayments(id, req.user);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.apService.deletePayable(id, req.user);
  }
}
