import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ForbiddenException, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TokenService } from '@/modules/auth/services/token.service';
import { ChatService } from './services/chat.service';

type SocketUser = {
  userId: string;
  organizationId: string;
  email: string;
  role: string;
};

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  private readonly channelPresence = new Map<string, Set<string>>();
  private readonly channelTyping = new Map<string, Set<string>>();

  constructor(private readonly chatService: ChatService) {}

  private getRoomName(organizationId: string, channelId: string) {
    return `org:${organizationId}:channel:${channelId}`;
  }

  private getOrganizationRoomName(organizationId: string) {
    return `org:${organizationId}`;
  }

  emitChannelsUpdated(organizationId: string, payload?: { reason?: string; channelId?: string }) {
    const room = this.getOrganizationRoomName(organizationId);
    this.server.to(room).emit('channels:updated', {
      organizationId,
      reason: payload?.reason || 'unknown',
      channelId: payload?.channelId || null,
      at: new Date().toISOString(),
    });
  }

  emitMessageToChannel(organizationId: string, channelId: string, message: any) {
    const room = this.getRoomName(organizationId, channelId);
    this.server.to(room).emit('message:new', message);
  }

  private getSocketUser(client: Socket): SocketUser {
    const user = client.data?.user as SocketUser | undefined;
    if (!user?.organizationId || !user?.userId) {
      throw new ForbiddenException('Sessao websocket invalida');
    }
    return user;
  }

  async handleConnection(client: Socket) {
    try {
      const rawToken =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.toString()?.replace(/^Bearer\s+/i, '') ||
        client.handshake.headers?.cookie
          ?.split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith('accessToken='))
          ?.split('=')[1];

      if (!rawToken) {
        throw new ForbiddenException('Token nao enviado');
      }

      const payload = TokenService.verifyAccessToken(rawToken) as any;

      const user: SocketUser = {
        userId: payload?.userId,
        organizationId: payload?.organizationId,
        email: payload?.email || '',
        role: payload?.role || 'employee',
      };

      if (!user.userId || !user.organizationId) {
        throw new ForbiddenException('Token invalido');
      }

      client.data.user = user;
      await client.join(this.getOrganizationRoomName(user.organizationId));
      this.logger.log(`WS conectado: ${user.userId} (${client.id})`);
      this.logger.debug(
        `WS auth ok: user=${user.userId} org=${user.organizationId} role=${user.role} socket=${client.id}`,
      );
    } catch (error) {
      this.logger.warn(`Falha websocket: ${error?.message || 'erro desconhecido'}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const user = this.getSocketUser(client);

      for (const room of client.rooms) {
        if (!room.startsWith('org:')) continue;

        const presenceSet = this.channelPresence.get(room);
        if (presenceSet) {
          presenceSet.delete(client.id);
          if (presenceSet.size === 0) {
            this.channelPresence.delete(room);
          }
        }

        const typingSet = this.channelTyping.get(room);
        if (typingSet && typingSet.has(user.userId)) {
          typingSet.delete(user.userId);
          if (typingSet.size === 0) {
            this.channelTyping.delete(room);
          }
          const channelId = room.split(':')[3];
          this.server.to(room).emit('typing:update', {
            channelId,
            userIds: Array.from(typingSet || []),
          });
        }

        const onlineCount = this.channelPresence.get(room)?.size || 0;
        const channelId = room.split(':')[3];
        this.server.to(room).emit('presence:update', {
          channelId,
          onlineCount,
        });
      }

      this.logger.log(`WS desconectado: ${client.id}`);
    } catch {
      // noop
    }
  }

  @SubscribeMessage('channel:join')
  async onJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    try {
      const user = this.getSocketUser(client);

      if (!body?.channelId) {
        throw new ForbiddenException('Canal nao informado');
      }

      await this.chatService.assertChannelAccess(body.channelId, user);

      const room = this.getRoomName(user.organizationId, body.channelId);
      await client.join(room);

      if (!this.channelPresence.has(room)) {
        this.channelPresence.set(room, new Set());
      }
      this.channelPresence.get(room)?.add(client.id);

      const onlineCount = this.channelPresence.get(room)?.size || 0;
      this.server.to(room).emit('presence:update', {
        channelId: body.channelId,
        onlineCount,
      });

      this.logger.debug(
        `WS join ok: user=${user.userId} channel=${body.channelId} room=${room} online=${onlineCount}`,
      );

      return { success: true, channelId: body.channelId };
    } catch (error) {
      this.logger.warn(
        `WS join falhou: socket=${client.id} channel=${body?.channelId || 'n/a'} motivo=${error?.message || 'erro desconhecido'}`,
      );
      return { success: false, error: error?.message || 'Falha ao entrar no canal' };
    }
  }

  @SubscribeMessage('channel:leave')
  async onLeaveChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    const user = this.getSocketUser(client);

    if (!body?.channelId) {
      throw new ForbiddenException('Canal nao informado');
    }

    const room = this.getRoomName(user.organizationId, body.channelId);
    await client.leave(room);

    const presenceSet = this.channelPresence.get(room);
    if (presenceSet) {
      presenceSet.delete(client.id);
      if (presenceSet.size === 0) {
        this.channelPresence.delete(room);
      }
    }

    const typingSet = this.channelTyping.get(room);
    if (typingSet) {
      typingSet.delete(user.userId);
      if (typingSet.size === 0) {
        this.channelTyping.delete(room);
      }
    }

    const onlineCount = this.channelPresence.get(room)?.size || 0;
    this.server.to(room).emit('presence:update', {
      channelId: body.channelId,
      onlineCount,
    });

    this.server.to(room).emit('typing:update', {
      channelId: body.channelId,
      userIds: Array.from(this.channelTyping.get(room) || []),
    });

    this.logger.debug(
      `WS leave: user=${user.userId} channel=${body.channelId} room=${room} online=${onlineCount}`,
    );

    return { success: true, channelId: body.channelId };
  }

  @SubscribeMessage('typing:start')
  async onTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    const user = this.getSocketUser(client);
    if (!body?.channelId) return { success: false };

    await this.chatService.assertChannelAccess(body.channelId, user);

    const room = this.getRoomName(user.organizationId, body.channelId);
    if (!this.channelTyping.has(room)) {
      this.channelTyping.set(room, new Set());
    }

    this.channelTyping.get(room)?.add(user.userId);
    this.server.to(room).emit('typing:update', {
      channelId: body.channelId,
      userIds: Array.from(this.channelTyping.get(room) || []),
    });

    return { success: true };
  }

  @SubscribeMessage('typing:stop')
  async onTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string },
  ) {
    const user = this.getSocketUser(client);
    if (!body?.channelId) return { success: false };

    const room = this.getRoomName(user.organizationId, body.channelId);
    const typingSet = this.channelTyping.get(room);

    if (typingSet) {
      typingSet.delete(user.userId);
      if (typingSet.size === 0) {
        this.channelTyping.delete(room);
      }
    }

    this.server.to(room).emit('typing:update', {
      channelId: body.channelId,
      userIds: Array.from(this.channelTyping.get(room) || []),
    });

    return { success: true };
  }

  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; text: string },
  ) {
    try {
      const user = this.getSocketUser(client);

      if (!body?.channelId || !body?.text?.trim()) {
        return { success: false, error: 'Mensagem invalida' };
      }

      const message = await this.chatService.sendMessage(body.channelId, { body: body.text }, user);

      const room = this.getRoomName(user.organizationId, body.channelId);
      this.server.to(room).emit('message:new', message);

      const onlineCount = this.channelPresence.get(room)?.size || 0;
      this.logger.debug(
        `WS message:new user=${user.userId} channel=${body.channelId} room=${room} online=${onlineCount} message=${message.id}`,
      );

      return { success: true, message };
    } catch (error) {
      this.logger.error(
        `WS message falhou: socket=${client.id} channel=${body?.channelId || 'n/a'} erro=${error?.message || 'erro desconhecido'}`,
      );
      return { success: false, error: error?.message || 'Falha ao enviar mensagem' };
    }
  }

  @SubscribeMessage('message:audio')
  async onAudioMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { channelId: string; audioUrl: string; mimeType: string; size: number },
  ) {
    try {
      const user = this.getSocketUser(client);

      if (!body?.channelId || !body?.audioUrl) {
        return { success: false, error: 'Audio invalido' };
      }

      const message = await this.chatService.sendMessage(
        body.channelId,
        {
          body: '🎙️ Mensagem de voz',
          metadata: {
            kind: 'audio',
            audioUrl: body.audioUrl,
            mimeType: body.mimeType || 'audio/mp4',
            size: body.size || 0,
          },
        },
        user,
      );

      const room = this.getRoomName(user.organizationId, body.channelId);
      this.server.to(room).emit('message:new', message);

      const onlineCount = this.channelPresence.get(room)?.size || 0;
      this.logger.debug(
        `WS audio:new user=${user.userId} channel=${body.channelId} room=${room} online=${onlineCount} message=${message.id}`,
      );

      return { success: true, message };
    } catch (error) {
      this.logger.error(
        `WS audio falhou: socket=${client.id} channel=${body?.channelId || 'n/a'} erro=${error?.message || 'erro desconhecido'}`,
      );
      return { success: false, error: error?.message || 'Falha ao enviar audio' };
    }
  }
}
