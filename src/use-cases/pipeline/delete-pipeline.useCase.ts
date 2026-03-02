import { PipelineStagesRepository } from '@/modules/pipeline/repositories/pipeline-stage.repository';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DeletePipelineUseCase {
  constructor(private repo: PipelineStagesRepository) {}

  async execute(id: string, organizationId: string) {
    const stage = await this.repo.findById(id, organizationId);

    if (!stage) {
      throw new Error('Stage não encontrada');
    }

    await this.repo.delete(id, organizationId);
  }
}
