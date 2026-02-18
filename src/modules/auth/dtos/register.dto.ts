import {
  IsString,
  IsEmail,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RegisterRequest } from '../entities/auth/auth.entity';


class OrganizationDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsEmail()
  email: string;

  @IsString()
  company_id: string;

  @IsString()
  password: string;

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
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  position: string;

  @IsString()
  ssn: string;
}

export class RegisterDto implements RegisterRequest {
  @ValidateNested()
  @Type(() => OrganizationDto)
  organization: OrganizationDto;

  @ValidateNested()
  @Type(() => RepresentativeDto)
  representative: RepresentativeDto;
}
