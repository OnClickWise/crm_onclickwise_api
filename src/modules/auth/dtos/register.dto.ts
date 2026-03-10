import {
  IsString,
  IsEmail,
  ValidateNested,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RegisterRequest } from '../entities/auth/auth.entity';


class OrganizationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  company_id!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  address?: string;

  @IsOptional()
  city?: string;

  @IsOptional()
  state?: string;

  @IsOptional()
  country?: string;

  @IsOptional()
  logo_url?: string;
}

class RepresentativeDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  ssn?: string;
}

export class RegisterDto implements RegisterRequest {
  @ValidateNested()
  @Type(() => OrganizationDto)
  organization!: OrganizationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RepresentativeDto)
  representative?: RepresentativeDto;
}
