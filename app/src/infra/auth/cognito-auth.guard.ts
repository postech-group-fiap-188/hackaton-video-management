import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { Request } from 'express';
import { z } from 'zod';

const ClaimsSchema = z.object({
  sub: z.string().min(1),
  aud: z.string().optional(),
  client_id: z.string().optional(),
  email: z.email().optional(),
  'cognito:username': z.string().optional(),
});
type Claims = z.infer<typeof ClaimsSchema>;

@Injectable()
export class CognitoAuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private issuer?: string;
  private clientId?: string;

  constructor(private readonly config: ConfigService) {}

  private init(): void {
    if (this.jwks) return;

    const region = this.config.get<string>('AWS_REGION');
    const poolId = this.config.get<string>('COGNITO_USER_POOL_ID');
    const clientId = this.config.get<string>('COGNITO_CLIENT_ID');

    if (!region || !poolId || !clientId)
      throw new Error('Missing Cognito env vars');

    this.clientId = clientId;
    this.issuer = `https://cognito-idp.${region}.amazonaws.com/${poolId}`;
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const authDisabled =
      (this.config.get<string>('AUTH_DISABLED') ?? 'false') === 'true';
    if (authDisabled) {
      req.user = { sub: 'local-user' };
      return true;
    }

    this.init();

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      throw new UnauthorizedException('Missing bearer token');

    const token = authHeader.slice('Bearer '.length);

    try {
      const { payload } = await jwtVerify(token, this.jwks!, {
        issuer: this.issuer!,
      });
      const claims = parseClaims(payload);

      const expected = this.clientId!;
      const ok =
        (claims.aud && claims.aud === expected) ||
        (claims.client_id && claims.client_id === expected);
      if (!ok)
        throw new UnauthorizedException('Invalid token audience/client_id');

      req.user = {
        sub: claims.sub,
        username: claims['cognito:username'],
        email: claims.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}

function parseClaims(payload: JWTPayload): Claims {
  const parsed = ClaimsSchema.safeParse(payload);
  if (!parsed.success) throw new UnauthorizedException('Invalid token claims');
  return parsed.data;
}
