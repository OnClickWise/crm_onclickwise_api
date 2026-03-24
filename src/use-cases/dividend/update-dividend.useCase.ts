import { Injectable } from '@nestjs/common';
import { DividendService } from '@/modules/dividend/services/dividend.service';

@Injectable()
export class UpdateDividendUseCase {
  constructor(private readonly dividendService: DividendService) {}

  async execute(id: string, data: any, user: any) {
    return this.dividendService.updateDividend(id, data, user);
  }
}
