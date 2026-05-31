"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import "./pos.css";
import { categoriesListRequest, productsListRequest, type ApiProduct } from "@/lib/api/catalog";
import { adaptCategory, adaptProduct } from "@/lib/api/catalog-adapter";
import { useAuthStore } from "@/lib/auth/store";
import { useRedirectOnAuthCleared } from "@/lib/auth/use-redirect-on-cleared";
import type { Product } from "@/lib/mock-data/products";
import type { Category } from "@/lib/mock-data/categories";
import { PosHeader } from "./_components/PosHeader";
import { ProductGrid } from "./_components/ProductGrid";
import { Cart, type CartCustomer, type CartLine, type CartLineEx } from "./_components/Cart";
import { LineEditSheet } from "./_components/LineEditSheet";
import { HeldSalesTray } from "./_components/HeldSalesTray";
import { PaymentSheet, type PaymentSubmit } from "./_components/PaymentSheet";
import { CustomerPickerModal, type PosCustomerPick } from "./_components/CustomerPickerModal";
import { ShiftGate } from "./_components/ShiftGate";
import { ShiftChip } from "./_components/ShiftChip";
import { PosNoBranch } from "./_components/PosNoBranch";
import { branchesListRequest } from "@/lib/api/branches";
import type { CreateSaleInput, SalePaymentInput, SaleResponse } from "@/lib/api/sales";
import { submitPaymentProof } from "@/lib/api/payment-proofs";
import { listTenantBankAccounts } from "@/lib/api/tenant-bank-accounts";
import {
  heldSaleCreateRequest,
  heldSaleDiscardRequest,
  heldSaleResumeRequest,
  heldSalesListRequest,
  type ApiHeldSalePayload,
  type HeldSalesListResponse,
} from "@/lib/api/held-sales";
import { syncConflictsSummaryRequest } from "@/lib/api/sync-conflicts";
import { dispatchSale } from "@/lib/offline/dispatch";
import { startSyncEngine } from "@/lib/offline/sync";
import { saveCatalogSnapshot } from "@/lib/offline/catalog-cache";
import { Link } from "../../../../i18n/routing";

export function PosClient({ locale }: { locale: "en" | "ar" }) {
  const tenant = useAuthStore((s) => s.tenant);
  const user = useAuthStore((s) => s.user);
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const branchId = user?.branch_id ?? null;

  // Mid-session recovery: if AuthBootstrap flips bootstrapped=true with no token,
  // bounce to /login?returnTo=/{locale}/pos. Server-side `requireAuth` only
  // covers first render.
  useRedirectOnAuthCleared(locale);

  // Gate data fetches on bootstrap. Without this, the product query fires on
  // the same tick AuthBootstrap calls /v1/auth/refresh — the query goes out
  // with no Bearer token, hits 401, and (pre-tryRefresh-dedupe) used to wipe
  // the session. Dedupe is in now, but gating is still the right move so the
  // first product query happens with the new access token in the header.
  const productsQ = useQuery({
    queryKey: ["catalog", "products"],
    queryFn: () => productsListRequest(),
    enabled: bootstrapped && !!branchId,
    staleTime: 30_000,
  });
  const categoriesQ = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => categoriesListRequest(),
    enabled: bootstrapped && !!branchId,
    staleTime: 60_000,
  });

  if (!bootstrapped) {
    return <PosShellMessage tone="info">Loading catalog…</PosShellMessage>;
  }
  // No branch linked → selling is impossible (inventory commits against a
  // branch). Show a calm explainer instead of failing at the payment step.
  if (!branchId) {
    return <PosNoBranch canManage={user?.role === "owner"} />;
  }
  if (productsQ.isPending || categoriesQ.isPending) {
    return <PosShellMessage tone="info">Loading catalog…</PosShellMessage>;
  }
  if (productsQ.isError || categoriesQ.isError) {
    return (
      <PosShellMessage tone="error">
        <p style={{ marginBottom: 12 }}>Failed to load products.</p>
        <button
          type="button"
          className="pos-btn"
          onClick={() => {
            void productsQ.refetch();
            void categoriesQ.refetch();
          }}
        >
          Retry
        </button>
      </PosShellMessage>
    );
  }

  const apiProducts = productsQ.data.items;
  const apiCategories = categoriesQ.data.items;
  const products = apiProducts.map((p) => adaptProduct(p, locale));
  const categories = apiCategories.map((c) => adaptCategory(c, locale));

  return (
    <PosView
      locale={locale}
      products={products}
      apiProducts={apiProducts}
      apiCategories={apiCategories}
      categories={categories}
      currency={tenant?.default_currency_code ?? "EGP"}
      branchId={branchId}
      currentUserId={user?.id ?? null}
      userRole={user?.role ?? null}
    />
  );
}

