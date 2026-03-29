import { IsUUID } from 'class-validator';

export class MarkChatMessageReadDto {
  @IsUUID()
  messageId: string;
}
