import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateJournalDocumentDto {
  @IsString()
  @MinLength(1, { message: 'Código do documento é obrigatório' })
  @MaxLength(10, { message: 'Código do documento aceita no máximo 10 caracteres' })
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'Código aceita apenas letras, números, ".", "_" ou "-"',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Conta padrão de débito inválida' })
  defaultDebitAccountId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Conta padrão de crédito inválida' })
  defaultCreditAccountId?: string;

  @IsOptional()
  @IsBoolean()
  allowsRecapitulative?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
