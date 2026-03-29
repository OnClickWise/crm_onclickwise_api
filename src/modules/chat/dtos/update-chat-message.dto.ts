import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateChatMessageDto {
  @IsString()
  @MinLength(1)
  body: string;

  @IsOptional()
  metadata?: Record<string, any>;
}
