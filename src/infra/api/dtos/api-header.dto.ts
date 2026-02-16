import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export function ApiUserHeaders() {
  return applyDecorators(
    ApiHeader({ name: 'x-user-id', description: 'User ID' }),
    ApiHeader({ name: 'x-user-email', description: 'User email' }),
    ApiHeader({
      name: 'x-user-name',
      description: 'User name (optional)',
      required: false,
    }),
  );
}
