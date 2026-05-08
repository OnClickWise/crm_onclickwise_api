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
  Min,
  ValidateNested,
} from 'class-validator';

export class JournalEntryLineDto {
  @IsUUID()
  accountId: string;

  @IsIn(['debit', 'credit'])
  lineType: 'debit' | 'credit';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class CreateJournalEntryDto {
  @IsString()
  @MaxLength(1000)
  description: string;

  @IsOptional()
  @IsISO8601()
  entryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceType?: string;

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsUUID()
  transactionId?: string;

  // Diário e documento opcionais — quando informados, o lançamento recebe
  // um número sequencial dentro do diário/período (vide AccountingService).
  @IsOptional()
  @IsUUID()
  journalId?: string;

  @IsOptional()
  @IsUUID()
  documentId?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineDto)
  lines: JournalEntryLineDto[];
}
