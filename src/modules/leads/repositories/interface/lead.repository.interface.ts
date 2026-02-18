import { LeadEntity } from '../../entities/lead.entity';
import { CreateLeadDto } from '@/modules/leads/dtos/create.lead.dto';
import { UpdateLeadDto } from '@/modules/leads/dtos/update.lead.dto';
import { FilterLeadDto } from '@/modules/leads/dtos/lead.filter.dto';
import { BulkUpdateLeadDto } from '@/modules/leads/dtos/bulk.update.lead.dto';

export interface ILeadRepository {
  // Criação
  create(data: CreateLeadDto): Promise<LeadEntity>;

  // Leitura
  findById(id: string): Promise<LeadEntity | null>;
  findAll(filters: FilterLeadDto): Promise<{ leads:LeadEntity[]; total: number }>;
  
  // Buscas Especializadas (SSN, EIN, Nome, Email)
  search(criteria: string | any): Promise<{ leads:LeadEntity[]; total: number }>;
  findByStatus(status: string, organizationId?: string): Promise<LeadEntity[]>;

  // Atualização
  update(id: string, data: UpdateLeadDto): Promise<LeadEntity>;
  
  // Operações em Massa (Pipeline)
  updateBulkPipeline(data: BulkUpdateLeadDto): Promise<void>;

  // Exclusão
  delete(id: string): Promise<void>;

  // Anexos (Gestão de Metadados no Banco)
  addAttachment(leadId: string, attachmentData: any): Promise<void>;
  removeAttachment(leadId: string, attachmentId: string): Promise<void>;
}