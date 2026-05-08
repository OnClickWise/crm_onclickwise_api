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
import { BankReconciliationService } from './bank-reconciliation.service';
import { ImportStatementDto, ReconcileLineDto } from './dtos/import-statement.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('finance/reconciliation')
@UseGuards(JwtAuthGuard)
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  @Post('import')
  importStatement(@Body() body: ImportStatementDto, @Req() req: AuthRequest) {
    return this.service.importStatement(body, req.user);
  }

  @Get('statements')
  listStatements(
    @Req() req: AuthRequest,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listStatements(req.user, { bankAccountId, status });
  }

  @Get('statements/:id')
  getStatementLines(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.getStatementLines(id, req.user);
  }

  @Delete('statements/:id')
  deleteStatement(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.deleteStatement(id, req.user);
  }

  @Get('statements/:id/suggestions')
  suggestMatches(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.service.suggestMatches(id, req.user);
  }

  @Post('statements/:id/reconcile')
  reconcile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { decisions: ReconcileLineDto[] },
    @Req() req: AuthRequest,
  ) {
    return this.service.reconcile(id, body.decisions ?? [], req.user);
  }
}
