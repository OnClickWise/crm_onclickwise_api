import { IsEmail, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  name!: string; // Adicione o '!' aqui

  @IsEmail()
  email!: string; // Adicione o '!' aqui

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



