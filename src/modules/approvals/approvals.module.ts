import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { ApprovalRulesService } from './rules/rules.service';
import { ApprovalRulesController } from './rules/rules.controller';
import { ApprovalRequestsService } from './requests/requests.service';
import { ApprovalRequestsController } from './requests/requests.controller';

/**
 * Approvals module — workflow genérico de aprovação.
 * Exportado para que SalesModule (e futuros: Purchases, Expenses) possam
 * injetar o RequestsService e chamar `evaluateAndCreate` em pontos críticos.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [ApprovalRulesController, ApprovalRequestsController],
  providers: [ApprovalRulesService, ApprovalRequestsService],
  exports: [ApprovalRulesService, ApprovalRequestsService],
})
export class ApprovalsModule {}
