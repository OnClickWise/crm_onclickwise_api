import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';
import axios from 'axios';
import * as config from '@/shared/config/config';
import { ConnectEvolutionDto } from '@/modules/whatsapp/dtos/connect-evolution.dto';

@Injectable()
export class ConnectEvolutionUseCase {
  private readonly logger = new Logger(ConnectEvolutionUseCase.name);

  constructor(private readonly whatsappRepo: WhatsappRepository) {}

  async execute(organizationId: string, dto: ConnectEvolutionDto) {
    try {
      // 1. Tratamento das variáveis de ambiente
      const cleanApiKey = String(config.EVOLUTION_API_KEY).trim().replace(/['"]+/g, '');
      const cleanApiUrl = String(config.EVOLUTION_API_URL).trim().replace(/['"]+/g, '').replace(/\/+$/, '');

      // 2. Chamada Evolution API - Criamos a instância primeiro
      const { data: evolutionResponse } = await axios.post(
        `${cleanApiUrl}/instance/create`,
        {
          instanceName: dto.instanceName,
          token: organizationId, // Token interno da instância
          integration: dto.integration || 'WHATSAPP-BAILEYS',
          qrcode: true,
          webhook: {
            enabled: true,
            url: `${process.env.BACKEND_URL}/api/whatsapp/webhook/evolution`,
            webhookByEvents: false,
            webhookBase64: false,
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_UPDATE",
              "MESSAGES_DELETE",
              "SEND_MESSAGE",
              "CONNECTION_UPDATE",
              "APPLICATION_STARTUP"
            ]
          }
        },
        {
          headers: { 
            'apikey': cleanApiKey,
            'Content-Type': 'application/json'
          },
        }
      );

      // 3. Extração dos dados gerados pela Evolution
      const { instance, hash } = evolutionResponse;

      // 4. Persistência Local (Upsert)
      // Agora enviamos o objeto completo com os IDs e Keys reais
      await this.whatsappRepo.upsertAccount({
        organization_id: organizationId,
        instance_name: instance.instanceName,
        instance_id: instance.instanceId, // UUID real da Evolution
        instance_key: hash.apikey,       // Key necessária para comandos via API
        status: instance.status,         // Geralmente 'created'
        is_authenticated: false,
        // Configurações padrão (inicializadas conforme sua estratégia)
        reject_call: false,
        groups_ignore: false,
        always_online: false,
        read_messages: false,
        read_status: false,
        sync_full_history: false
      });

      this.logger.log(`Instância "${instance.instanceName}" criada e vinculada à organização ${organizationId}`);

      // 5. Retorna os dados originais (incluindo o base64 do QR Code) para o frontend
      return evolutionResponse;

    } catch (error) {
      const errorData = error.response?.data || error.message;
      this.logger.error(`Erro na criação da instância na Evolution: ${JSON.stringify(errorData)}`);
      
      throw new InternalServerErrorException('Erro ao conectar com Evolution API');
    }
  }
}