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

  async execute(user_data: AuthPayload, data: CreateLeadDto): Promise<{lead:LeadEntity}> {
    // 1. Regra de Negócio: Verificar se já existe um lead com o mesmo email nesta organização

    const existingLeads = await this.leadRepository.findByEmail(
      data.email, 
      user_data.organizationId 
    );

    if (existingLeads != undefined) {
      throw new BadRequestException('Um lead com este email já está cadastrado nesta organização.');
    }

    // 2. Criar a entidade (usando o modelo que definimos anteriormente)
    // Passamos o organizationId que geralmente vem do Token do usuário logado
    const assignedUserId = user_data.userId;
    const organizationId = user_data.organizationId

    const lead = new LeadEntity({
      ...data,
      organizationId,
      assignedUserId,
      status: 'New',
    });

    const newLead = await this.leadRepository.create(lead);
    return {
      lead: newLead
    }
  }
}