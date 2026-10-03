import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Errors are returned as `{ error: message }` — the contract the client's
 * api.ts expects when it reads the body of a non-OK response.
 */
@Catch()
export class ErrorShapeFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorShapeFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error.';
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(status).json({ error: message });
  }
}
