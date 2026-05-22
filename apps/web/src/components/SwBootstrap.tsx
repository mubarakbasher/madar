"use client";

import { useEffect } from "react";
import { registerSw } from "@/lib/pwa/register-sw";

/**
 * Mount once inside the (shell) layout. Registers the service worker on
 * first client render so the POS shell is cached for offline use.
 */
export function SwBootstrap(): null {
  useEffect(() => {
    registerSw();
  }, []);
  return null;
}
