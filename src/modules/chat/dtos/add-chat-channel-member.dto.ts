import { IsIn, IsString, IsUUID } from 'class-validator';

export class AddChatChannelMemberDto {
  @IsUUID()
  userId: string;

  @IsString()
  @IsIn(['member', 'moderator'])
  role: 'member' | 'moderator' = 'member';
}
