import { Suspense } from "react";
import { AcceptInviteClient } from "./accept-invite-client";

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteClient />
    </Suspense>
  );
}
