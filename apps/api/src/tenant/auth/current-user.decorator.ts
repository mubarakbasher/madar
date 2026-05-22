import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export interface TenantPrincipal {
  userId: string;
  tenantId: string;
  role: string;
  jti: string;
  /** Set when this access token was minted by an admin impersonation flow. */
  impersonatorId?: string;
  impersonatorEmail?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantPrincipal | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.user as TenantPrincipal | undefined;
  },
);
