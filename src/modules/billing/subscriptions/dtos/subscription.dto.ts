import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { BILLING_CYCLES, BillingCycle } from '../../plans/dtos/plan.dto';

export class CreateSubscriptionDto {
  @IsUUID('4')
  customerId!: string;

  @IsUUID('4')
  planId!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** Sobrescreve quantidade do plano (ex.: número de assentos). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity?: number;

  /** Desconto fixo por ciclo (R$). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  discountAmount?: number;

  /** Override do valor (caso negocie fora da tabela do plano). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  amountOverride?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID('4')
  assignedUserId?: string;
}

export class ChangePlanDto {
  @IsUUID('4')
  newPlanId!: string;

  /**
   * Quando aplicar a mudança:
   *  immediate    — vale a partir de agora; fatura corrente NÃO é alterada
   *  next_cycle   — vale a partir da próxima fatura (default)
   */
  @IsOptional()
  @IsIn(['immediate', 'next_cycle'])
  effective?: 'immediate' | 'next_cycle';
}

export class CancelSubscriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /**
   * Quando encerrar:
   *  immediate      — cancela já
   *  end_of_period  — segue até o fim do período corrente (default)
   */
  @IsOptional()
  @IsIn(['immediate', 'end_of_period'])
  when?: 'immediate' | 'end_of_period';
}

// Re-export for convenience
export { BILLING_CYCLES, BillingCycle };
