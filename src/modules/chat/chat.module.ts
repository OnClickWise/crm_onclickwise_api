import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './services/chat.service';
import { ChatGateway } from './chat.gateway';
import { DatabaseModule } from '@/shared/database/database.module';
import {
  AddChatChannelMemberUseCase,
  CreateChatChannelUseCase,
  CreateChatPollUseCase,
  DeleteChatChannelUseCase,
  DeleteChatMessageUseCase,
  ListChatAttachmentsUseCase,
  ListChatChannelMembersUseCase,
  ListChatChannelsUseCase,
  ListChatMessagesUseCase,
  ListChatPollsUseCase,
  MarkChatMessageReadUseCase,
  ReactChatMessageUseCase,
  SendChatMessageUseCase,
  SendChatAudioMessageUseCase,
  StartChatVideoCallUseCase,
  UpdateChatMessageUseCase,
  UploadChatAttachmentUseCase,
  VoteChatPollUseCase,
} from '@/use-cases/chat';

@Module({
  imports: [DatabaseModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatGateway,
    CreateChatChannelUseCase,
    ListChatChannelsUseCase,
    DeleteChatChannelUseCase,
    AddChatChannelMemberUseCase,
    ListChatChannelMembersUseCase,
    SendChatMessageUseCase,
    SendChatAudioMessageUseCase,
    ListChatMessagesUseCase,
    MarkChatMessageReadUseCase,
    UpdateChatMessageUseCase,
    DeleteChatMessageUseCase,
    ListChatAttachmentsUseCase,
    UploadChatAttachmentUseCase,
    CreateChatPollUseCase,
    ListChatPollsUseCase,
    VoteChatPollUseCase,
    ReactChatMessageUseCase,
    StartChatVideoCallUseCase,
  ],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
