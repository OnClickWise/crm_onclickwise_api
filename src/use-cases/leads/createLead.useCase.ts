import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';
import { CreateLeadDto } from '@/modules/leads/dtos/create.lead.dto';
import { LeadEntity } from '@/modules/leads/entities/lead.entity';
import { AuthPayload } from '@/modules/auth/entities/auth/auth.entity';

@Injectable()
export class CreateLeadUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: ILeadRepository,
  ) {}

  async execute(
    user_data: AuthPayload | string,
    data: CreateLeadDto,
  ): Promise<{ lead: LeadEntity }> {
    // Handle both AuthPayload and string (organizationId)
    let organizationId: string;
    let assignedUserId: string | undefined;

    if (typeof user_data === 'string') {
      // Public form submission - only has organizationId as string
      organizationId = user_data;
      assignedUserId = undefined;
    } else {
      // Authenticated request - has full AuthPayload
      organizationId = user_data.organizationId;
      assignedUserId = user_data.userId;
    }

    // Use organization_id from DTO if provided, otherwise use from user_data
    if (data.organization_id) {
      organizationId = data.organization_id;
    }

    // 1. Verificar se já existe um lead com o mesmo email nesta organização
    const existingLeads = await this.leadRepository.findByEmail(
      data.email, 
      organizationId 
    );

    if (existingLeads != undefined) {
      throw new BadRequestException(
        'Um lead com este email já está cadastrado nesta organização.',
      );
    }

    // 2. Criar a entidade
    const lead = new LeadEntity({
      ...data,
      organization_id: organizationId,
      assignedUserId,
      status: data.status || 'New',
    });
    
    console.log('[CREATE_LEAD] Criando lead:', {
      name: lead.name,
      email: lead.email,
      organization_id: lead.organization_id,
      status: lead.status,
    });
    
    const newLead = await this.leadRepository.create(lead);
    
    console.log('[CREATE_LEAD] Lead criado com sucesso:', {
      id: newLead.id,
      organization_id: newLead.organization_id,
    });
    
    return {
      lead: newLead,
    };
  }
}