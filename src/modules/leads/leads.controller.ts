import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { CreateLeadUseCase } from '@/use-cases/leads/createLead.useCase';
import { SearchLeadUseCase } from '@/use-cases/leads/searchLead.useCase';
import { ListLeadsUseCase } from '@/use-cases/leads/listLeads.useCase';
import { UpdateLeadUseCase } from '@/use-cases/leads/updateLead.useCase';
import { DeleteLeadUseCase } from '@/use-cases/leads/deleteLead.useCase';
import { GetLeadsByStatusUseCase } from '@/use-cases/leads/getLeadsbyStatus.useCase';
import { BulkPipelineUseCase } from '@/use-cases/leads/BulkPipelineUseCase';
import { UploadAttachmentUseCase } from '@/use-cases/leads/uploadAttachment.useCase';
import { GetLeadByIdUseCase } from '@/use-cases/leads/getLeadByIuseCase';
import { GetAttachmentByIdUseCase } from '@/use-cases/leads/getAttachmentUseCase';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateLeadDto } from './dtos/create.lead.dto';
import { UpdateLeadDto } from './dtos/update.lead.dto';
import { BulkUpdateLeadDto } from './dtos/bulk.update.lead.dto';
import * as fs from 'fs';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly searchLead: SearchLeadUseCase,
    private readonly listLeads: ListLeadsUseCase,
    private readonly createLead: CreateLeadUseCase,
    private readonly updateLead: UpdateLeadUseCase,
    private readonly deleteLead: DeleteLeadUseCase,
    private readonly getByStatus: GetLeadsByStatusUseCase,
    private readonly bulkPipeline: BulkPipelineUseCase,
    private readonly uploadAttach: UploadAttachmentUseCase,
    private readonly getAttachmentById: GetAttachmentByIdUseCase,
    private readonly getById: GetLeadByIdUseCase,
  ) {}

  // --- ROTA PÚBLICA ---
  @Post('public')
  createPublic(@Body() body: CreateLeadDto) {
    if (!body.organization_id) {
      throw new BadRequestException('organization_id is required for public lead creation');
    }
    return this.createLead.execute(body.organization_id, body);
  }

  // --- ROTAS PROTEGIDAS ---
  @UseGuards(JwtAuthGuard)
  @Get('search/:params')
  searchByParams(@Req() req: any, @Query() allQueries: any) {
    return this.searchLead.execute({ filters: allQueries }, req.user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  searchGeneric(@Req() req: any, @Query() query: any) {
    return this.searchLead.execute(query, req.user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: any) {
    return this.listLeads.execute(req.user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  createInternal(@Req() req: any, @Body() body: CreateLeadDto) {
    return this.createLead.execute(req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Put()
  update(@Req() req: any, @Body() body: UpdateLeadDto & { id: string }) {
    return this.updateLead.execute(body.id, body, req.user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  remove(@Req() req: any, @Body('id') id: string) {
    return this.deleteLead.execute(id, req.user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  listByStatus(@Req() req: any, @Query('status') status: string) {
    return this.getByStatus.execute(status, req.user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bulk-pipeline')
  bulkUpdate(@Req() req: any, @Body() body: BulkUpdateLeadDto) {
    return this.bulkPipeline.execute(body, req.user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':leadId/attachments/:attachmentId')
  async getAttachment(@Param('leadId') leadId: string, @Param('attachmentId') attachmentId: string, @Req() req: any) {
    const result = await this.getAttachmentById.execute(req.user.organizationId, leadId, attachmentId);

    if (result.success && result.attachment && result.filePath) {
      return fs.readFileSync(result.filePath);
    }

    return { success: false };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/attachments')
  async upload(@Param('id') id: string, @Req() req: any) {
    const data = await req.file();
    if (!data) {
      return;
    }

    const modified = this.uploadAttach.execute(req.user.organizationId, id, data);
    return {
      success: true,
      lead: modified,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findById(@Req() req: any, @Param('id') id: string) {
    return this.getById.execute(id, req.user.organizationId);
  }
}
