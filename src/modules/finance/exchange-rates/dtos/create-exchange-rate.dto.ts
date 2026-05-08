import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export const FX_SOURCES = ['manual', 'api_brapi', 'api_openexchange', 'imported'] as const;
export type FxSource = (typeof FX_SOURCES)[number];

export class CreateExchangeRateDto {
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'fromCurrency deve ter 3 letras maiúsculas (ISO 4217)' })
  fromCurrency!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'toCurrency deve ter 3 letras maiúsculas (ISO 4217)' })
  toCurrency!: string;

  @IsISO8601({}, { message: 'Data inválida' })
  rateDate!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001, { message: 'Taxa deve ser maior que zero' })
  rate!: number;

  @IsOptional()
  @IsIn(FX_SOURCES, { message: 'Fonte inválida' })
  source?: FxSource;
}
