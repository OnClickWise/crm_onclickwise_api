import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const COUNT_STATUSES = ['open', 'counting', 'closed', 'cancelled'] as const;
export type CountStatus = (typeof COUNT_STATUSES)[number];

export const COUNT_TYPES = ['full', 'partial'] as const;
export type CountType = (typeof COUNT_TYPES)[number];

export class CreateCountDto {
  @IsUUID('4')
  warehouseId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsIn(COUNT_TYPES as unknown as string[])
  countType?: CountType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoryFilter?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordCountDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  countedQuantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
