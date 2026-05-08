import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO31661Alpha2,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Tipos universais de imposto suportados:
 *   - vat: IVA / TVA / VAT (AO, PT, ES, FR, etc)
 *   - sales_tax: imposto de vendas (US — varia por estado)
 *   - withholding: retenção na fonte (BR, AO, PT)
 *   - icms / iss / ipi / pis / cofins: específicos do Brasil
 *   - other: extensível
 */
export const TAX_TYPES = [
  'vat',
  'sales_tax',
  'withholding',
  'icms',
  'iss',
  'ipi',
  'pis',
  'cofins',
  'other',
] as const;

export type TaxType = (typeof TAX_TYPES)[number];

export class CreateTaxRateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'Código aceita apenas letras, números, ".", "_" ou "-"',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(TAX_TYPES, { message: 'Tipo de imposto inválido' })
  taxType!: TaxType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0, { message: 'Alíquota deve ser >= 0' })
  @Max(100, { message: 'Alíquota deve ser <= 100' })
  rate!: number;

  @IsOptional()
  @IsISO31661Alpha2({ message: 'País deve ser código ISO 3166-1 alpha-2' })
  country?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID de conta contábil inválido' })
  accountId?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
