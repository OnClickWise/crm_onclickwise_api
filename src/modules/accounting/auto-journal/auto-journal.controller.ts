import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { AutoJournalRulesService } from './auto-journal-rules.service';
import { UpsertRuleDto } from './dtos/rule.dto';

interface AuthRequest {
  user: { organizationId: string; userId: string; role: string };
}

@Controller('accounting/auto-journal')
@UseGuards(JwtAuthGuard)
export class AutoJournalController {
  constructor(private readonly rulesService: AutoJournalRulesService) {}

  /** Catálogo de eventos suportados (para a UI montar o formulário). */
  @Get('catalog')
  catalog() {
    return this.rulesService.getCatalog();
  }

  /** Lista as regras configuradas da organização. */
  @Get('rules')
  list(@Req() req: AuthRequest) {
    return this.rulesService.list(req.user);
  }

  /** Cria/atualiza a regra de um evento. */
  @Put('rules/:eventType')
  upsert(
    @Param('eventType') eventType: string,
    @Body() body: UpsertRuleDto,
    @Req() req: AuthRequest,
  ) {
    return this.rulesService.upsert(eventType, body, req.user);
  }

  /** Cria regras padrão tentando casar contas automaticamente. */
  @Post('seed-defaults')
  seed(@Req() req: AuthRequest) {
    return this.rulesService.seedDefaults(req.user);
  }
}
