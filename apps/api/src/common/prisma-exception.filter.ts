import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@lifeos/database';
import { type Response } from 'express';

/** Maps known Prisma errors to HTTP responses without leaking SQL details. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'A record with these values already exists'],
      P2025: [HttpStatus.NOT_FOUND, 'Resource not found'],
      P2003: [HttpStatus.BAD_REQUEST, 'Related resource does not exist'],
    };
    const [status, message] = map[exception.code] ?? [
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Internal server error',
    ];
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`Prisma error ${exception.code}`, exception.stack);
    }
    res.status(status).json({ statusCode: status, error: HttpStatus[status], message });
  }
}
