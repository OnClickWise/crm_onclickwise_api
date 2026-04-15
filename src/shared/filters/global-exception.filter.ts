import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private translateHttpError(status: number, exceptionName?: string): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'Acesso não autorizado';
      case HttpStatus.FORBIDDEN:
        return 'Você não tem permissão para executar esta ação';
      case HttpStatus.NOT_FOUND:
        return 'Recurso não encontrado';
      case HttpStatus.CONFLICT:
        return 'Já existe um registro com esses dados';
      case HttpStatus.BAD_REQUEST:
        return 'Dados inválidos';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Muitas solicitações. Tente novamente em instantes';
      default:
        if (exceptionName === 'UnauthorizedException') return 'Acesso não autorizado';
        if (exceptionName === 'ForbiddenException') return 'Você não tem permissão para executar esta ação';
        if (exceptionName === 'NotFoundException') return 'Recurso não encontrado';
        if (exceptionName === 'ConflictException') return 'Já existe um registro com esses dados';
        if (exceptionName === 'BadRequestException') return 'Dados inválidos';
        return 'Erro inesperado';
    }
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Erro interno do servidor';
    let error = 'Erro interno do servidor';

    if (isHttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        exceptionResponse &&
        typeof exceptionResponse === 'object' &&
        'message' in exceptionResponse
      ) {
        message = (exceptionResponse as { message?: string | string[] }).message ?? message;
      }
      error = this.translateHttpError(status, exception.name);

      if (status < 500 && (message === 'Unauthorized' || message === 'Forbidden' || message === 'Not Found' || message === 'Bad Request')) {
        message = error;
      }
    }

    const shouldSanitize = status >= 500;

    if (shouldSanitize) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      message = 'Erro interno do servidor';
      error = 'Erro interno do servidor';
    }

    response.status(status).send({
      success: false,
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
