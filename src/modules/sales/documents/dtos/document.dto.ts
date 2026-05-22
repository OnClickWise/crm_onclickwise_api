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

export const DOC_TYPES = [
  'quote',
  'order',
  'delivery',
  'invoice',
  'credit_note',
  'customer_return',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'invoiced',
  'paid',
  'partially_paid',
  'cancelled',
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export class CreateDocumentLineDto {
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
  unitPrice!: number;

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
  notes?: string;
}

export class CreateDocumentDto {
  @IsIn(DOC_TYPES as unknown as string[])
  docType!: DocType;

  @IsUUID('4')
  customerId!: string;

  @IsOptional()
  @IsUUID('4')
  priceListId?: string;

  /** Série específica para a numeração. Se omitido, usa a série default ativa. */
  @IsOptional()
  @IsUUID('4')
  seriesId?: string;

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

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
  @Type(() => CreateDocumentLineDto)
  lines!: CreateDocumentLineDto[];
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @IsOptional()
  @IsUUID('4')
  priceListId?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

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
  @Type(() => CreateDocumentLineDto)
  lines?: CreateDocumentLineDto[];
}

export class ChangeStatusDto {
  @IsIn(DOC_STATUSES as unknown as string[])
  status!: DocStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConvertDocumentDto {
  @IsIn(DOC_TYPES as unknown as string[])
  toDocType!: DocType;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsObject()
  overrides?: Record<string, unknown>;
}
