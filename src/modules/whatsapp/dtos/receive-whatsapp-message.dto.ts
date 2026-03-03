import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class TwilioWebhookDto {
  @IsString()
  @IsNotEmpty()
  MessageSid!: string;

  @IsString()
  @IsNotEmpty()
  AccountSid!: string;

  @IsString()
  @IsNotEmpty()
  From!: string; // Ex: whatsapp:+5511999999999

  @IsString()
  @IsNotEmpty()
  To!: string; // O seu número Twilio

  @IsString()
  @IsOptional()
  Body!: string;

  @IsString()
  @IsOptional()
  NumMedia!: string; // Chega como string "0", "1", etc.

  @IsString()
  @IsOptional()
  SmsStatus!: string; // 'received', 'sent', 'delivered', etc.

  @IsString()
  @IsOptional()
  ApiVersion!: string;

  // Se houver mídia, a Twilio envia MediaUrl0, MediaUrl1...
  // Podemos capturar o resto como campos opcionais
  [key: string]: any;
}