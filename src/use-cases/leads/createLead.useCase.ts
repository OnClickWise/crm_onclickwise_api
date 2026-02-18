import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import type { ILeadRepository } from '@/modules/leads/repositories/interface/lead.repository.interface';
import { CreateLeadDto } from '@/modules/leads/dtos/create.lead.dto';
import { LeadEntity } from '@/modules/leads/entities/lead.entity';

@Injectable()
export class CreateLeadUseCase {
  constructor(
    @Inject('ILeadRepository')
    private readonly leadRepository: ILeadRepository,
  ) {}

  async execute(organizationId: string, data: CreateLeadDto): Promise<LeadEntity> {
    // 1. Regra de Negócio: Verificar se já existe um lead com o mesmo email nesta organização
    const existingLeads = await this.leadRepository.search({ 
      email: data.email, 
      organization_id: organizationId 
    });

    if (existingLeads.leads.length > 0) {
      throw new BadRequestException('Um lead com este email já está cadastrado nesta organização.');
    }

    // 2. Criar a entidade (usando o modelo que definimos anteriormente)
    // Passamos o organizationId que geralmente vem do Token do usuário logado

    const lead = new LeadEntity({
      ...data,
      organizationId,
      status: 'New',
    });

    // 3. Salvar no repositório
    return await this.leadRepository.create(lead);
  }
}