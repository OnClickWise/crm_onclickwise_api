import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const TRIGGER_TYPES = [
  'job_posting',
  'employee_growth',
  'funding_round',
  'tech_adoption',
  'manual',
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const TRIGGER_STATUSES = ['active', 'paused'] as const;
export type TriggerStatus = (typeof TRIGGER_STATUSES)[number];

export const NOTIFY_VIA = ['in_app', 'email', 'both'] as const;
export type NotifyVia = (typeof NOTIFY_VIA)[number];

export const EVENT_STATUSES = ['new', 'seen', 'acted', 'dismissed'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export class CreateTriggerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsIn(TRIGGER_TYPES as unknown as string[])
  triggerType!: TriggerType;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsIn(TRIGGER_STATUSES as unknown as string[])
  status?: TriggerStatus;

  @IsOptional()
  @IsIn(NOTIFY_VIA as unknown as string[])
  notifyVia?: NotifyVia;

  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;
}

export class UpdateTriggerDto {
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
  @IsIn(TRIGGER_TYPES as unknown as string[])
  triggerType?: TriggerType;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsIn(TRIGGER_STATUSES as unknown as string[])
  status?: TriggerStatus;

  @IsOptional()
  @IsIn(NOTIFY_VIA as unknown as string[])
  notifyVia?: NotifyVia;

  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;
}

export class CreateManualEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string;

  @IsOptional()
  @IsUUID('4')
  companyId?: string;

  @IsOptional()
  @IsUUID('4')
  personId?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class UpdateEventStatusDto {
  @IsIn(EVENT_STATUSES as unknown as string[])
  status!: EventStatus;
}

export class CheckTriggerDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
}
