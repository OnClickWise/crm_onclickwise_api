import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { AllocationsService } from './allocations.service';
import { AllocatePaymentDto } from './dtos/create-allocation.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('finance/allocations')
@UseGuards(JwtAuthGuard)
export class AllocationsController {
  constructor(private readonly service: AllocationsService) {}

  @Post()
  allocate(@Body() body: AllocatePaymentDto, @Req() req: AuthRequest) {
    return this.service.allocate(body, req.user);
  }

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('paymentKind') paymentKind?: string,
    @Query('paymentId') paymentId?: string,
    @Query('invoiceKind') invoiceKind?: string,
    @Query('invoiceId') invoiceId?: string,
  ) {
    if (paymentKind && paymentId) {
      if (paymentKind !== 'receivable' && paymentKind !== 'payable') {
        throw new Error('paymentKind deve ser receivable ou payable');
      }
      return this.service.listForPayment(paymentKind, paymentId, req.user);
    }
    if (invoiceKind && invoiceId) {
      if (invoiceKind !== 'receivable' && invoiceKind !== 'payable') {
        throw new Error('invoiceKind deve ser receivable ou payable');
      }
      return this.service.listForInvoice(invoiceKind, invoiceId, req.user);
    }
    return [];
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}
