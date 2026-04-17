import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';

export class SendWhatsappMessageDto {
  @IsString()
  @IsNotEmpty()
  // Removido o @Matches para permitir JIDs e números com sufixos de API
  to!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsUUID()
  @IsOptional()
  leadId?: string;

  @IsString()
  @IsOptional()
  contactName?: string; // Adicione esta linha

  
}