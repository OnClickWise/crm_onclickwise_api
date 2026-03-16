import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvestmentService } from './investment.service';

@Injectable()
export class PriceSchedulerService {
  private readonly logger = new Logger(PriceSchedulerService.name);

  constructor(private readonly investmentService: InvestmentService) {}

  /** Atualiza cotações a cada 15 minutos de seg a sex, das 10h às 18h (horário de Brasília = UTC-3) */
  @Cron('0 */15 13-21 * * 1-5')
  async handlePriceRefresh() {
    this.logger.log('Iniciando atualização automática de cotações...');
    try {
      const result = await this.investmentService.refreshAllPrices();
      this.logger.log(`Cotações atualizadas: ${result.updated} ativo(s)`);
    } catch (error) {
      this.logger.error('Erro ao atualizar cotações:', error);
    }
  }
}
