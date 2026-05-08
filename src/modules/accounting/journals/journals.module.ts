import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { JournalsController } from './journals.controller';
import { JournalsService } from './journals.service';

@Module({
  imports: [DatabaseModule],
  controllers: [JournalsController],
  providers: [JournalsService],
  exports: [JournalsService],
})
export class JournalsModule {}
