"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import {
  supplierDocumentDeleteRequest,
  supplierDocumentDownloadUrl,
  supplierDocumentUploadRequest,
  supplierDocumentsListRequest,
  type ApiSupplierDocument,
  type DocumentKind,
} from "@/lib/api/suppliers";
import { ApiError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";

const KINDS: DocumentKind[] = ["contract", "tax_certificate", "bank_letter", "other"];

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"];

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function DocumentsTab({
  supplierId,
  locale,
}: {
  supplierId: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("suppliers.documents");
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role ?? "");
  const canMutate = role === "owner" || role === "manager";

  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>("contract");
  const [notes, setNotes] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["suppliers", supplierId, "documents"],
    queryFn: () => supplierDocumentsListRequest(supplierId),
    staleTime: 15_000,
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      if (notes.trim()) fd.set("notes", notes.trim());
      return supplierDocumentUploadRequest(supplierId, fd);
    },
    onSuccess: () => {
      setUploadError(null);
      setNotes("");
      if (fileRef.current) fileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["suppliers", supplierId, "documents"] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.code === "too_large") setUploadError(t("errors.too_large"));
        else if (err.code === "bad_type") setUploadError(t("errors.bad_type"));
        else setUploadError(err.message);
      } else {
        setUploadError(t("errors.bad_type"));
      }
    },
  });

  const remove = useMutation({
    mutationFn: (docId: string) => supplierDocumentDeleteRequest(supplierId, docId),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["suppliers", supplierId, "documents"] }),
  });

  function onSubmitUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setUploadError(t("errors.too_large"));
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      setUploadError(t("errors.bad_type"));
      return;
    }
    upload.mutate(file);
  }

  const grouped = useMemo(() => {
    const groups: Record<DocumentKind, ApiSupplierDocument[]> = {
      contract: [],
      tax_certificate: [],
      bank_letter: [],
      other: [],
    };
    if (q.data?.items) {
      for (const doc of q.data.items) {
        groups[doc.kind].push(doc);
      }
    }
    return groups;
  }, [q.data]);

  return (
    <section className="sup-section">
      <div className="sup-section-head">
        <div>
          <h3 className="sup-section-title">{t("title")}</h3>
          <p className="sup-field-hint">{t("subtitle")}</p>
        </div>
      </div>

      {canMutate && (
        <form className="sup-doc-upload" onSubmit={onSubmitUpload}>
          <h4 style={{ fontSize: 13, margin: "0 0 8px 0", color: "var(--ink-2)" }}>
            {t("uploadTitle")}
          </h4>
          <div className="sup-doc-upload-row">
            <select value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kind.${k}`)}
                </option>
              ))}
            </select>
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            />
            <input
              type="text"
              value={notes}
              placeholder={t("notesLabel")}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
            />
            <button
              type="submit"
              className="sup-btn sup-btn-primary sup-btn-sm"
              disabled={upload.isPending}
            >
              {upload.isPending ? t("uploading") : t("upload")}
            </button>
          </div>
          <div className="sup-field-hint" style={{ marginBlockStart: 6 }}>
            {t("allowedTypes")} {t("maxSize")}
          </div>
          {uploadError && (
            <div className="sup-field-error" style={{ marginBlockStart: 6 }}>
              {uploadError}
            </div>
          )}
        </form>
      )}

      {q.isPending ? (
        <div className="sup-section-empty">…</div>
      ) : q.isError ? (
        <div className="sup-section-empty">—</div>
      ) : (q.data?.items.length ?? 0) === 0 ? (
        <div className="sup-section-empty">{t("empty")}</div>
      ) : (
        KINDS.map((k) => {
          const docs = grouped[k];
          if (docs.length === 0) return null;
          return (
            <div key={k}>
              <div className="sup-doc-group-title">{t(`kind.${k}`)}</div>
              <ul className="sup-doc-list">
                {docs.map((doc) => (
                  <li key={doc.id} className="sup-doc-row">
                    <div className="sup-doc-row-info">
                      <span className="sup-doc-filename">{doc.original_filename}</span>
                      <span className="sup-doc-meta">
                        {t("size", { kb: Math.max(1, Math.round(doc.size_bytes / 1024)) })}
                        {" · "}
                        {t("uploadedOn", { date: formatDate(doc.created_at, locale) })}
                      </span>
                    </div>
                    <div className="sup-doc-actions">
                      <a
                        className="sup-btn sup-btn-sm"
                        href={supplierDocumentDownloadUrl(supplierId, doc.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={12} /> {t("download")}
                      </a>
                      {canMutate && (
                        <button
                          type="button"
                          className="sup-btn sup-btn-sm sup-btn-danger"
                          onClick={() => remove.mutate(doc.id)}
                          disabled={remove.isPending}
                        >
                          <Trash2 size={12} /> {t("delete")}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}
