"use client";

import { useEffect, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { fetchPaymentProofReceiptBlob } from "@/lib/api/payment-proofs";

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

    fetchPaymentProofReceiptBlob(proofId)
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
  const t = useTranslations("verification");
  const { url, mime, isLoading, error } = useReceiptBlob(proofId);
  const [fullscreen, setFullscreen] = useState(false);

  if (!proofId) {
    return <div className="vq-receipt vq-receipt--empty">{t("empty.selectProof")}</div>;
  }
  if (isLoading) {
    return <div className="vq-receipt vq-receipt--loading">{t("loadingProof")}</div>;
  }
  if (error || !url) {
    return (
      <div className="vq-receipt vq-receipt--error" role="alert">
        {t("errors.loadReceipt")}
      </div>
    );
  }

  const isPdf = mime === "application/pdf";

  return (
    <>
      <div className="vq-receipt">
        {isPdf ? (
          <iframe src={url} className="vq-receipt-pdf" title="Receipt PDF" />
        ) : (
          <button
            type="button"
            className="vq-receipt-img-button"
            onClick={() => setFullscreen(true)}
          >
            <img src={url} alt="Receipt" className="vq-receipt-img" />
            <span className="vq-receipt-fullscreen-hint">
              <Maximize2 size={14} strokeWidth={1.5} />
            </span>
          </button>
        )}
      </div>

      {fullscreen && !isPdf && (
        <div
          className="vq-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setFullscreen(false)}
        >
          <button
            type="button"
            className="vq-modal-close"
            onClick={() => setFullscreen(false)}
            aria-label="Close"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
          <img src={url} alt="Receipt fullscreen" className="vq-receipt-fullscreen-img" />
        </div>
      )}
    </>
  );
}
