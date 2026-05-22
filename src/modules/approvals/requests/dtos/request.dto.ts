import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const DECISIONS = ['approved', 'rejected'] as const;
export type ApprovalDecision = (typeof DECISIONS)[number];

export class DecideRequestDto {
  @IsIn(DECISIONS as unknown as string[])
  decision!: ApprovalDecision;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
