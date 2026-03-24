import { Injectable } from '@nestjs/common';
import { ContributionService } from '@/modules/contribution/services/contribution.service';

@Injectable()
export class ListContributionsUseCase {
  constructor(private readonly contributionService: ContributionService) {}

  async execute(portfolioId: string | undefined, user: any) {
    return this.contributionService.listContributions(portfolioId, user);
  }
}
