import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { BankImportService } from './bank-import.service';
import {
  ConfirmMatchDto,
  ImportStatementDto,
  ParseStatementDto,
} from './dtos/bank-import.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('finance/bank-import')
@UseGuards(JwtAuthGuard)
export class BankImportController {
  constructor(private readonly service: BankImportService) {}

  /** Prévia: parseia o arquivo e devolve as linhas sem gravar. */
  @Post('parse')
  parse(@Body() body: ParseStatementDto, @Req() req: AuthRequest) {
    return this.service.parse(body, req.user);
  }

  /** Importa o extrato: parseia e grava extrato + linhas. */
  @Post()
  import(@Body() body: ImportStatementDto, @Req() req: AuthRequest) {
    return this.service.import(body, req.user);
  }

  /** Sugestões de match com contas a receber/pagar. */
  @Get(':statementId/matches')
  matches(
    @Param('statementId', ParseUUIDPipe) statementId: string,
    @Req() req: AuthRequest,
  ) {
    return this.service.suggestArApMatches(statementId, req.user);
  }

  /** Confirma um match → registra o pagamento e reconcilia a linha. */
  @Post('confirm-match')
  confirm(@Body() body: ConfirmMatchDto, @Req() req: AuthRequest) {
    return this.service.confirmMatch(body, req.user);
  }
}
