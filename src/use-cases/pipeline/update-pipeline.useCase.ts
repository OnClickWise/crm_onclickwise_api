import { PipelineStagesRepository } from '@/modules/pipeline/repositories/pipeline-stage.repository';
import { Injectable } from '@nestjs/common';


@Injectable()
export class UpdatePipelineUseCase {
  constructor(private pipelineRepository: PipelineStagesRepository) {}

  async execute(id: string, data: any) {
    const pipeline = await this.pipelineRepository.findById(id);

    if (!pipeline) {
      throw new Error('Pipeline não encontrado');
    }

    return this.pipelineRepository.update(id, data);
  }
}
