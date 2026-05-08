import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class AllocationLineDto {
  @IsIn(['receivable', 'payable'])
  invoiceKind!: 'receivable' | 'payable';

  @IsUUID('4')
  invoiceId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AllocatePaymentDto {
  @IsIn(['receivable', 'payable'])
  paymentKind!: 'receivable' | 'payable';

  @IsUUID('4')
  paymentId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Informe pelo menos uma alocação' })
  @ValidateNested({ each: true })
  @Type(() => AllocationLineDto)
  allocations!: AllocationLineDto[];
}
