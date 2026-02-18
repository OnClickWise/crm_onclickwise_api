import { PipelineStagesRepository } from '@/modules/pipeline/repositories/pipeline-stage.repository';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ReorderPipelineUseCase {
  constructor(private repo: PipelineStagesRepository) {}

  execute(orgId: string, stageIds: string[]) {
    return this.repo.reorder(orgId, stageIds);
  }
}
