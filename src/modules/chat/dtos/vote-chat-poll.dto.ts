import { IsUUID } from 'class-validator';

export class VoteChatPollDto {
  @IsUUID()
  optionId: string;
}
