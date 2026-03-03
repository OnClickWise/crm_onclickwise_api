// src/modules/whatsapp/use-cases/link-whatsapp-account.usecase.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';
import twilio from 'twilio'; 

@Injectable()
export class LinkWhatsappAccountUseCase {
  private masterClient: twilio.Twilio;

  constructor(private readonly whatsappRepo: WhatsappRepository) {
    // Inicializa com as credenciais da conta MASTER do seu sistema
    this.masterClient = twilio(process.env.TWILIO_MASTER_SID, process.env.TWILIO_MASTER_TOKEN);
  }

  async execute(organizationId: string, organizationName: string) {
    try {
      // 1. Cria a Subconta na Twilio de forma programática
      const subaccount = await this.masterClient.api.v2010.accounts.create({
        friendlyName: `Org: ${organizationName} (ID: ${organizationId})`,
      });

      // 2. Salva as credenciais da SUBCONTA no seu banco
      const account = await this.whatsappRepo.upsertAccount({
        organization_id: organizationId,
        twilio_account_name: subaccount.friendlyName,
        twilio_account_sid: subaccount.sid,    // SID da Subconta
        twilio_auth_token: subaccount.authToken, // Token da Subconta
        is_authenticated: true,
        authenticated_at: new Date(),
      });

      // 3. TODO: Configurar o Webhook da subconta recém-criada via API
      // Isso garante que as mensagens cheguem no seu controller

      return account;
    } catch (error) {
      throw new InternalServerErrorException('Falha ao provisionar subconta Twilio.');
    }
  }
}