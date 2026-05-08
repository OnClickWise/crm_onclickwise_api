import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { ReportsModule } from '../reports/reports.module';
import { ExportsService } from './exports.service';
import { ExportsController } from './exports.controller';

@Module({
  imports: [DatabaseModule, ReportsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
