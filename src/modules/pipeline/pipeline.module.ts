import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';
import { CreatePipelineUseCase } from '@/use-cases/pipeline/create-stage.useCase';
import { ListPipelinesUseCase } from '@/use-cases/pipeline/list-pipeline.useCase';
import { UpdatePipelineUseCase } from '@/use-cases/pipeline/update-pipeline.useCase';
import { PipelineStagesRepository } from './repositories/pipeline-stage.repository';
import { GetPipelineUseCase } from '@/use-cases/pipeline/get-stage-pipeline.useCase';
import { DeletePipelineUseCase } from '@/use-cases/pipeline/delete-pipeline.useCase';
import { ReorderPipelineUseCase } from '@/use-cases/pipeline/reoder-pipeline.useCase';
import { CreateDefaultStagesUseCase } from '@/use-cases/pipeline/create-default-stages.useCase';
import { DatabaseModule } from '@/shared/database/database.module';
import { GetPipelineKanbanBoardUseCase } from '@/use-cases/pipeline/get-pipeline-kanban-board.useCase';

@Module({
  imports: [DatabaseModule],
  controllers: [PipelineController],
  providers: [
    PipelineStagesRepository,
    CreatePipelineUseCase,
    ListPipelinesUseCase,
    GetPipelineUseCase,
    UpdatePipelineUseCase,
    DeletePipelineUseCase,
    ReorderPipelineUseCase,
    CreateDefaultStagesUseCase,
    GetPipelineKanbanBoardUseCase,
  ],
})
export class PipelineModule {}
