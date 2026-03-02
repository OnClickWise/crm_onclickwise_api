import { Injectable } from '@nestjs/common';

import { PipelineStagesRepository } from '@/modules/pipeline/repositories/pipeline-stage.repository';

@Injectable()
export class ListPipelinesUseCase {
  constructor(private repo: PipelineStagesRepository) {}

  async execute(organizationId: string) {
    return this.repo.findByOrg(organizationId);
  }
}
