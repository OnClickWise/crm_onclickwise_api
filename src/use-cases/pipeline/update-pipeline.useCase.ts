import { PipelineStagesRepository } from '@/modules/pipeline/repositories/pipeline-stage.repository';
import { Injectable } from '@nestjs/common';

@Injectable()
export class UpdatePipelineUseCase {
  constructor(private repo: PipelineStagesRepository) {}

  async execute(id: string, organizationId: string, data: any) {
    const stage = await this.repo.findById(id, organizationId);

    if (!stage) {
      throw new Error('Stage não encontrada');
    }

    await this.repo.update(id, organizationId, {
      ...data,
      updated_at: new Date(),
    });

    return this.repo.findById(id, organizationId);
  }
}
