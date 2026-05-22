import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AutoJournalModule } from '../accounting/auto-journal/auto-journal.module';

import { SalesProductsService } from './products/products.service';
import { SalesProductsController } from './products/products.controller';

import { SalesDocumentsService } from './documents/documents.service';
import { SalesDocumentsController } from './documents/documents.controller';

import { SalesCommissionsService } from './commissions/commissions.service';
import { SalesCommissionsController } from './commissions/commissions.controller';

import { SalesPaymentsService } from './payments/sales-payments.service';

import { SalesTeamService } from './team/team.service';
import { SalesTeamController } from './team/team.controller';

import { SalesReportsService } from './reports/reports.service';
import { SalesReportsController } from './reports/reports.controller';

import { SalesPriceListsService } from './price-lists/price-lists.service';
import { SalesPriceListsController } from './price-lists/price-lists.controller';

import { SalesDocumentSeriesService } from './series/series.service';
import { SalesDocumentSeriesController } from './series/series.controller';

import { CustomerCreditService } from './credit/customer-credit.service';
import { CustomerCreditController } from './credit/customer-credit.controller';

import { AttachmentsService } from './attachments/attachments.service';
import { AttachmentsController } from './attachments/attachments.controller';

import { StockReservationsService } from './stock/stock-reservations.service';
import { SalesFulfillmentsService } from './fulfillments/fulfillments.service';
import { SalesFulfillmentsController } from './fulfillments/fulfillments.controller';

@Module({
  imports: [
    DatabaseModule,
    InventoryModule,
    CommunicationsModule,
    ApprovalsModule,
    AutoJournalModule,
  ],
  controllers: [
    SalesProductsController,
    SalesDocumentsController,
    SalesCommissionsController,
    SalesTeamController,
    SalesReportsController,
    SalesPriceListsController,
    SalesFulfillmentsController,
    SalesDocumentSeriesController,
    CustomerCreditController,
    AttachmentsController,
  ],
  providers: [
    SalesProductsService,
    SalesDocumentsService,
    SalesCommissionsService,
    SalesPaymentsService,
    SalesTeamService,
    SalesReportsService,
    SalesPriceListsService,
    StockReservationsService,
    SalesFulfillmentsService,
    SalesDocumentSeriesService,
    CustomerCreditService,
    AttachmentsService,
  ],
  exports: [
    SalesProductsService,
    SalesDocumentsService,
    SalesCommissionsService,
    SalesPaymentsService,
    SalesTeamService,
    SalesReportsService,
    SalesPriceListsService,
    StockReservationsService,
    SalesFulfillmentsService,
    SalesDocumentSeriesService,
    CustomerCreditService,
    AttachmentsService,
  ],
})
export class SalesModule {}
