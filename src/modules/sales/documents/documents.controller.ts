import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { SalesDocumentsService } from './documents.service';
import { SalesPaymentsService } from '../payments/sales-payments.service';
import { SalesDocumentPdfService } from '../../communications/pdf/sales-document-pdf.service';
import { EmailService } from '../../communications/email/email.service';
import { SendDocumentEmailDto } from '../../communications/email/dtos/email.dto';
import {
  ChangeStatusDto,
  ConvertDocumentDto,
  CreateDocumentDto,
  UpdateDocumentDto,
} from './dtos/document.dto';
import type { DocStatus, DocType } from './dtos/document.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('sales/documents')
@UseGuards(JwtAuthGuard)
export class SalesDocumentsController {
  constructor(
    private readonly service: SalesDocumentsService,
    private readonly paymentsService: SalesPaymentsService,
    private readonly pdfService: SalesDocumentPdfService,
    private readonly emailService: EmailService,
  ) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('docType') docType?: DocType,
    @Query('status') status?: DocStatus,
    @Query('customerId') customerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('query') query?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(req.user, {
      docType,
      status,
      customerId,
      from,
      to,
      query,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('customer/:customerId/statement')
  statement(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.customerStatement(customerId, req.user);
  }

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getById(id, req.user);
  }

  @Post()
  create(@Body() body: CreateDocumentDto, @Req() req: AuthRequest) {
    return this.service.create(body, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDocumentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.update(id, body, req.user);
  }

  @Post(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.changeStatus(id, body, req.user);
  }

  /** Sincroniza amount_paid + status do documento a partir da conta a receber. */
  @Post(':id/sync-payments')
  syncPayments(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.paymentsService.syncDocumentPayments(id, req.user);
  }

  /** Bulk: sincroniza pagamentos de todas as faturas da org. */
  @Post('sync-all-payments/run')
  syncAll(@Req() req: AuthRequest) {
    return this.paymentsService.syncAllPayments(req.user);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.duplicate(id, req.user);
  }

  @Post(':id/convert')
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConvertDocumentDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.convert(id, body, req.user);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.remove(id, req.user);
  }

  // ─── PDF + Email ─────────────────────────────────────────────────────

  /**
   * Gera PDF profissional do documento e retorna como stream/download.
   * Header `Content-Disposition: attachment` força download no navegador.
   */
  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const { buffer, fileName } = await this.pdfService.generate(id, req.user);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  /** Envia documento por email (com PDF anexo por padrão). */
  @Post(':id/email')
  sendEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendDocumentEmailDto,
    @Req() req: AuthRequest,
  ) {
    return this.emailService.sendSalesDocument(id, body, req.user);
  }

  /** Histórico de emails enviados deste documento (auditoria). */
  @Get(':id/email-history')
  emailHistory(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.emailService.listSentForDocument(id, req.user);
  }
}
