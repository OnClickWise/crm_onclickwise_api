import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module';
import { CommunicationsModule } from '@/modules/communications/communications.module';
import { DunningService } from './dunning.service';
import { DunningController } from './dunning.controller';

/**
 * Dunning — régua de cobrança automática. Envia e-mails escalonados para
 * contas a receber em aberto, reusando o motor de e-mail (SMTP por org).
 * Inclui cron diário (08h).
 */
@Module({
  imports: [DatabaseModule, CommunicationsModule],
  controllers: [DunningController],
  providers: [DunningService],
  exports: [DunningService],
})
export class DunningModule {}
