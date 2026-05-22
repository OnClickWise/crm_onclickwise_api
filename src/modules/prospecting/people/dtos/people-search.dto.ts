import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PeopleSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  /** Cargos: ["CTO", "VP Engineering"]. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  titles?: string[];

  /** Senioridades Apollo: owner, founder, c_suite, vp, director, manager, senior, entry, intern. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seniorities?: string[];

  /** Departamentos: engineering, sales, marketing, finance, operations, hr, product, … */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departments?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  personLocations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizationDomains?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizationLocations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  organizationEmployeeRanges?: string[];

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

export class EnrichPersonDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  apolloPersonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkedinUrl?: string;

  /** Se já temos o prospect_people salvo, atualiza ele. */
  @IsOptional()
  @IsUUID('4')
  prospectPersonId?: string;
}
