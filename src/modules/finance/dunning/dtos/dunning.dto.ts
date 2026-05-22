import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDunningRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  /** Dias relativos ao vencimento (-3 = 3 dias antes; 0 = no dia; 15 = depois). */
  @Type(() => Number)
  @IsInt()
  offsetDays!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  subjectTemplate!: string;

  @IsString()
  @MinLength(2)
  bodyTemplate!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateDunningRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  offsetDays?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  subjectTemplate?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  bodyTemplate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}
