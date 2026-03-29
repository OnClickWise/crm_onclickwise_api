import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChatPollDto {
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  options: string[];

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
