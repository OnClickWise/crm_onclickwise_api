import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReceivableDto {
  @IsOptional()
  @IsUUID('4', { message: 'ID do cliente inválido' })
  customerId?: string;

  @IsString({ message: 'Nome do cliente deve ser um texto' })
  @MaxLength(255, { message: 'Nome do cliente deve ter no máximo 255 caracteres' })
  customerName: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Valor deve ser um número' })
  @Min(0.01, { message: 'Valor deve ser maior que zero' })
  originalAmount: number;

  @IsISO8601({}, { message: 'Data de vencimento inválida' })
  dueDate: string;

  @IsOptional()
  @IsString({ message: 'Descrição deve ser um texto' })
  @MaxLength(500, { message: 'Descrição deve ter no máximo 500 caracteres' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Número de referência deve ser um texto' })
  @MaxLength(100, { message: 'Número de referência deve ter no máximo 100 caracteres' })
  referenceNumber?: string;

  @IsOptional()
  @IsString({ message: 'Tipo de referência deve ser um texto' })
  @MaxLength(100, { message: 'Tipo de referência deve ter no máximo 100 caracteres' })
  referenceType?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID de referência inválido' })
  referenceId?: string;
}

export class UpdateReceivableDto {
  @IsOptional()
  @IsString({ message: 'Nome do cliente deve ser um texto' })
  @MaxLength(255, { message: 'Nome do cliente deve ter no máximo 255 caracteres' })
  customerName?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Data de vencimento inválida' })
  dueDate?: string;

  @IsOptional()
  @IsString({ message: 'Descrição deve ser um texto' })
  @MaxLength(500, { message: 'Descrição deve ter no máximo 500 caracteres' })
  description?: string;

  @IsOptional()
  @IsEnum(['draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled'], {
    message: 'Status inválido',
  })
  status?: string;
}

export class RecordPaymentDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'Valor do pagamento deve ser um número' })
  @Min(0.01, { message: 'Valor do pagamento deve ser maior que zero' })
  amount: number;

  @IsISO8601({}, { message: 'Data de pagamento inválida' })
  paymentDate: string;

  @IsOptional()
  @IsString({ message: 'Método de pagamento deve ser um texto' })
  @MaxLength(50, { message: 'Método de pagamento deve ter no máximo 50 caracteres' })
  paymentMethod?: string;

  @IsOptional()
  @IsString({ message: 'Referência do pagamento deve ser um texto' })
  @MaxLength(100, { message: 'Referência deve ter no máximo 100 caracteres' })
  paymentReference?: string;

  @IsOptional()
  @IsString({ message: 'Notas deve ser um texto' })
  notes?: string;
}
