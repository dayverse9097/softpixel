import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrf?: string;
    createdAt?: number;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAdmin after the account is re-read from the database. */
      admin?: { id: string; email: string; role: 'ADMIN'; totpEnabled: boolean };
      id?: string;
    }
  }
}
