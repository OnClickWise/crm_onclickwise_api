import { Injectable } from '@nestjs/common';
import { ContributionService } from '@/modules/contribution/services/contribution.service';

@Injectable()
export class UpdateContributionUseCase {
  constructor(private readonly contributionService: ContributionService) {}

  async execute(id: string, data: any, user: any) {
    return this.contributionService.updateContribution(id, data, user);
  }
}
