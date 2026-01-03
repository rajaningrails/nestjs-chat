import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

export class DomainException extends BaseException {
  readonly code = 'DOMAIN_ERROR';
  
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}