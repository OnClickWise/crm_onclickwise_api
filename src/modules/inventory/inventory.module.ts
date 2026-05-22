import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { AutoJournalModule } from '../accounting/auto-journal/auto-journal.module';

import { WarehousesService } from './warehouses/warehouses.service';
import { WarehousesController } from './warehouses/warehouses.controller';

import { StockMovementsService } from './movements/movements.service';
import { StockMovementsController } from './movements/movements.controller';

import { InventoryCountsService } from './counts/counts.service';
import { InventoryCountsController } from './counts/counts.controller';

@Module({
  imports: [DatabaseModule, AutoJournalModule],
  controllers: [WarehousesController, StockMovementsController, InventoryCountsController],
  providers: [WarehousesService, StockMovementsService, InventoryCountsService],
  exports: [WarehousesService, StockMovementsService, InventoryCountsService],
})
export class InventoryModule {}
