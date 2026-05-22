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

export const FULFILLMENT_STATUSES = [
  'pending',
  'assigned',
  'picking',
  'picked',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const FULFILLMENT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type FulfillmentPriority = (typeof FULFILLMENT_PRIORITIES)[number];

export const PICK_STATUSES = ['pending', 'picked', 'partial', 'missing', 'damaged'] as const;
export type PickStatus = (typeof PICK_STATUSES)[number];

export class AssignFulfillmentDto {
  @IsUUID('4')
  userId!: string;

  @IsOptional()
  @IsIn(FULFILLMENT_PRIORITIES as unknown as string[])
  priority?: FulfillmentPriority;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  warehouseLocation?: string;
}

export class UpdateFulfillmentDto {
  @IsOptional()
  @IsIn(FULFILLMENT_PRIORITIES as unknown as string[])
  priority?: FulfillmentPriority;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  warehouseLocation?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;
}

export class RecordPickDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  quantityPicked!: number;

  @IsIn(PICK_STATUSES as unknown as string[])
  status!: PickStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lotNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  binLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class PackFulfillmentDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  packageCount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ShipFulfillmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  carrier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string;

  /** Se true, gera Guia de Remessa (delivery doc) automaticamente. */
  @IsOptional()
  generateDeliveryDoc?: boolean;
}

export class CancelFulfillmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
