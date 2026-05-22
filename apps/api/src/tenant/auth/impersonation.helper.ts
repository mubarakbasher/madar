import { ForbiddenException } from "@nestjs/common";
import type { TenantPrincipal } from "./current-user.decorator";

// CLAUDE.md mandate: bulk product deletes, customer deletes, and mass refunds
// are blocked during impersonation even if the role would otherwise permit them.
// 1.8b ships this helper as a no-op when `impersonator_id` is absent; 1.14b
// fills in the surrounding plumbing (JWT minting, claim propagation in the
// guard, audit double-logging).
export function assertNotImpersonating(user: TenantPrincipal, opName: string): void {
  if (user.impersonatorId) {
    throw new ForbiddenException({
      code: "forbidden_during_impersonation",
      message: `Operation "${opName}" is not permitted during impersonation`,
    });
  }
}
