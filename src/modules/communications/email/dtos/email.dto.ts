import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertEmailSettingsDto {
  @IsString()
  @MaxLength(255)
  smtpHost!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort!: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsString()
  @MaxLength(255)
  smtpUser!: string;

  @IsString()
  smtpPassword!: string;

  @IsEmail()
  fromEmail!: string;

  @IsString()
  @MaxLength(180)
  fromName!: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @IsOptional()
  @IsEmail()
  bcc?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SendDocumentEmailDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @IsOptional()
  @IsString()
  message?: string;

  /** Se true, anexa o PDF do documento. Default: true. */
  @IsOptional()
  @IsBoolean()
  attachPdf?: boolean;
}

export class TestSmtpDto {
  @IsEmail()
  testRecipient!: string;
}
