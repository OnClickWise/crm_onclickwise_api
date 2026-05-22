import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(9)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(9)
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyLegalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  companyTaxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  companyTaxIdType?: string;

  @IsOptional()
  @IsString()
  companyAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  companyCountry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  companyPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyWebsite?: string;

  @IsOptional()
  @IsString()
  documentFooter?: string;

  @IsOptional()
  @IsString()
  emailSignature?: string;
}
