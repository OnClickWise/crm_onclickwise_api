import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { PurchaseDocumentsService } from './documents.service';
import { PurchasePaymentsService } from '../payments/purchase-payments.service';
import {
  ChangePurchaseStatusDto,
  ConvertPurchaseDto,
  CreatePurchaseDocumentDto,
  UpdatePurchaseDocumentDto,
} from './dtos/purchase-document.dto';
import type { PurchaseDocStatus, PurchaseDocType } from './dtos/purchase-document.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('purchases/documents')
@UseGuards(JwtAuthGuard)
export class PurchaseDocumentsController {
  constructor(
    private readonly service: PurchaseDocumentsService,
    private readonly paymentsService: PurchasePaymentsService,
  ) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('docType') docType?: PurchaseDocType,
    @Query('status') status?: PurchaseDocStatus,
    @Query('supplierId') supplierId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('query') query?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(req.user, {
      docType,
      status,
      supplierId,
      from,
      to,
      query,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('supplier/:supplierId/statement')
  statement(
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.supplierStatement(supplierId, req.user);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreatePurchaseDocumentDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePurchaseDocumentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Post(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangePurchaseStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.changeStatus(id, body, req.user);
  }

  @Post(':id/convert')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConvertPurchaseDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.convert(id, body, req.user);
  }

  @Post(':id/sync-payments')
  syncPayments(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.paymentsService.syncDocumentPayments(id, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }
}
