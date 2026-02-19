import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards,Request,Req } from '@nestjs/common';
// Importação dos Use Cases (Devem ser criados na pasta use-cases/leads)
import { CreateLeadUseCase } from '@/use-cases/leads/createLead.useCase';
import { SearchLeadUseCase } from '@/use-cases/leads/searchLead.useCase';
import { ListLeadsUseCase } from '@/use-cases/leads/listLeads.useCase';
import { UpdateLeadUseCase } from '@/use-cases/leads/updateLead.useCase';
import { DeleteLeadUseCase } from '@/use-cases/leads/deleteLead.useCase';
import { GetLeadsByStatusUseCase } from '@/use-cases/leads/getLeadsbyStatus.useCase';
import { BulkPipelineUseCase } from '@/use-cases/leads/BulkPipelineUseCase';
import { UploadAttachmentUseCase } from '@/use-cases/leads/uploadAttachment.useCase';
import { GetLeadByIdUseCase } from '@/use-cases/leads/getLeadByIuseCase';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';



import { UploadAttachmentDto } from '@/modules/leads/dtos/upload.attchment.dto';
import { success } from 'zod';

@Controller('leads')
export class LeadsController {
  constructor(
    private searchLead: SearchLeadUseCase,
    private listLeads: ListLeadsUseCase,
    private createLead: CreateLeadUseCase,
    private updateLead: UpdateLeadUseCase,
    private deleteLead: DeleteLeadUseCase,
    private getByStatus: GetLeadsByStatusUseCase,
    private bulkPipeline: BulkPipelineUseCase,
    private uploadAttach: UploadAttachmentUseCase,
    //private downloadAttach: DownloadAttachmentUseCase,
    private getById: GetLeadByIdUseCase,
  ) {}

  // --- ROTAS PÚBLICAS ---

  @Post('public')
  createPublic(@Body() body: any) {
    // Implementa a criação via formulário externo
    return this.createLead.execute(body.data.organizationId,body);
  }

  // --- ROTAS PROTEGIDAS ---


@Get('search/:params')
searchByParams( @Query() allQueries: any) {
  return this.searchLead.execute({ 
    filters: allQueries 
  });
}

  @Get('search')
  searchGeneric(@Query() query: any) {
    return this.searchLead.execute(query);
  }


  @Get()
  list(@Query() params: any) {
    return this.listLeads.execute(params);
  }


  @UseGuards(JwtAuthGuard)
  @Post()
  createInternal(@Req() req: any) {
    return this.createLead.execute(req.user, req.body);
  }

  @UseGuards(JwtAuthGuard)
  @Put()
  update(@Body() body: any) {
    // Nota: A tabela indica PUT /leads sem ID na URL, sugerindo ID no body
    return this.updateLead.execute(body.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  remove(@Body('id') id: string) {
    return this.deleteLead.execute(id);
  }


  @Get('status')
  listByStatus(@Query('status') status: string) {
    return this.getByStatus.execute(status);
  }

  @Post('bulk-pipeline')
  bulkUpdate(@Body() body: any) {
    return this.bulkPipeline.execute(body);
  }



  @UseGuards(JwtAuthGuard)
  @Post(':id/attachments')
  async upload(@Param('id') id: string, @Req() req: any) {

    const data = await req.file(); 
  
    if (!data) {
      return;
    }
   
    const modified = this.uploadAttach.execute(req.user.organizationId,id, data);
    return {
      success:true,
      lead: modified
    }

  }



/*
  @Get(':id/attachments/:fId')
  download(@Param('id') id: string, @Param('fId') fId: string) {
    return this.downloadAttach.execute(id, fId);
  }
*/

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.getById.execute(id);
  }
}