import { CreatePipelineUseCase } from '@/use-cases/pipeline/create-stage.useCase';
import { ListPipelinesUseCase } from '@/use-cases/pipeline/list-pipeline.useCase';
import { UpdatePipelineUseCase } from '@/use-cases/pipeline/update-pipeline.useCase';
import { Controller, Post, Get, Body, Param, Patch } from '@nestjs/common';


@Controller('pipelines')
export class PipelineController {
  constructor(
    private createPipeline: CreatePipelineUseCase,
    private listPipelines: ListPipelinesUseCase,
    private updatePipeline: UpdatePipelineUseCase,
  ) {}

  @Post()
  create(@Body() body: any) {
    return this.createPipeline.execute(body);
  }

  @Get(':organizationId')
  list(@Param('organizationId') organizationId: string) {
    return this.listPipelines.execute(organizationId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.updatePipeline.execute(id, body);
  }
}
