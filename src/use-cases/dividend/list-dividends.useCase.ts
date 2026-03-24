import { Injectable } from '@nestjs/common';
import { DividendService } from '@/modules/dividend/services/dividend.service';

@Injectable()
export class ListDividendsUseCase {
  constructor(private readonly dividendService: DividendService) {}

  async execute(user: any) {
    return this.dividendService.listDividends(user);
  }
}
