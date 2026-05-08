import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const ACCOUNT_TYPES = ['cash', 'checking', 'savings', 'investment', 'credit'] as const;
export type BankAccountType = (typeof ACCOUNT_TYPES)[number];

export class CreateBankAccountDto {
  @IsString()
  @MinLength(1, { message: 'Código do banco/caixa é obrigatório' })
  @MaxLength(10)
  // Permite alfanumérico para caixas locais (ex.: "CXA01") e códigos de banco numéricos.
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'Código aceita apenas letras, números, ".", "_" ou "-"' })
  bankCode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  bankName!: string;

  @IsString()
  @MinLength(1, { message: 'Número da conta é obrigatório' })
  @MaxLength(50)
  accountNumber!: string;

  @IsIn(ACCOUNT_TYPES, { message: 'Tipo de conta inválido' })
  accountType!: BankAccountType;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  accountHolder!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Saldo inicial não pode ser negativo' })
  initialBalance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  @Matches(/^[A-Z]{3}$/, { message: 'Moeda deve ter 3 letras maiúsculas (ex.: BRL, AOA, USD)' })
  currency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
