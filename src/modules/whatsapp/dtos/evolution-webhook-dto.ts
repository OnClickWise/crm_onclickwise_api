import { IsString, IsNotEmpty, IsOptional, IsObject, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class MessageKeyDto {
  @IsString()
  @IsNotEmpty()
  remoteJid!: string;

  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsOptional()
  fromMe?: boolean;
}

class MessageDataDto {
  @IsObject()
  @IsNotEmpty()
  key!: MessageKeyDto;

  @IsObject()
  @IsOptional()
  message?: any; // Pode ser complexo, deixamos flexível ou detalhamos conforme necessidade

  @IsNumber()
  @IsNotEmpty()
  messageTimestamp!: number;

  @IsString()
  @IsOptional()
  pushName?: string;
}

export class EvolutionWebhookDto {
  @IsString()
  @IsNotEmpty()
  event!: string; // Ex: "messages.upsert"

  @IsString()
  @IsNotEmpty()
  instance!: string; // O nome da instância (instance_name)

  @IsObject()
  @IsNotEmpty()
  @Type(() => MessageDataDto)
  data!: MessageDataDto;
}