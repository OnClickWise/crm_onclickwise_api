import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsISO31661Alpha2,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Tipos de identificação fiscal — abertos para qualquer país.
 * Validação leniente: se 'other' ou desconhecido, aceita string livre.
 */
export const TAX_ID_TYPES = [
  'cnpj', // BR pessoa jurídica
  'cpf', // BR pessoa física
  'nif', // PT/AO/ES
  'nipc', // PT empresa
  'ssn', // US individual
  'ein', // US business
  'tin', // US tax id (genérico)
  'siret', // FR
  'siren', // FR
  'rfc', // MX
  'cif', // ES (legado)
  'other',
] as const;

export class CreateCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsString()
  @MinLength(2, { message: 'Nome deve ter ao menos 2 caracteres' })
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxIdType?: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  postalCode?: string;

  @IsOptional()
  @IsISO31661Alpha2({ message: 'País deve ser código ISO 3166-1 alpha-2 (ex.: BR, AO, PT)' })
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  defaultCurrency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsObject()
  withholdingConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
