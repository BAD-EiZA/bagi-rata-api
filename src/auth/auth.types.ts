import { Request } from 'express';

export type AuthUser = {
  clerkUserId: string;
  sessionId?: string;
};

export type AuthenticatedRequest = Request & {
  authUser?: AuthUser;
  requestId?: string;
};
