import { PipelineStagesRepository } from '@/modules/pipeline/repositories/pipeline-stage.repository';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GetPipelineUseCase {
  constructor(private repo: PipelineStagesRepository) {}

  async execute(id: string, orgId: string) {
    const stage = await this.repo.findById(id, orgId);

    if (!stage) {
      throw new Error('Stage não encontrada');
    }

    return stage;
  }
}
