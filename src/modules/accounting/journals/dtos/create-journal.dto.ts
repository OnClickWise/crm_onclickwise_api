import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const JOURNAL_TYPES = [
  'sales',
  'purchases',
  'cash',
  'bank',
  'diverse',
  'opening',
  'regularization',
  'closing',
  'depreciation',
  'payroll',
  'taxes',
] as const;

export type JournalType = (typeof JOURNAL_TYPES)[number];

export const NUMBERING_MODES = ['continuous', 'monthly'] as const;
export type NumberingMode = (typeof NUMBERING_MODES)[number];

export class CreateJournalDto {
  @IsString({ message: 'Código do diário deve ser texto' })
  @MinLength(1, { message: 'Código do diário é obrigatório' })
  @MaxLength(10, { message: 'Código do diário aceita no máximo 10 caracteres' })
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message: 'Código aceita apenas letras, números, ".", "_" ou "-"',
  })
  code!: string;

  @IsString({ message: 'Nome do diário deve ser texto' })
  @MinLength(2, { message: 'Nome do diário é muito curto' })
  @MaxLength(120)
  name!: string;

  @IsEnum(JOURNAL_TYPES, { message: 'Tipo de diário inválido' })
  journalType!: JournalType;

  @IsOptional()
  @IsEnum(NUMBERING_MODES, { message: 'Modo de numeração inválido' })
  numberingMode?: NumberingMode;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'sortOrder deve ser inteiro' })
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
