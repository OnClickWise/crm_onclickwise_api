import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  name!: string; 

  @IsEmail()
  email!: string; 

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  ssn?: string;

  @IsString()
  @IsOptional()
  ein?: string;
}



