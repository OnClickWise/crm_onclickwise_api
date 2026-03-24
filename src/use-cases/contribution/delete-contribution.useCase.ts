import { Injectable } from '@nestjs/common';
import { ContributionService } from '@/modules/contribution/services/contribution.service';

@Injectable()
export class DeleteContributionUseCase {
  constructor(private readonly contributionService: ContributionService) {}

  async execute(id: string, user: any) {
    return this.contributionService.deleteContribution(id, user);
  }
}
