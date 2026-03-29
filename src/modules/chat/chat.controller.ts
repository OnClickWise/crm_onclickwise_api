import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
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
import {
  AddChatChannelMemberDto,
  CreateChatChannelDto,
  CreateChatPollDto,
  MarkChatMessageReadDto,
  ReactChatMessageDto,
  SendChatMessageDto,
  SendChatAudioMessageDto,
  UpdateChatMessageDto,
  VoteChatPollDto,
} from './dtos';
import { ChatGateway } from './chat.gateway';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly createChatChannelUseCase: CreateChatChannelUseCase,
    private readonly listChatChannelsUseCase: ListChatChannelsUseCase,
    private readonly deleteChatChannelUseCase: DeleteChatChannelUseCase,
    private readonly addChatChannelMemberUseCase: AddChatChannelMemberUseCase,
    private readonly listChatChannelMembersUseCase: ListChatChannelMembersUseCase,
    private readonly sendChatMessageUseCase: SendChatMessageUseCase,
    private readonly sendChatAudioMessageUseCase: SendChatAudioMessageUseCase,
    private readonly listChatMessagesUseCase: ListChatMessagesUseCase,
    private readonly markChatMessageReadUseCase: MarkChatMessageReadUseCase,
    private readonly updateChatMessageUseCase: UpdateChatMessageUseCase,
    private readonly deleteChatMessageUseCase: DeleteChatMessageUseCase,
    private readonly listChatAttachmentsUseCase: ListChatAttachmentsUseCase,
    private readonly uploadChatAttachmentUseCase: UploadChatAttachmentUseCase,
    private readonly createChatPollUseCase: CreateChatPollUseCase,
    private readonly listChatPollsUseCase: ListChatPollsUseCase,
    private readonly voteChatPollUseCase: VoteChatPollUseCase,
    private readonly reactChatMessageUseCase: ReactChatMessageUseCase,
    private readonly startChatVideoCallUseCase: StartChatVideoCallUseCase,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('channels')
  listChannels(@Request() req: any) {
    return this.listChatChannelsUseCase.execute(req.user);
  }

  @Post('channels')
  async createChannel(@Body() body: CreateChatChannelDto, @Request() req: any) {
    const channel = await this.createChatChannelUseCase.execute(body, req.user);
    this.chatGateway.emitChannelsUpdated(req.user.organizationId, {
      reason: 'channel-created',
      channelId: channel?.id,
    });
    return channel;
  }

  @Delete('channels/:channelId')
  async deleteChannel(@Param('channelId') channelId: string, @Request() req: any) {
    const result = await this.deleteChatChannelUseCase.execute(channelId, req.user);
    this.chatGateway.emitChannelsUpdated(req.user.organizationId, {
      reason: 'channel-deleted',
      channelId,
    });
    return result;
  }

  @Get('channels/:channelId/members')
  listMembers(@Param('channelId') channelId: string, @Request() req: any) {
    return this.listChatChannelMembersUseCase.execute(channelId, req.user);
  }

  @Post('channels/:channelId/members')
  async addMember(
    @Param('channelId') channelId: string,
    @Body() body: AddChatChannelMemberDto,
    @Request() req: any,
  ) {
    const members = await this.addChatChannelMemberUseCase.execute(channelId, body, req.user);
    this.chatGateway.emitChannelsUpdated(req.user.organizationId, {
      reason: 'member-added',
      channelId,
    });
    return members;
  }

  @Get('channels/:channelId/messages')
  listMessages(
    @Param('channelId') channelId: string,
    @Query('limit') limitRaw: string,
    @Query('before') before: string,
    @Request() req: any,
  ) {
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    return this.listChatMessagesUseCase.execute(channelId, req.user, limit, before);
  }

  @Get('channels/:channelId/attachments')
  listAttachments(
    @Param('channelId') channelId: string,
    @Query('type') type?: 'attachment' | 'video' | 'audio',
    @Request() req?: any,
  ) {
    return this.listChatAttachmentsUseCase.execute(channelId, type, req?.user);
  }

  @Post('channels/:channelId/messages')
  async sendMessage(
    @Param('channelId') channelId: string,
    @Body() body: SendChatMessageDto,
    @Request() req: any,
  ) {
    const message = await this.sendChatMessageUseCase.execute(channelId, body, req.user);
    this.chatGateway.emitMessageToChannel(req.user.organizationId, channelId, message);
    this.chatGateway.emitChannelsUpdated(req.user.organizationId, {
      reason: 'message-sent',
      channelId,
    });
    return message;
  }

  /**
   * Endpoint para enviar mensagens de áudio (gravações de voz)
   * Content-Type: multipart/form-data
   * Campo: file (arquivo de áudio)
   *
   * Tipos suportados: audio/mpeg, audio/wav, audio/mp4, audio/aac, etc
   * Tamanho máximo: 50MB
   *
   * Exemplo com curl:
   * curl -X POST http://localhost:3000/chat/channels/{id}/messages/audio \
   *   -H "Authorization: Bearer TOKEN" \
   *   -F "file=@recording.m4a"
   */
  @Post('channels/:channelId/messages/audio')
  async sendAudioMessage(
    @Param('channelId') channelId: string,
    @Req() req: any,
  ) {
    const file = await req.file();
    const message = await this.sendChatAudioMessageUseCase.execute(channelId, { file }, req.user);
    
    // Emitir para todos os clientes do canal via WebSocket
    this.chatGateway.emitMessageToChannel(req.user.organizationId, channelId, message);
    
    // Notificar que há novo message no canal
    this.chatGateway.emitChannelsUpdated(req.user.organizationId, {
      reason: 'audio-message-sent',
      channelId,
    });
    
    return message;
  }

  @Post('channels/:channelId/read')
  markRead(
    @Param('channelId') channelId: string,
    @Body() body: MarkChatMessageReadDto,
    @Request() req: any,
  ) {
    return this.markChatMessageReadUseCase.execute(channelId, body, req.user);
  }

  @Post('channels/:channelId/upload')
  async uploadAttachment(@Param('channelId') channelId: string, @Req() req: any) {
    const file = await req.file();
    const message = await this.uploadChatAttachmentUseCase.execute(channelId, file, req.user);
    this.chatGateway.emitMessageToChannel(req.user.organizationId, channelId, message);
    this.chatGateway.emitChannelsUpdated(req.user.organizationId, {
      reason: 'attachment-sent',
      channelId,
    });
    return message;
  }

  @Get('channels/:channelId/polls')
  listPolls(@Param('channelId') channelId: string, @Request() req: any) {
    return this.listChatPollsUseCase.execute(channelId, req.user);
  }

  @Post('channels/:channelId/polls')
  createPoll(
    @Param('channelId') channelId: string,
    @Body() body: CreateChatPollDto,
    @Request() req: any,
  ) {
    return this.createChatPollUseCase.execute(channelId, body, req.user);
  }

  @Post('channels/:channelId/polls/:pollId/vote')
  votePoll(
    @Param('channelId') channelId: string,
    @Param('pollId') pollId: string,
    @Body() body: VoteChatPollDto,
    @Request() req: any,
  ) {
    return this.voteChatPollUseCase.execute(channelId, pollId, body, req.user);
  }

  @Post('channels/:channelId/messages/:messageId/reactions')
  reactToMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: ReactChatMessageDto,
    @Request() req: any,
  ) {
    return this.reactChatMessageUseCase.execute(channelId, messageId, body, req.user);
  }

  @Patch('channels/:channelId/messages/:messageId')
  async updateMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: UpdateChatMessageDto,
    @Request() req: any,
  ) {
    const message = await this.updateChatMessageUseCase.execute(channelId, messageId, body, req.user);
    this.chatGateway.emitMessageToChannel(req.user.organizationId, channelId, message);
    return message;
  }

  @Delete('channels/:channelId/messages/:messageId')
  async deleteMessage(
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Request() req: any,
  ) {
    const result = await this.deleteChatMessageUseCase.execute(channelId, messageId, req.user);
    this.chatGateway.emitMessageToChannel(req.user.organizationId, channelId, {
      id: messageId,
      deleted: true,
    });
    return result;
  }

  @Post('channels/:channelId/video-call')
  startVideoCall(@Param('channelId') channelId: string, @Request() req: any) {
    return this.startChatVideoCallUseCase.execute(channelId, req.user);
  }
}
