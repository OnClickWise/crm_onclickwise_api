import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class IcpCriteria {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industries?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  employeeMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  employeeMax?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technologies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seniorities?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departments?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywordsInTitle?: string[];
}

export class IcpWeights {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  industry?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  employeeSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  country?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  technology?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seniority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  department?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  titleKeyword?: number;
}

export class CreateIcpDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsObject()
  criteria!: Record<string, unknown>;

  @IsObject()
  weights!: Record<string, unknown>;
}

export class UpdateIcpDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  color?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  criteria?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  weights?: Record<string, unknown>;
}
