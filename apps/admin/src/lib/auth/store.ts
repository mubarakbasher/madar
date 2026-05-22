"use client";
import { create } from "zustand";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  mfa_enabled: boolean;
  last_login_at: string | null;
}

interface AdminAuthState {
  accessToken: string | null;
  user: AdminUser | null;
  bootstrapped: boolean;
  setAuth: (p: { accessToken: string; user: AdminUser }) => void;
  clearAuth: () => void;
  setBootstrapped: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>((set) => ({
  accessToken: null,
  user: null,
  bootstrapped: false,
  setAuth: ({ accessToken, user }) => set({ accessToken, user, bootstrapped: true }),
  clearAuth: () => set({ accessToken: null, user: null, bootstrapped: true }),
  setBootstrapped: () => set({ bootstrapped: true }),
}));
