import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CompanySearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  /** Locations no formato Apollo: ["United States", "Brazil", "São Paulo, SP"]. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locations?: string[];

  /** Faixas de funcionários no formato Apollo: ["1,10", "11,50", "51,200"]. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeRanges?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technologies?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number;
}

export class EnrichCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  apolloOrgId?: string;
}
