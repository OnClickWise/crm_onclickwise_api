import { Controller, Get, Param, Res, NotFoundException, BadRequestException } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { env } from '@/shared/config/env';

@Controller('uploads')
export class UploadsController {
  @Get('/:type/:filename')
  async serveFile(
    @Param('type') type: string,
    @Param('filename') filename: string,
    @Res() res: FastifyReply,
  ) {
    // Validar tipo
    if (!['logos', 'chat-messages'].includes(type)) {
      throw new BadRequestException('Tipo de arquivo inválido');
    }

    // Validar filename - previne path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Nome de arquivo inválido');
    }

    const filePath = join(env.UPLOADS_DIR, type, filename);

    // Verificar se arquivo existe
    if (!existsSync(filePath)) {
      throw new NotFoundException('Arquivo não encontrado');
    }

    // Determinar MIME type baseado na extensão
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'webm': 'audio/webm',
      'm4a': 'audio/mp4',
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    // Headers CORS explícitos
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization');
    res.header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Encoding, Content-Length, Content-Range');
    
    // Headers para file serving
    res.header('Content-Type', mimeType);
    res.header('Accept-Ranges', 'bytes');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');

    // Serve o arquivo
    const stream = createReadStream(filePath);
    return res.send(stream);
  }
}
