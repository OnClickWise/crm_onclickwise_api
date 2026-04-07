import { CreatePipelineUseCase } from '@/use-cases/pipeline/create-stage.useCase';
import { ListPipelinesUseCase } from '@/use-cases/pipeline/list-pipeline.useCase';
import { UpdatePipelineUseCase } from '@/use-cases/pipeline/update-pipeline.useCase';
import { Controller, Post, Get, Body, Param, Patch, Delete, UseGuards, Query, Req } from '@nestjs/common';
import { CreateStageDto } from './dtos/create-stage.dto';
import { UpdateStageDto } from './dtos/update-stage.dto';
import { DeletePipelineUseCase } from '@/use-cases/pipeline/delete-pipeline.useCase';
import { ReorderPipelineUseCase } from '@/use-cases/pipeline/reoder-pipeline.useCase';
import { GetPipelineUseCase } from '@/use-cases/pipeline/get-stage-pipeline.useCase';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetPipelineKanbanBoardUseCase } from '@/use-cases/pipeline/get-pipeline-kanban-board.useCase';

@UseGuards(JwtAuthGuard)
@Controller('pipeline-stages')
export class PipelineController {
  constructor(
    private createPipeline: CreatePipelineUseCase,
    private listPipelines: ListPipelinesUseCase,
    private updatePipeline: UpdatePipelineUseCase,
    private getOne: GetPipelineUseCase,
    private remove: DeletePipelineUseCase,
    private reorder: ReorderPipelineUseCase,
    private getKanbanBoard: GetPipelineKanbanBoardUseCase,
  ) {}

  private resolveOrganizationId(routeOrgId: string, req: any): string {
    return req?.user?.organizationId || routeOrgId;
  }

  @Post(':organizationId')
  create(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateStageDto,
  ) {
    return this.createPipeline.execute(organizationId, body);
  }

  @Get(':organizationId')
  list(@Param('organizationId') organizationId: string, @Req() req: any) {
    const scopedOrgId = this.resolveOrganizationId(organizationId, req);
    return this.listPipelines.execute(scopedOrgId);
  }

  @Get(':organizationId/kanban')
  listKanbanBoard(
    @Param('organizationId') organizationId: string,
    @Req() req: any,
    @Query() query: { search?: string; assigned_user_id?: string; show_on_pipeline?: string; limit?: string },
  ) {
    const scopedOrgId = this.resolveOrganizationId(organizationId, req);
    return this.getKanbanBoard.execute(scopedOrgId, query);
  }

  @Patch(':organizationId/:id')
  update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Body() body: UpdateStageDto,
  ) {
    return this.updatePipeline.execute(id, organizationId, body);
  }

  @Get(':organizationId/:id')
  getStage(@Param('organizationId') organizationId: string, @Param('id') id: string) {
    return this.getOne.execute(id, organizationId);
  }

  @Delete(':organizationId/:id')
  deleteStage(@Param('organizationId') organizationId: string, @Param('id') id: string) {
    return this.remove.execute(id, organizationId);
  }

  @Patch(':organizationId/reorder')
  reorderStages(
    @Param('organizationId') organizationId: string,
    @Body('stageIds') stageIds: string[],
  ) {
    return this.reorder.execute(organizationId, stageIds);
  }
}
