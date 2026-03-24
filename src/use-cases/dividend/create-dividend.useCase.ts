import { Injectable } from '@nestjs/common';
import { DividendService } from '@/modules/dividend/services/dividend.service';

@Injectable()
export class CreateDividendUseCase {
  constructor(private readonly dividendService: DividendService) {}

  async execute(data: any, user: any) {
    return this.dividendService.createDividend(data, user);
  }
}
