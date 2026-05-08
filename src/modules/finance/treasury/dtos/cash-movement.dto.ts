import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const MOVEMENT_DIRECTIONS = ['inflow', 'outflow'] as const;
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

/**
 * Inspirado no Primavera "Movimento em Conta": registra entradas/saídas em caixa
 * ou banco fora do fluxo de AR/AP — usado para depósitos, saques, taxas bancárias,
 * suprimentos de caixa etc.
 */
export class CreateCashMovementDto {
  @IsUUID('4', { message: 'ID de conta bancária inválido' })
  bankAccountId!: string;

  @IsIn(MOVEMENT_DIRECTIONS, { message: 'Direção deve ser inflow ou outflow' })
  direction!: MovementDirection;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Valor deve ser maior que zero' })
  amount!: number;

  @IsISO8601({}, { message: 'Data inválida' })
  movementDate!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * Transferência entre duas contas — gera 2 movimentos atômicos (saída de A + entrada em B).
 */
export class CreateTransferDto {
  @IsUUID('4', { message: 'Conta de origem inválida' })
  fromBankAccountId!: string;

  @IsUUID('4', { message: 'Conta de destino inválida' })
  toBankAccountId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Valor deve ser maior que zero' })
  amount!: number;

  @IsISO8601({}, { message: 'Data inválida' })
  movementDate!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}
