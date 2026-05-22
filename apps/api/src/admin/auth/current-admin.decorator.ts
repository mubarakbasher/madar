import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export interface AdminPrincipal {
  platformUserId: string;
  email: string;
  role: string;
  jti: string;
}

export interface AdminMfaPendingPrincipal {
  platformUserId: string;
  email: string;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminPrincipal | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return (req as Request & { admin?: AdminPrincipal }).admin;
  },
);

export const CurrentMfaChallenger = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminMfaPendingPrincipal | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return (req as Request & { admin_mfa?: AdminMfaPendingPrincipal }).admin_mfa;
  },
);
