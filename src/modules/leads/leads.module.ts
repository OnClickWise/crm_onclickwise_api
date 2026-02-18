import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/shared/database/database.module'; // ajuste o path
// Controller
import { LeadsController } from './leads.controller';

// Use Cases
import { CreateLeadUseCase } from '@/use-cases/leads/createLead.useCase';
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
    DatabaseModule
  ],
  controllers: [LeadsController],
  providers: [
    {
      provide: 'ILeadRepository', // O Token (String) exata que você usou no @Inject
      useClass: LeadRepository,    // A implementação real
    },
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
  ],
  // Exportamos os Use Cases caso precisem ser usados em outros módulos (ex: Dashboards)
  exports: [
    'ILeadRepository'
  ]
})
export class LeadsModule {}