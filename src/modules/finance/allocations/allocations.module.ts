import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { AllocationsService } from './allocations.service';
import { AllocationsController } from './allocations.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [AllocationsController],
  providers: [AllocationsService],
  exports: [AllocationsService],
})
export class AllocationsModule {}
