"use client";

import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { adminFetchReceiptBlob } from "@/lib/api/admin-proofs";
import { t } from "@/lib/i18n";

interface BlobState {
  url: string | null;
  mime: string;
  isLoading: boolean;
  error: string | null;
}

function useReceiptBlob(proofId: string | null): BlobState {
  const [state, setState] = useState<BlobState>({
    url: null,
    mime: "",
    isLoading: !!proofId,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    if (!proofId) {
      setState({ url: null, mime: "", isLoading: false, error: null });
      return;
    }
    setState({ url: null, mime: "", isLoading: true, error: null });

    adminFetchReceiptBlob(proofId)
      .then(({ url, mime }) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setState({ url, mime, isLoading: false, error: null });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ url: null, mime: "", isLoading: false, error: err.message });
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [proofId]);

  return state;
}

export function ReceiptViewer({ proofId }: { proofId: string | null }) {
  const { url, mime, isLoading, error } = useReceiptBlob(proofId);
  const [fullscreen, setFullscreen] = useState(false);

  if (!proofId) {
    return <div className="admin-receipt-frame admin-receipt-frame--empty">{t("proofs.receipt.selectProof")}</div>;
  }
  if (isLoading) {
    return <div className="admin-receipt-frame admin-receipt-frame--loading">{t("proofs.receipt.loading")}</div>;
  }
  if (error || !url) {
    return (
      <div className="admin-receipt-frame admin-receipt-frame--error" role="alert">
        {t("proofs.receipt.error")} {error ? `(${error})` : ""}
      </div>
    );
  }

  const isPdf = mime === "application/pdf";

  return (
    <>
      <div className="admin-receipt-frame">
        {isPdf ? (
          <iframe src={url} className="admin-receipt-pdf" title={t("proofs.receipt.pdfTitle")} />
        ) : (
          <button
            type="button"
            className="admin-receipt-img-button"
            onClick={() => setFullscreen(true)}
            aria-label={t("proofs.receipt.openFullscreen")}
          >
            <img src={url} alt={t("proofs.receipt.altReceipt")} className="admin-receipt-img" />
            <span className="admin-receipt-fullscreen-hint">
              <Maximize2 size={14} strokeWidth={1.5} />
            </span>
          </button>
        )}
      </div>

      {fullscreen && !isPdf && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={t("proofs.receipt.fullscreenLabel")}
          onClick={() => setFullscreen(false)}
        >
          <button
            type="button"
            className="admin-modal-close"
            onClick={() => setFullscreen(false)}
            aria-label={t("proofs.receipt.closeFullscreen")}
          >
            <X size={20} strokeWidth={1.5} />
          </button>
          <img src={url} alt={t("proofs.receipt.altFullscreen")} className="admin-receipt-fullscreen-img" />
        </div>
      )}
    </>
  );
}
