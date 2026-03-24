import { Injectable } from '@nestjs/common';
import { DividendService } from '@/modules/dividend/services/dividend.service';

@Injectable()
export class DeleteDividendUseCase {
  constructor(private readonly dividendService: DividendService) {}

  async execute(id: string, user: any) {
    return this.dividendService.deleteDividend(id, user);
  }
}
