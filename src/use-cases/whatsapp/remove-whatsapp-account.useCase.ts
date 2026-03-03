// src/modules/whatsapp/use-cases/disconnect-whatsapp.usecase.ts
import { Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { Inject } from '@nestjs/common';

@Injectable()
export class DisconnectWhatsappUseCase {
  constructor(@Inject('knex') private readonly knex: Knex) {}

  async execute(organizationId: string) {
    // Remove a conta. O CASCADE na sua migration cuidará de apagar 
    // as conversas e mensagens se você desejar, ou você pode apenas desativar.
    await this.knex('whatsapp_accounts')
      .where({ organization_id: organizationId })
      .delete();

    return { success: true, message: 'WhatsApp desconectado com sucesso.' };
  }
}