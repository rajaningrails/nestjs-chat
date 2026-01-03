import { HttpException, HttpStatus } from '@nestjs/common';

export abstract class BaseException extends HttpException {
  abstract readonly code: string;
  
  constructor(
    message: string,
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(message, status);
  }
}
