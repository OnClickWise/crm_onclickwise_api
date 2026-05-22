import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const PURCHASE_DOC_TYPES = [
  'request',
  'order',
  'receipt',
  'invoice',
  'credit_note',
  'return',
] as const;
export type PurchaseDocType = (typeof PURCHASE_DOC_TYPES)[number];

export const PURCHASE_DOC_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'received',
  'invoiced',
  'paid',
  'partially_paid',
  'cancelled',
] as const;
export type PurchaseDocStatus = (typeof PURCHASE_DOC_STATUSES)[number];

export class CreatePurchaseLineDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  lineOrder?: number;

  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  discountPct?: number;

  @IsOptional()
  @IsUUID('4')
  taxRateId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  taxRatePct?: number;

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
  notes?: string;
}

export class CreatePurchaseDocumentDto {
  @IsIn(PURCHASE_DOC_TYPES as unknown as string[])
  docType!: PurchaseDocType;

  @IsUUID('4')
  supplierId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  supplierDocNumber?: string;

  @IsOptional()
  @IsDateString()
  supplierDocDate?: string;

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  exchangeRate?: number;

  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  withholdingAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentMethod?: string;

  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseLineDto)
  lines!: CreatePurchaseLineDto[];
}

export class UpdatePurchaseDocumentDto {
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  supplierDocNumber?: string;

  @IsOptional()
  @IsDateString()
  supplierDocDate?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0)
  exchangeRate?: number;

  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  withholdingAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  paymentMethod?: string;

  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseLineDto)
  lines?: CreatePurchaseLineDto[];
}

export class ChangePurchaseStatusDto {
  @IsIn(PURCHASE_DOC_STATUSES as unknown as string[])
  status!: PurchaseDocStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConvertPurchaseDto {
  @IsIn(PURCHASE_DOC_TYPES as unknown as string[])
  toDocType!: PurchaseDocType;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Para recepção parcial: array de { lineId, quantityReceived }. Se omitido, recebe todas as quantidades pedidas. */
  @IsOptional()
  @IsObject()
  partialReceipts?: Record<string, number>;
}

export class ReceiveLineDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  quantityReceived!: number;

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
  notes?: string;
}
