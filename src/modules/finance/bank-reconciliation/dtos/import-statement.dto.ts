import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class StatementLineDto {
  @IsISO8601()
  transactionDate!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number; // positivo = entrada, negativo = saída

  @IsString()
  @MaxLength(50)
  transactionType!: string; // 'credit' | 'debit' | 'transfer' | 'fee' | livre

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class ImportStatementDto {
  @IsUUID('4')
  bankAccountId!: string;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  openingBalance!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  closingBalance!: number;

  @IsIn(['csv', 'ofx', 'manual'])
  sourceType!: 'csv' | 'ofx' | 'manual';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceFilename?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StatementLineDto)
  lines!: StatementLineDto[];
}

export class ReconcileLineDto {
  @IsUUID('4')
  statementLineId!: string;

  @IsOptional()
  @IsUUID('4')
  matchedTransactionId?: string;

  @IsIn(['matched', 'pending', 'discrepancy', 'unmatched'])
  matchStatus!: 'matched' | 'pending' | 'discrepancy' | 'unmatched';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  varianceAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
