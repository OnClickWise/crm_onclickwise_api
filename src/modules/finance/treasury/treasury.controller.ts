import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { TreasuryService } from './treasury.service';
import { CreateBankAccountDto } from './dtos/create-bank-account.dto';
import { UpdateBankAccountDto } from './dtos/update-bank-account.dto';
import {
  CreateCashMovementDto,
  CreateTransferDto,
} from './dtos/cash-movement.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('finance/treasury')
@UseGuards(JwtAuthGuard)
export class TreasuryController {
  constructor(private readonly treasuryService: TreasuryService) {}

  // ─── Resumo ───────────────────────────────────────────────────────────

  @Get('overview')
  overview(@Req() req: AuthRequest) {
    return this.treasuryService.getOverview(req.user);
  }

  // ─── Contas bancárias ─────────────────────────────────────────────────

  @Post('accounts')
  createAccount(@Body() body: CreateBankAccountDto, @Req() req: AuthRequest) {
    return this.treasuryService.createBankAccount(body, req.user);
  }

  @Get('accounts')
  listAccounts(
    @Req() req: AuthRequest,
    @Query('isActive') isActive?: string,
    @Query('accountType') accountType?: string,
  ) {
    const normalizedIsActive =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.treasuryService.listBankAccounts(req.user, {
      isActive: normalizedIsActive,
      accountType,
    });
  }

  @Get('accounts/:id')
  getAccount(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.treasuryService.getBankAccount(id, req.user);
  }

  @Patch('accounts/:id')
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBankAccountDto,
    @Req() req: AuthRequest,
  ) {
    return this.treasuryService.updateBankAccount(id, body, req.user);
  }

  @Delete('accounts/:id')
  removeAccount(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    return this.treasuryService.removeBankAccount(id, req.user);
  }

  // ─── Movimentos ───────────────────────────────────────────────────────

  @Post('movements')
  recordMovement(@Body() body: CreateCashMovementDto, @Req() req: AuthRequest) {
    return this.treasuryService.recordMovement(body, req.user);
  }

  @Post('transfers')
  recordTransfer(@Body() body: CreateTransferDto, @Req() req: AuthRequest) {
    return this.treasuryService.recordTransfer(body, req.user);
  }

  // ─── Extrato ──────────────────────────────────────────────────────────

  @Get('accounts/:id/statement')
  getStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.treasuryService.getStatement(id, req.user, { startDate, endDate, limit });
  }
}
