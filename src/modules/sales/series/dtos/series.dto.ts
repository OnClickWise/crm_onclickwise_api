import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const DOC_TYPES = ['quote', 'order', 'delivery', 'invoice', 'credit_note', 'customer_return'] as const;
export type SeriesDocType = (typeof DOC_TYPES)[number];

export class CreateSeriesDto {
  @IsIn(DOC_TYPES as unknown as string[])
  docType!: SeriesDocType;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  seriesCode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  prefix!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  fiscalAuthorizationCode?: string;
}

export class UpdateSeriesDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  fiscalAuthorizationCode?: string;
}
