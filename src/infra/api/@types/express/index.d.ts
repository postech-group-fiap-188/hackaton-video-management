export type AuthUser = {
  username?: string;
  email?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      correlationId?: string;
    }
  }
}

export {};
