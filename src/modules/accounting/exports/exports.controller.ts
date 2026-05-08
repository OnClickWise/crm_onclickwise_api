import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { ExportsService } from './exports.service';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

/**
 * Endpoints de export retornam text/csv com header Content-Disposition
 * para download direto pelo navegador.
 */
@Controller('accounting/exports')
@UseGuards(JwtAuthGuard)
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  private send(res: FastifyReply, csv: string, filename: string) {
    return res
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Cache-Control', 'no-store')
      .send(csv);
  }

  @Get('chart-of-accounts.csv')
  async chartOfAccounts(@Req() req: AuthRequest, @Res() res: FastifyReply) {
    const csv = await this.service.exportChartOfAccounts(req.user);
    return this.send(res, csv, `plano-de-contas-${this.today()}.csv`);
  }

  @Get('journal-entries.csv')
  async journalEntries(
    @Req() req: AuthRequest,
    @Res() res: FastifyReply,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const csv = await this.service.exportJournalEntries(req.user, { startDate, endDate });
    return this.send(res, csv, `lancamentos-${startDate}-${endDate}.csv`);
  }

  @Get('balancete.csv')
  async balancete(
    @Req() req: AuthRequest,
    @Res() res: FastifyReply,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('accountType') accountType?: string,
  ) {
    const csv = await this.service.exportBalancete(req.user, { startDate, endDate, accountType });
    return this.send(res, csv, `balancete-${startDate}-${endDate}.csv`);
  }

  @Get('dre.csv')
  async dre(
    @Req() req: AuthRequest,
    @Res() res: FastifyReply,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const csv = await this.service.exportDre(req.user, { startDate, endDate });
    return this.send(res, csv, `dre-${startDate}-${endDate}.csv`);
  }

  @Get('balanco.csv')
  async balanco(
    @Req() req: AuthRequest,
    @Res() res: FastifyReply,
    @Query('referenceDate') referenceDate: string,
  ) {
    const csv = await this.service.exportBalanco(req.user, { referenceDate });
    return this.send(res, csv, `balanco-${referenceDate}.csv`);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
