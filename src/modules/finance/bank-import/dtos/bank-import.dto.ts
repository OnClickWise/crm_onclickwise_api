import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ParseStatementDto {
  @IsIn(['ofx', 'csv'])
  format!: 'ofx' | 'csv';

  @IsString()
  @MinLength(1)
  content!: string;
}

export class ImportStatementDto {
  @IsUUID('4')
  bankAccountId!: string;

  @IsIn(['ofx', 'csv'])
  format!: 'ofx' | 'csv';

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class ConfirmMatchDto {
  @IsUUID('4')
  statementLineId!: string;

  @IsIn(['receivable', 'payable'])
  targetType!: 'receivable' | 'payable';

  @IsUUID('4')
  targetId!: string;
}
