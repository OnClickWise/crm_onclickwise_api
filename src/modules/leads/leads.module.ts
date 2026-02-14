import { Module } from '@nestjs/common';

// Controller
import { LeadsController } from './leads.controller';

// Use Cases
import { CreateLeadUseCase } from '@/use-cases/leads/createLead.Usecase';
import { SearchLeadUseCase } from '@/use-cases/leads/searchLead.useCase';
import { ListLeadsUseCase } from '@/use-cases/leads/listLeads.useCase';
import { UpdateLeadUseCase } from '@/use-cases/leads/updateLead.useCase';
import { DeleteLeadUseCase } from '@/use-cases/leads/deleteLead.useCase';
import { GetLeadsByStatusUseCase } from '@/use-cases/leads/getLeadsbyStatus.useCase';
import { BulkPipelineUseCase } from '@/use-cases/leads/BulkPipelineUseCase';
import { UploadAttachmentUseCase } from '@/use-cases/leads/uploadAttachment.useCase';
import { GetLeadByIdUseCase } from '@/use-cases/leads/getLeadByIuseCase';

// Repositories
import { LeadRepository } from '@/modules/leads/repositories/lead.repository';

@Module({
  imports: [
    // DatabaseModule, // Caso o repositório precise de conexão com o banco
  ],
  controllers: [LeadsController],
  providers: [
    // Registro de todos os casos de uso
    CreateLeadUseCase,
    SearchLeadUseCase,
    ListLeadsUseCase,
    UpdateLeadUseCase,
    DeleteLeadUseCase,
    GetLeadsByStatusUseCase,
    BulkPipelineUseCase,
    UploadAttachmentUseCase,
    //DownloadAttachmentUseCase,
    GetLeadByIdUseCase,
    LeadRepository
  ],
  // Exportamos os Use Cases caso precisem ser usados em outros módulos (ex: Dashboards)
  exports: [
  ]
})
export class LeadsModule {}