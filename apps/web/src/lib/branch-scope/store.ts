"use client";
import { create } from "zustand";

const STORAGE_KEY = "madar_selected_branch";
export type BranchSelection = string | "all";

interface BranchScopeState {
  selectedBranchId: BranchSelection;
  hydrated: boolean;
  setSelected: (id: BranchSelection) => void;
  hydrate: () => void;
}

function readPersisted(): BranchSelection {
  if (typeof window === "undefined") return "all";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (!v) return "all";
    return v;
  } catch {
    return "all";
  }
}

function persist(v: BranchSelection): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // localStorage may be blocked (private window, quota); selection is then
    // session-local which is acceptable.
  }
}

export const useBranchScopeStore = create<BranchScopeState>((set) => ({
  selectedBranchId: "all",
  hydrated: false,
  setSelected: (id) => {
    persist(id);
    set({ selectedBranchId: id });
  },
  hydrate: () => set({ selectedBranchId: readPersisted(), hydrated: true }),
}));

/**
 * Return the branch_id query param to pass to scoped endpoints — `undefined`
 * when "All branches" is selected so the caller can omit the param entirely.
 */
export function branchScopeParam(s: BranchSelection): string | undefined {
  return s === "all" ? undefined : s;
}
