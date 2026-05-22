import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const ENTITY_TYPES = [
  'sales_document',
  'purchase_document',
  'expense',
  'commission',
  'credit_limit_override',
] as const;
export type ApprovalEntityType = (typeof ENTITY_TYPES)[number];

export const OPERATORS = ['>', '>=', '<', '<=', '==', 'in'] as const;
export type ApprovalOperator = (typeof OPERATORS)[number];

export class TriggerConditionDto {
  @IsString()
  @MaxLength(80)
  field!: string;

  @IsIn(OPERATORS as unknown as string[])
  operator!: ApprovalOperator;

  // Pode ser number, string ou array — validação genérica
  value!: unknown;
}

export class CreateRuleDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(ENTITY_TYPES as unknown as string[])
  entityType!: ApprovalEntityType;

  @IsObject()
  @Type(() => TriggerConditionDto)
  triggerCondition!: TriggerConditionDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  approverRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  approverUserIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  approvalsRequired?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  @Type(() => TriggerConditionDto)
  triggerCondition?: TriggerConditionDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approverRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  approverUserIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  approvalsRequired?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
