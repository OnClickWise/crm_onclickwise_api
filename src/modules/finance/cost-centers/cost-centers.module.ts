import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { CostCentersService } from './cost-centers.service';
import { CostCentersController } from './cost-centers.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [CostCentersController],
  providers: [CostCentersService],
  exports: [CostCentersService],
})
export class CostCentersModule {}
