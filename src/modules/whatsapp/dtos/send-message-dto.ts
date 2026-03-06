import { IsString, IsNotEmpty, IsUUID, IsOptional, Matches } from 'class-validator';

export class SendWhatsappMessageDto {
  @IsString()
  @IsNotEmpty()
  // Aceita formatos como +5511999999999 ou whatsapp:+5511999999999
  @Matches(/^(\+?|whatsapp:\+?)[1-9]\d{1,14}$/, { 
    message: 'O número de destino deve estar no formato E.164 (ex: +55119...) ou prefixado com whatsapp:' 
  })
  to!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsUUID()
  @IsOptional()
  leadId?: string;
}