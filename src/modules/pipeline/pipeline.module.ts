import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';
import { CreatePipelineUseCase } from '@/use-cases/pipeline/create-stage.useCase';
import { ListPipelinesUseCase } from '@/use-cases/pipeline/list-pipeline.useCase';
import { UpdatePipelineUseCase } from '@/use-cases/pipeline/update-pipeline.useCase';
import { PipelineStagesRepository } from './repositories/pipeline-stage.repository';

@Module({
  controllers: [PipelineController],
  providers: [
    CreatePipelineUseCase,
    ListPipelinesUseCase,
    UpdatePipelineUseCase,
    PipelineStagesRepository,
  ],
})
export class PipelineModule {}