function PosShellMessage({ tone, children }: { tone: "info" | "error"; children: React.ReactNode }) {
  return (
    <div className="pos">
      <div
        style={{
          padding: 40,
          color: tone === "error" ? "var(--ink-2)" : "var(--ink-3)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface PosViewProps {
  locale: "en" | "ar";
  products: Product[];
  apiProducts: ApiProduct[];
  apiCategories: import("@/lib/api/catalog").ApiCategory[];
  categories: Category[];
  currency: string;
  branchId: string | null;
  currentUserId: string | null;
  userRole: string | null;
}

function PosView({
  locale,
  products,
  apiProducts,
  apiCategories,
  categories,
  currency,
  branchId,
  currentUserId,
  userRole,
}: PosViewProps) {
  const t = useTranslations("pos");
  const tenantId = useAuthStore((s) => s.tenant?.id ?? null);
  const queryClient = useQueryClient();

  const [cat, setCat] = useState<string>("all");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CartCustomer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [lineSheet, setLineSheet] = useState<CartLineEx | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [clientUuid, setClientUuid] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; saleId?: string } | null>(null);

  // Held-sales server-side query. Cashiers always see only their own; the
  // server enforces this even when mine_only=false slips through.
  const heldQ = useQuery<HeldSalesListResponse>({
    queryKey: ["held-sales", branchId, currentUserId],
    queryFn: () =>
      heldSalesListRequest({ branchId: branchId ?? "", mineOnly: true }),
    enabled: !!branchId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const held = heldQ.data?.items ?? [];

  const invalidateHeld = () => {
    void queryClient.invalidateQueries({ queryKey: ["held-sales", branchId, currentUserId] });
  };

  const apiProductById = useMemo(() => {
    const m = new Map<string, ApiProduct>();
    for (const p of apiProducts) m.set(p.id, p);
    return m;
  }, [apiProducts]);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          (cat === "all" || p.cat === cat) &&
          (!search ||
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase())),
      ),
    [products, cat, search],
  );

  const cartLines: CartLineEx[] = useMemo(
    () =>
      cart
        .map((c) => {
          const p = products.find((x) => x.id === c.id);
          if (!p) return null;
          const price = p.price * c.qty * (1 - c.discount / 100);
          return { ...c, p, price };
        })
        .filter((l): l is CartLineEx => l !== null),
    [cart, products],
  );

  const subtotal = cartLines.reduce((s, l) => s + l.price, 0);
  const totalDiscount = cartLines.reduce((s, l) => s + (l.p.price * l.qty * l.discount) / 100, 0);

  // Per-line tax preview using the effective rate from `apiProduct.tax_rate_pct`
  // (resolves product class → tenant default → null on the server). For
  // tax-inclusive tenants the displayed price already contains the tax, so we
  // extract it; otherwise it's added on top. Server re-computes authoritatively
  // on completeSale — this is preview only.
  const taxInclusive = useAuthStore((s) => s.tenant?.tax_inclusive_default ?? false);
  const tax = cartLines.reduce((sum, l) => {
    const rate = apiProductById.get(l.p.id)?.tax_rate_pct;
    if (rate == null || rate <= 0) return sum;
    if (taxInclusive) {
      return sum + (l.price * rate) / (100 + rate);
    }
    return sum + (l.price * rate) / 100;
  }, 0);
  const total = taxInclusive ? subtotal : subtotal + tax;

  // Offline POS bootstrap. Idempotent: registering twice is a no-op.
  useEffect(() => {
    startSyncEngine();
  }, []);

  // Keep an offline catalog snapshot fresh whenever we successfully fetch online.
  useEffect(() => {
    void saveCatalogSnapshot(apiProducts, apiCategories).catch(() => undefined);
  }, [apiProducts, apiCategories]);

  // Sync-conflicts summary — show an amber banner with a link for owners/managers/auditors.
  const conflictsSummaryQ = useQuery({
    queryKey: ["sync-conflicts", "summary"],
    queryFn: () => syncConflictsSummaryRequest(),
    enabled:
      userRole === "owner" || userRole === "manager" || userRole === "auditor",
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const openConflicts = conflictsSummaryQ.data?.open ?? 0;

  // Autofocus search on mount; ESC clears + refocuses.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearch("");
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-hide toast.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  function ensureClientUuid(): string {
    if (clientUuid) return clientUuid;
    const fresh = crypto.randomUUID();
    setClientUuid(fresh);
    return fresh;
  }

  const addToCart = (id: string) => {
    ensureClientUuid();
    setCart((c) => {
      const existing = c.find((x) => x.id === id);
      if (existing) return c.map((x) => (x.id === id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { id, qty: 1, discount: 0, note: "" }];
    });
  };
  const adjustQty = (id: string, delta: number) =>
    setCart((c) =>
      c.map((x) => (x.id === id ? { ...x, qty: Math.max(0, x.qty + delta) } : x)).filter((x) => x.qty > 0),
    );
  const updateLine = (id: string, patch: Partial<CartLine>) =>
    setCart((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeLine = (id: string) => setCart((c) => c.filter((x) => x.id !== id));
  const clearCart = () => {
    setCart([]);
    setClientUuid(null);
  };

  // ── Held-sales mutations ───────────────────────────────────────────
  const holdMut = useMutation({
    mutationFn: heldSaleCreateRequest,
    onSuccess: () => {
      invalidateHeld();
      clearCart();
      setToast({ message: t("held.heldToast") });
    },
    onError: () => setToast({ message: t("held.listError") }),
  });

  const resumeMut = useMutation({
    mutationFn: (id: string) => heldSaleResumeRequest(id),
    onSuccess: (payload) => {
      hydrateCartFromPayload(payload);
      invalidateHeld();
      setHeldOpen(false);
    },
    onError: () => setToast({ message: t("held.resumeError") }),
  });

  const discardMut = useMutation({
    mutationFn: (id: string) => heldSaleDiscardRequest(id),
    onSuccess: () => {
      invalidateHeld();
      setToast({ message: t("held.discardConfirm.discardedToast") });
    },
  });

  function hydrateCartFromPayload(payload: ApiHeldSalePayload): void {
    // Translate the DB-shape lines back into CartLine. Discount is stored on
    // disk as cents-off, but the cart model carries it as a percentage of the
    // gross line. Round to a stable int percentage to match the LineEditSheet
    // chips. Unknown / catalog-mismatched lines fall back to discount=0 —
    // safer than carrying a stale price into a re-priced cart.
    const next: CartLine[] = payload.lines
      .map<CartLine | null>((line) => {
        const apiProd = apiProductById.get(line.product_id);
        if (!apiProd) return null;
        const grossCents = BigInt(line.unit_price_cents) * BigInt(line.qty);
        const discountCents = BigInt(line.discount_cents || "0");
        let discountPct = 0;
        if (grossCents > 0n) {
          discountPct = Math.min(
            100,
            Math.max(0, Math.round(Number((discountCents * 100n) / grossCents))),
          );
        }
        return {
          id: line.product_id,
          qty: line.qty,
          discount: discountPct,
          note: line.note ?? "",
        };
      })
      .filter((l): l is CartLine => l !== null);
    setCart(next);
    setClientUuid(crypto.randomUUID());
  }

  const holdCurrent = () => {
    if (cart.length === 0 || !branchId || holdMut.isPending) return;
    const lines = cart
      .map((line) => {
        const apiProd = apiProductById.get(line.id);
        if (!apiProd) return null;
        const unitCents = BigInt(apiProd.price_cents);
        const grossCents = unitCents * BigInt(line.qty);
        const lineDiscountCents = (grossCents * BigInt(line.discount)) / 100n;
        return {
          product_id: line.id,
          qty: line.qty,
          unit_price_cents: unitCents.toString(),
          discount_cents: lineDiscountCents.toString(),
          note: line.note ? line.note : null,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
    if (lines.length === 0) return;

    const subtotalCents = lines.reduce(
      (s, l) => s + BigInt(l.unit_price_cents) * BigInt(l.qty),
      0n,
    );
    const discountCents = lines.reduce((s, l) => s + BigInt(l.discount_cents), 0n);
    const totalCents = subtotalCents - discountCents;
    const ticketName = customer?.name ?? `Ticket ${new Date().toLocaleTimeString()}`;

    holdMut.mutate({
      branch_id: branchId,
      name: ticketName,
      customer_id: customer?.id ?? null,
      currency_code: currency,
      subtotal_cents: subtotalCents.toString(),
      discount_cents: discountCents.toString(),
      tax_cents: "0",
      total_cents: totalCents.toString(),
      lines,
    });
  };

  async function handlePaymentSubmit(payment: PaymentSubmit): Promise<SaleResponse> {
    if (!branchId) {
      throw new Error("No branch assigned to the current user — set user.branch_id and re-login.");
    }
    const lines = cart.map((line) => {
      const apiProd = apiProductById.get(line.id);
      if (!apiProd) throw new Error(`Product ${line.id} no longer in the catalog`);
      const unitCents = BigInt(apiProd.price_cents);
      const grossCents = unitCents * BigInt(line.qty);
      const lineDiscountCents = Number((grossCents * BigInt(line.discount)) / 100n);
      return {
        product_id: line.id,
        qty: line.qty,
        line_discount_cents: lineDiscountCents,
        note: line.note ? line.note : null,
      };
    });
    const uuid = ensureClientUuid();
    const body: CreateSaleInput = {
      branch_id: branchId,
      customer_id: customer?.id ?? null,
      currency_code: currency,
      client_uuid: uuid,
      client_sequence: null,
      lines,
      cash_tendered_cents: null,
    };
    if (payment.method === "split") {
      const payments: SalePaymentInput[] = payment.payments.map((p) => {
        const slice: SalePaymentInput = {
          method: p.method,
          amount_cents: p.amount_cents,
        };
        if (p.approval_code !== undefined) slice.approval_code = p.approval_code;
        if (p.cash_tendered_cents !== undefined) slice.cash_tendered_cents = p.cash_tendered_cents;
        return slice;
      });
      body.payments = payments;
    } else if (payment.method === "cash") {
      body.payment_method = "cash";
      body.cash_tendered_cents = payment.cash_tendered_cents;
    } else if (payment.method === "card") {
      body.payment_method = "card";
      body.approval_code = payment.approval_code;
    } else if (payment.method === "store_credit") {
      body.payment_method = "store_credit";
    } else if (payment.method === "bank_transfer") {
      body.payment_method = "bank_transfer";
    }
    // dispatchSale picks between online direct POST and offline queue based
    // on connection state + queue depth. When queued, we return a synthetic
    // payment_pending SaleResponse so the UI can show a "saved offline" toast
    // without trying to render a receipt for a sale that doesn't exist yet.
    const outcome = await dispatchSale(body);
    if (outcome.kind === "queued") {
      setToast({ message: t("offline.queuedToast") });
      return {
        id: outcome.outbox_id,
        code: "OFFLINE",
        branch_id: branchId,
        cashier_id: currentUserId ?? "",
        customer_id: customer?.id ?? null,
        occurred_at: new Date().toISOString(),
        subtotal_cents: String(Math.round((subtotal ?? 0) * 100)),
        discount_cents: "0",
        tax_cents: "0",
        total_cents: String(Math.round((total ?? 0) * 100)),
        cash_tendered_cents: null,
        change_due_cents: null,
        currency_code: currency,
        payment_method: payment.method === "split" ? "split" : (payment.method as never),
        payment_status: "payment_pending",
        approval_code: null,
        client_uuid: body.client_uuid,
        client_occurred_at: null,
        has_negative_stock: false,
        offline_completed: true,
        lines: [],
        payments: [],
      } satisfies SaleResponse;
    }
    const sale = outcome.sale;

    // Bank transfer: attach the receipt as a payment_proof after the sale is
    // committed. Decoupled — if this fails, the sale still exists in
    // payment_pending and the user can re-upload from /sales/verification.
    if (payment.method === "bank_transfer") {
      try {
        const { items: banks } = await listTenantBankAccounts();
        const bank = banks.find((b) => b.is_default && b.is_active) ?? banks[0];
        if (!bank) {
          throw new Error("No tenant bank account configured");
        }
        await submitPaymentProof({
          context: "sale",
          reference_id: sale.id,
          amount_cents: sale.total_cents,
          currency_code: sale.currency_code,
          bank_account_kind: "tenant",
          bank_account_id: bank.id,
          payer_name: payment.payer_name,
          transfer_date: new Date().toISOString().slice(0, 10),
          transfer_reference: payment.transfer_reference,
          receipt_file: payment.receipt_file,
        });
      } catch (err) {
        // Surface a warning but don't undo the sale.
        setToast({ message: t("payment.upload.fallbackError") });
        // Re-throw so the PaymentSheet shows the inline error too.
        throw err;
      }
    }

    return sale;
  }

  // Resolve the real branch name for the header. Falls back to the branch code,
  // then a generic label while the list loads.
  const branchesQ = useQuery({
    queryKey: ["branches", "list", { include_inactive: false }],
    queryFn: () => branchesListRequest({ include_inactive: false }),
    enabled: !!branchId,
    staleTime: 60_000,
  });
  const activeBranch = branchesQ.data?.items.find((b) => b.id === branchId);
  const branchName =
    activeBranch?.name_i18n?.[locale] || activeBranch?.code || t("header.branchFallback");

  return (
    <ShiftGate branchId={branchId} currency={currency}>
      {(shiftState) => (
        <div className="pos">
          <PosHeader
            branchName={branchName}
            heldCount={held.length}
            heldOpen={heldOpen}
            onToggleHeld={() => setHeldOpen((v) => !v)}
            shiftSlot={
              shiftState.currentShiftId &&
              shiftState.openingFloatCents &&
              shiftState.openedAt ? (
                <ShiftChip
                  openingFloatCents={shiftState.openingFloatCents}
                  openedAt={shiftState.openedAt}
                  currency={currency}
                  locale={locale}
                  onEnd={shiftState.onEndShift}
                />
              ) : null
            }
          />

      {openConflicts > 0 && (
        <div
          role="status"
          style={{
            background: "color-mix(in oklab, var(--amber, #B07A2A) 12%, var(--bg))",
            color: "var(--ink-2)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 13,
            borderBottom: "1px solid var(--rule)",
            fontFamily: "var(--sans)",
          }}
        >
          <span>{t("offline.conflictsBanner", { count: openConflicts })}</span>
          <Link
            href="/sales/sync-conflicts"
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              background: "var(--bg-elev)",
              color: "var(--ink)",
              border: "1px solid var(--rule)",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            {t("offline.conflictsBannerCta")}
          </Link>
        </div>
      )}

      <div className="pos-body">
        <ProductGrid
          search={search}
          setSearch={setSearch}
          searchRef={searchRef}
          cat={cat}
          setCat={setCat}
          categories={categories}
          products={filteredProducts}
          onAdd={addToCart}
          locale={locale}
          tenantId={tenantId}
        />
        <Cart
          lines={cartLines}
          subtotal={subtotal}
          tax={tax}
          totalDiscount={totalDiscount}
          total={total}
          customer={customer}
          taxInclusive={taxInclusive}
          onClear={clearCart}
          onHold={holdCurrent}
          onAdjustQty={adjustQty}
          onTapLine={(line) => setLineSheet(line)}
          onToggleCustomer={() => {
            if (customer) setCustomer(null);
            else setCustomerPickerOpen(true);
          }}
          onPay={() => setPayOpen(true)}
          currency={currency}
        />
      </div>

      {lineSheet && (
        <LineEditSheet
          line={lineSheet}
          onClose={() => setLineSheet(null)}
          onUpdate={(patch) => {
            updateLine(lineSheet.id, patch);
            setLineSheet(null);
          }}
          onRemove={() => {
            removeLine(lineSheet.id);
            setLineSheet(null);
          }}
        />
      )}

      {heldOpen && (
        <HeldSalesTray
          held={held}
          currency={currency}
          onClose={() => setHeldOpen(false)}
          onResume={(h) => {
            resumeMut.mutate(h.id);
          }}
          onDelete={(h) => {
            if (
              typeof window !== "undefined" &&
              !window.confirm(t("held.discardConfirm.body"))
            ) {
              return;
            }
            discardMut.mutate(h.id);
          }}
        />
      )}

      <CustomerPickerModal
        open={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
        onPick={(c: PosCustomerPick) => {
          setCustomer({
            id: c.id,
            name: c.name,
            visits: c.salesCount,
            credit: Math.round(Number(c.storeCreditMinor) / 100),
            currency: c.storeCreditCurrency,
          });
          setCustomerPickerOpen(false);
        }}
        locale={locale}
      />

      {payOpen && (
        <PaymentSheet
          total={total}
          tax={tax}
          taxInclusive={taxInclusive}
          currency={currency}
          customer={null}
          onClose={() => setPayOpen(false)}
          onSubmit={async (payment) => {
            const result = await handlePaymentSubmit(payment);
            setPayOpen(false);
            clearCart();
            setToast({
              message: `${t("payment.completeSale")} · ${result.code}`,
              saleId: result.id,
            });
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            insetInlineEnd: 24,
            padding: "12px 16px",
            background: "var(--ink)",
            color: "var(--bg-elev)",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "var(--sans)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 1000,
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>{toast.message}</span>
          {toast.saleId && (
            <a
              href={`/${locale}/sales/${toast.saleId}/receipt`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--accent)",
                textDecoration: "underline",
                fontWeight: 500,
              }}
            >
              {t("payment.openReceipt")}
            </a>
          )}
        </div>
      )}
        </div>
      )}
    </ShiftGate>
  );
}
