import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const SEQUENCE_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;
export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

export const STEP_TYPES = [
  'email_manual',
  'email_auto',
  'linkedin_connect',
  'linkedin_message',
  'call_task',
  'custom_task',
  'wait',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const ENROLLMENT_STATUSES = [
  'active',
  'paused',
  'completed',
  'replied',
  'unsubscribed',
  'failed',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export class CreateSequenceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(9)
  color?: string;

  @IsOptional()
  @IsIn(SEQUENCE_STATUSES as unknown as string[])
  status?: SequenceStatus;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class UpdateSequenceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(9)
  color?: string;

  @IsOptional()
  @IsIn(SEQUENCE_STATUSES as unknown as string[])
  status?: SequenceStatus;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class CreateStepDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stepOrder?: number;

  @IsIn(STEP_TYPES as unknown as string[])
  stepType!: StepType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  waitDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsOptional()
  @IsString()
  bodyTemplate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateStepDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stepOrder?: number;

  @IsOptional()
  @IsIn(STEP_TYPES as unknown as string[])
  stepType?: StepType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  waitDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @IsOptional()
  @IsString()
  bodyTemplate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class EnrollPeopleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  personIds!: string[];

  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;
}

export class UpdateEnrollmentDto {
  @IsOptional()
  @IsIn(ENROLLMENT_STATUSES as unknown as string[])
  status?: EnrollmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pauseReason?: string;

  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;
}

export class CompleteExecutionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcomeNotes?: string;

  @IsOptional()
  @IsIn(['completed', 'skipped', 'failed'])
  status?: 'completed' | 'skipped' | 'failed';
}
