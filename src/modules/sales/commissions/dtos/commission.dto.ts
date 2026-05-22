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

export const COMMISSION_STATUSES = ['pending', 'eligible', 'paid', 'cancelled'] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export class CreateCommissionDto {
  @IsUUID('4')
  documentId!: string;

  @IsUUID('4')
  userId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  commissionPct!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateCommissionStatusDto {
  @IsIn(COMMISSION_STATUSES as unknown as string[])
  status!: CommissionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
