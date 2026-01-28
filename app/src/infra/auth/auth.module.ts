import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CognitoAuthGuard } from './cognito-auth.guard';

@Module({
  imports: [ConfigModule],
  providers: [CognitoAuthGuard],
  exports: [CognitoAuthGuard],
})
export class AuthModule {}
