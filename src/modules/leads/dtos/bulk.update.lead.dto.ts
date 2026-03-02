import { IsArray, IsString, IsNotEmpty, IsOptional, isBoolean } from 'class-validator';

export class BulkUpdateLeadDto {
  @IsArray()
  @IsString({ each: true })
  lead_ids!: string[]; // Adicionado '!' pois é obrigatório

  @IsString()
  @IsNotEmpty()
  status!: string; // Adicionado '!' pois é obrigatório

  @IsString()
  @IsOptional()
  pipelineId?: string; // Mantido '?' pois é opcional na migration

  @IsString()
  @IsOptional()
  stageId?: string; // Mantido '?' pois é opcional
  
  @IsOptional()
  show_on_pipeline?:boolean;
}