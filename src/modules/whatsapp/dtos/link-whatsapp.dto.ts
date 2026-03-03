// src/modules/whatsapp/dto/link-whatsapp-account.dto.ts
import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class LinkWhatsappAccountDto {
  @IsString()
  @IsNotEmpty()
  twilio_account_name!: string; // O número oficial (ex: +14155238886)

  @IsString()
  @IsNotEmpty()
  twilio_account_sid!: string;

  @IsString()
  @IsNotEmpty()
  twilio_auth_token!: string;
}