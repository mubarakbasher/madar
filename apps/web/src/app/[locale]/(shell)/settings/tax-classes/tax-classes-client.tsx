"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import {
  taxClassDeleteRequest,
  taxClassSetDefaultRequest,
  taxClassesListRequest,
  type ApiTaxClass,
} from "@/lib/api/tax-classes";
import { TaxClassModal } from "./_components/TaxClassModal";
import "./tax-classes.css";

interface ToastState {
  text: string;
  tone: "ok" | "bad";
}

function formatRate(bps: number, locale: "en" | "ar"): string {
  // bps → percent. Keep up to 2 decimal places when needed.
  const pct = bps / 100;
  const fixed = Number.isInteger(pct) ? pct.toString() : pct.toFixed(2);
  // Suffix with the Western percent symbol — same convention as the
  // dashboard cards. RTL respects bidi naturally for "%".
  void locale;
  return `${fixed}%`;
}

export function TaxClassesClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("settings.taxClasses");
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role ?? "");
  const isOwner = role === "owner";

  const [search, setSearch] = useState("");
  const [modalState, setModalState] = useState<{ open: boolean; editing: ApiTaxClass | null }>({
    open: false,
    editing: null,
  });
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const listQ = useQuery({
    queryKey: ["tax-classes", "list", { search: search.trim() }],
    queryFn: () =>
      taxClassesListRequest({
        search: search.trim() || undefined,
        limit: 100,
      }),
    enabled: isOwner,
    staleTime: 30_000,
  });

  const setDefaultM = useMutation({
    mutationFn: (id: string) => taxClassSetDefaultRequest(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tax-classes", "list"] });
      setToast({ text: t("updatedToast"), tone: "ok" });
    },
    onError: (e: unknown) => setToast({ text: errorToMessage(e, t), tone: "bad" }),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => taxClassDeleteRequest(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tax-classes", "list"] });
      setToast({ text: t("updatedToast"), tone: "ok" });
    },
    onError: (e: unknown) => setToast({ text: errorToMessage(e, t), tone: "bad" }),
  });

  if (!isOwner) {
    return (
      <div className="tcl">
        <header className="tcl-header">
          <div className="tcl-kicker">{t("kicker")}</div>
          <h1 className="tcl-title">{t("title")}</h1>
        </header>
        <div className="tcl-denied" role="alert">
          <h1>{t("ownerOnly.title")}</h1>
          <p>{t("ownerOnly.body")}</p>
        </div>
      </div>
    );
  }

  if (listQ.isPending) {
    return (
      <div className="tcl">
        <Header t={t} />
        <div className="tcl-skeleton">{t("loading")}</div>
      </div>
    );
  }

  if (listQ.isError) {
    return (
      <div className="tcl">
        <Header t={t} />
        <div className="tcl-error">
          <h2>{t("error.title")}</h2>
          <p>{t("error.body")}</p>
          <button type="button" className="tcl-btn" onClick={() => void listQ.refetch()}>
            {t("error.retry")}
          </button>
        </div>
      </div>
    );
  }

  const items = listQ.data?.items ?? [];

  return (
    <div className="tcl">
      <Header t={t} />

      <div className="tcl-toolbar">
        <input
          type="text"
          className="tcl-search"
          placeholder={t("filters.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="tcl-toolbar-spacer" />
        <button
          type="button"
          className="tcl-btn tcl-btn-primary"
          onClick={() => setModalState({ open: true, editing: null })}
        >
          <Plus size={14} strokeWidth={1.5} />
          {t("addTaxClass")}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="tcl-empty">
          <h2 className="tcl-empty-title">{t("empty.title")}</h2>
          <p className="tcl-empty-body">{t("empty.body")}</p>
          <button
            type="button"
            className="tcl-btn tcl-btn-primary"
            onClick={() => setModalState({ open: true, editing: null })}
          >
            <Plus size={14} strokeWidth={1.5} />
            {t("addTaxClass")}
          </button>
        </div>
      ) : (
        <div className="tcl-table-wrap">
          <table className="tcl-table">
            <thead>
              <tr>
                <th>{t("columns.code")}</th>
                <th>{t("columns.name")}</th>
                <th>{t("columns.rate")}</th>
                <th>{t("columns.status")}</th>
                <th>{t("columns.default")}</th>
                <th>{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((tc) => (
                <tr key={tc.id}>
                  <td>
                    <span className="tcl-cell-code">{tc.code}</span>
                  </td>
                  <td>
                    <span className="tcl-cell-name">{tc.name_i18n[locale] || tc.name_i18n.en}</span>
                  </td>
                  <td>
                    <span className="tcl-cell-rate">{formatRate(tc.rate_bps, locale)}</span>
                  </td>
                  <td>
                    {tc.is_active ? (
                      <span className="tcl-pill tcl-status-active">{t("status.active")}</span>
                    ) : (
                      <span className="tcl-pill tcl-status-inactive">{t("status.inactive")}</span>
                    )}
                  </td>
                  <td>
                    {tc.is_default ? (
                      <span className="tcl-default-badge">{t("defaultBadge")}</span>
                    ) : (
                      <span style={{ color: "var(--ink-3)" }}>—</span>
                    )}
                  </td>
                  <td>
                    <div className="tcl-row-actions">
                      <button
                        type="button"
                        className="tcl-btn tcl-btn-ghost tcl-btn-sm"
                        onClick={() => setModalState({ open: true, editing: tc })}
                      >
                        {t("actions.edit")}
                      </button>
                      {!tc.is_default && (
                        <button
                          type="button"
                          className="tcl-btn tcl-btn-ghost tcl-btn-sm"
                          onClick={() => setDefaultM.mutate(tc.id)}
                          disabled={setDefaultM.isPending}
                        >
                          {t("actions.setDefault")}
                        </button>
                      )}
                      <button
                        type="button"
                        className="tcl-btn tcl-btn-ghost tcl-btn-sm tcl-btn-danger"
                        onClick={() => {
                          if (window.confirm(t("empty.body") /* fallback prompt */)) {
                            deleteM.mutate(tc.id);
                          }
                        }}
                        disabled={deleteM.isPending}
                      >
                        {t("actions.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalState.open && (
        <TaxClassModal
          initial={modalState.editing}
          onClose={(saved) => {
            setModalState({ open: false, editing: null });
            if (saved) {
              setToast({
                text: modalState.editing ? t("modal.updatedToast") : t("modal.createdToast"),
                tone: "ok",
              });
            }
          }}
        />
      )}

      {toast && (
        <div role="status" className={`tcl-toast tcl-toast--${toast.tone}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Header({ t }: { t: (k: string) => string }) {
  return (
    <header className="tcl-header">
      <div className="tcl-kicker">{t("kicker")}</div>
      <h1 className="tcl-title">{t("title")}</h1>
      <p className="tcl-subtitle">{t("subtitle")}</p>
    </header>
  );
}

function errorToMessage(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "tax_class_in_use":
        return t("errors.tax_class_in_use");
      case "tax_class_code_taken":
        return t("errors.tax_class_code_taken");
      case "forbidden_role":
        return t("errors.forbidden_role");
      case "validation_failed":
        return t("errors.validation_failed");
      default:
        return err.message || t("errors.generic");
    }
  }
  return t("errors.generic");
}
