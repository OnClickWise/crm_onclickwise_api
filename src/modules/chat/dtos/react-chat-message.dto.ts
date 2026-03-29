import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReactChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji: string;
}
