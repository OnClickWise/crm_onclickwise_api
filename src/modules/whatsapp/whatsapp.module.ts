// src/modules/whatsapp/whatsapp.module.ts

import { Module } from '@nestjs/common';
import { WhatsappController } from '@/modules/whatsapp/whatsapp.controller';
import { WhatsappRepository } from './repositories/whatsapp.repository';

// Use Cases de Configuração e Conta
import { LinkWhatsappAccountUseCase } from '@/use-cases/whatsapp/link-whatsapp-account.useCase';
import { DisconnectWhatsappUseCase } from '@/use-cases/whatsapp/remove-whatsapp-account.useCase';

// Use Cases de Mensageria e Webhooks
import { SendWhatsappMessageUseCase } from '@/use-cases/whatsapp/send-whatsapp-message.useCase';
import { ReceiveWhatsappWebhookUseCase } from '@/use-cases/whatsapp/receive-whatsapp-webhook.useCase';
import { UpdateMessageStatusUseCase } from '@/use-cases/whatsapp/update-message-status.useCase';

// Use Cases de UI/Chat
import { GetConversationsUseCase } from '@/use-cases/whatsapp/list-whatsapp-conversations.useCase';
import { GetMessagesUseCase } from '@/use-cases/whatsapp/get-messages-from-conversation.useCase';
import { MarkAsReadUseCase } from '@/use-cases/whatsapp/mark-read.useCase';


import { DatabaseModule } from '@/shared/database/database.module'; // ajuste o path

@Module({
  imports: [
    DatabaseModule
  ], // Caso precise de outros módulos como AuthModule ou DatabaseModule
  controllers: [WhatsappController],
  providers: [
    // Repositório para persistência de dados
    WhatsappRepository,

    // Registro de todos os casos de uso
    LinkWhatsappAccountUseCase,
    DisconnectWhatsappUseCase,
    SendWhatsappMessageUseCase,
    ReceiveWhatsappWebhookUseCase,
    UpdateMessageStatusUseCase,
    GetConversationsUseCase,
    GetMessagesUseCase,
    MarkAsReadUseCase,
  ],
  exports: [
    // Exportamos o Repositório caso outros módulos precisem consultar dados do WhatsApp
    WhatsappRepository,
  ],
})
export class WhatsappModule {}