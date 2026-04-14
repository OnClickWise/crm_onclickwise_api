import { CreatePipelineUseCase } from '@/use-cases/pipeline/create-stage.useCase';
import { ListPipelinesUseCase } from '@/use-cases/pipeline/list-pipeline.useCase';
import { UpdatePipelineUseCase } from '@/use-cases/pipeline/update-pipeline.useCase';
import { BadRequestException, Controller, Post, Get, Body, Param, Patch, Delete, UseGuards, Query, Req, ForbiddenException } from '@nestjs/common';
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

  private resolveOrganizationIdStrict(routeOrgId: string, req: any): string {
    const tokenOrgId = req?.user?.organizationId;
    if (!tokenOrgId) {
      throw new ForbiddenException('User without organization scope');
    }
    if (routeOrgId !== tokenOrgId) {
      throw new ForbiddenException('Organization scope mismatch');
    }
    return tokenOrgId;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
  }

  @Get(':organizationId/kanban')
  listKanbanBoard(
    @Param('organizationId') organizationId: string,
    @Req() req: any,
    @Query() query: { search?: string; assigned_user_id?: string; show_on_pipeline?: string; limit?: string },
  ) {
    const scopedOrgId = this.resolveOrganizationIdStrict(organizationId, req);
    return this.getKanbanBoard.execute(scopedOrgId, query);
  }

  @Patch(':organizationId/reorder')
  reorderStages(
    @Param('organizationId') organizationId: string,
    @Req() req: any,
    @Body('stageIds') stageIds: string[],
  ) {
    const scopedOrgId = this.resolveOrganizationIdStrict(organizationId, req);
    return this.reorder.execute(scopedOrgId, stageIds);
  }

  @Post(':organizationId')
  create(
    @Param('organizationId') organizationId: string,
    @Req() req: any,
    @Body() body: CreateStageDto,
  ) {
    const scopedOrgId = this.resolveOrganizationIdStrict(organizationId, req);
    return this.createPipeline.execute(scopedOrgId, body);
  }

  @Get(':organizationId/:id([0-9a-fA-F-]+)')
  getStage(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Req() req: any,
    @Query() query: { search?: string; assigned_user_id?: string; show_on_pipeline?: string; limit?: string },
  ) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid stage id');
    }

    const scopedOrgId = this.resolveOrganizationIdStrict(organizationId, req);
    return this.getOne.execute(id, scopedOrgId);
  }

  @Patch(':organizationId/:id([0-9a-fA-F-]+)')
  update(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: UpdateStageDto,
  ) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid stage id');
    }

    const scopedOrgId = this.resolveOrganizationIdStrict(organizationId, req);
    return this.updatePipeline.execute(id, scopedOrgId, body);
  }

  @Delete(':organizationId/:id([0-9a-fA-F-]+)')
  deleteStage(@Param('organizationId') organizationId: string, @Param('id') id: string, @Req() req: any) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid stage id');
    }

    const scopedOrgId = this.resolveOrganizationIdStrict(organizationId, req);
    return this.remove.execute(id, scopedOrgId);
  }

  @Get(':organizationId')
  list(@Param('organizationId') organizationId: string, @Req() req: any) {
    const scopedOrgId = this.resolveOrganizationIdStrict(organizationId, req);
    return this.listPipelines.execute(scopedOrgId);
  }
}
