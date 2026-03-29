import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';
import { SendChatAudioMessageDto } from '@/modules/chat/dtos/send-chat-audio-message.dto';

@Injectable()
export class SendChatAudioMessageUseCase {
  constructor(private readonly chatService: ChatService) {}

  /**
   * Executa o fluxo de envio de mensagem de áudio
   * @param channelId ID do canal
   * @param data DTO com arquivo de áudio
   * @param user Usuário autenticado
   * @returns Mensagem criada com URL do áudio
   */
  async execute(channelId: string, data: SendChatAudioMessageDto, user: any) {
    return this.chatService.sendAudioMessage(channelId, data.file, user);
  }
}
