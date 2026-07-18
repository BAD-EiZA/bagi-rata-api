import { Request } from 'express';

export type AuthUser = {
  /** Kinde (or other IdP) subject claim `sub` */
  authSubjectId: string;
  email?: string;
  name?: string;
  picture?: string;
};

export type AuthenticatedRequest = Request & {
  authUser?: AuthUser;
  requestId?: string;
};
