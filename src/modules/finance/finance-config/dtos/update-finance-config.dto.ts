import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const TAX_MODES = ['inclusive', 'exclusive', 'none'] as const;
export type TaxMode = (typeof TAX_MODES)[number];

export class UpdateFinanceConfigDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}-[A-Z]{2}$/, { message: 'Locale deve estar no formato xx-XX (ex.: pt-BR, en-US)' })
  locale?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, { message: 'Moeda deve ter 3 letras maiúsculas (ISO 4217)' })
  defaultCurrency?: string;

  @IsOptional()
  @IsISO31661Alpha2({ message: 'País deve ser código ISO 3166-1 alpha-2' })
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @IsOptional()
  @IsIn(TAX_MODES, { message: 'Modo de imposto inválido' })
  taxMode?: TaxMode;

  @IsOptional()
  @IsString()
  @Length(1, 1)
  decimalSeparator?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1)
  thousandsSeparator?: string;
}
