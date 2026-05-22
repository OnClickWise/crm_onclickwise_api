import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const AMOUNT_SOURCES = [
  'total',
  'subtotal',
  'tax',
  'discount',
  'withholding',
  'net_total',
  'payment_amount',
  'cogs',
] as const;

export class RuleLineDto {
  @IsIn(['debit', 'credit'])
  lineType!: 'debit' | 'credit';

  @IsOptional()
  @IsUUID('4')
  accountId?: string | null;

  @IsIn(AMOUNT_SOURCES as unknown as string[])
  amountSource!: (typeof AMOUNT_SOURCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  memoTemplate?: string;
}

export class UpsertRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPost?: boolean;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => RuleLineDto)
  lines!: RuleLineDto[];
}
