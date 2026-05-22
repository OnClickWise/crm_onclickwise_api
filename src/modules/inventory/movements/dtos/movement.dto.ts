import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const MOVEMENT_TYPES = [
  'in',
  'out',
  'transfer_in',
  'transfer_out',
  'adjustment_positive',
  'adjustment_negative',
  'inventory_count',
  'opening',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export class CreateAdjustmentDto {
  @IsUUID('4')
  productId!: string;

  @IsUUID('4')
  warehouseId!: string;

  /** Positiva = entrada (sobra); negativa = saída (perda/quebra). */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  delta!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost?: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class CreateTransferDto {
  @IsUUID('4')
  warehouseFromId!: string;

  @IsUUID('4')
  warehouseToId!: string;

  @IsString()
  transferDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddTransferItemDto {
  @IsUUID('4')
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
