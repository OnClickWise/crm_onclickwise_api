// src/modules/whatsapp/use-cases/update-message-status.usecase.ts
import { Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { Inject } from '@nestjs/common';

@Injectable()
export class UpdateMessageStatusUseCase {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  async execute(twilioStatusData: any) {
    const { MessageSid, MessageStatus } = twilioStatusData;

    // Mapeia os status da Twilio para o seu banco
    const isDelivered = ['delivered', 'read', 'sent'].includes(MessageStatus);
    const isRead = MessageStatus === 'read';

    await this.knex('whatsapp_messages')
      .where({ whatsapp_message_id: MessageSid })
      .update({
        is_delivered: isDelivered,
        is_read: isRead,
        // Você pode salvar o status bruto no metadata se quiser
      });

    return { success: true };
  }
}