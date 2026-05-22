import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AutoJournalModule } from '../accounting/auto-journal/auto-journal.module';

import { PurchaseDocumentsService } from './documents/documents.service';
import { PurchaseDocumentsController } from './documents/documents.controller';
import { PurchasePaymentsService } from './payments/purchase-payments.service';

@Module({
  imports: [DatabaseModule, InventoryModule, ApprovalsModule, AutoJournalModule],
  controllers: [PurchaseDocumentsController],
  providers: [PurchaseDocumentsService, PurchasePaymentsService],
  exports: [PurchaseDocumentsService, PurchasePaymentsService],
})
export class PurchasesModule {}
