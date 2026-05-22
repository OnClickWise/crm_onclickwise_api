import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { SalesModule } from '@/modules/sales/sales.module';
import { BillingPlansService } from './plans/plans.service';
import { BillingPlansController } from './plans/plans.controller';
import { BillingSubscriptionsService } from './subscriptions/subscriptions.service';
import { BillingSubscriptionsController } from './subscriptions/subscriptions.controller';
import { BillingGenerationService } from './generation/billing-generation.service';
import { BillingGenerationController } from './generation/billing-generation.controller';

/**
 * Billing — faturamento recorrente (assinaturas).
 * Reusa SalesModule (SalesPaymentsService) para criar AR + comissão
 * + lançamento contábil ao gerar a fatura.
 */
@Module({
  imports: [DatabaseModule, SalesModule],
  controllers: [
    BillingPlansController,
    BillingSubscriptionsController,
    BillingGenerationController,
  ],
  providers: [BillingPlansService, BillingSubscriptionsService, BillingGenerationService],
  exports: [BillingPlansService, BillingSubscriptionsService, BillingGenerationService],
})
export class BillingModule {}
