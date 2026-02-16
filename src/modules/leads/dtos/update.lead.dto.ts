import { PartialType } from '@nestjs/mapped-types';
import { CreateLeadDto } from '@/modules/leads/dtos/create.lead.dto';

// Permite atualizar qualquer campo do Lead de forma opcional
export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  status?: string;
  updatedAt?: Date;
}