import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateChartAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(['asset', 'liability', 'equity', 'revenue', 'expense'])
  accountType?: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

  @IsOptional()
  @IsEnum(['debit', 'credit'])
  normalBalance?: 'debit' | 'credit';

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  allowsPosting?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceType?: string | null;

  @IsOptional()
  @IsUUID()
  referenceId?: string | null;
}