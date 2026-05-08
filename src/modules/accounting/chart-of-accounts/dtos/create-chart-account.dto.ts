import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateChartAccountDto {
  @IsString()
  @MaxLength(40)
  code: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsEnum(['asset', 'liability', 'equity', 'revenue', 'expense'])
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

  @IsEnum(['debit', 'credit'])
  normalBalance: 'debit' | 'credit';

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  allowsPosting?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceType?: string;

  @IsOptional()
  @IsUUID()
  referenceId?: string;
}