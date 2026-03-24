import { Injectable } from '@nestjs/common';
import { ContributionService } from '@/modules/contribution/services/contribution.service';

@Injectable()
export class CreateContributionUseCase {
  constructor(private readonly contributionService: ContributionService) {}

  async execute(data: any, user: any) {
    return this.contributionService.createContribution(data, user);
  }
}
