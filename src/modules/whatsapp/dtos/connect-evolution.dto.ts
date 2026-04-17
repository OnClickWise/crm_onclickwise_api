import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class ConnectEvolutionDto {
  @IsString()
  @IsNotEmpty()
  instanceName!: string; // Mudamos para camelCase para bater com a Evolution

  @IsString()
  @IsOptional() // Opcional no DTO, mas mandamos padrão se vier vazio
  integration?: string;

  @IsBoolean()
  @IsOptional()
  qrcode?: boolean;
}