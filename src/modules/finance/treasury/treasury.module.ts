import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { TreasuryService } from './treasury.service';
import { TreasuryController } from './treasury.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [TreasuryController],
  providers: [TreasuryService],
  exports: [TreasuryService],
})
export class TreasuryModule {}
