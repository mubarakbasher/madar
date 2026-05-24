"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import {
  adminCreateBankAccount,
  adminListBankAccounts,
  adminRevealAccountNumber,
  adminSetBankAccountActive,
  adminUpdateBankAccount,
  type BankAccountResponse,
  type CreateBankAccountInput,
  type UpdateBankAccountInput,
} from "@/lib/api/admin-bank-accounts";
import { useAdminAuthStore } from "@/lib/auth/store";
import { t } from "@/lib/i18n";

function countryFlag(cc: string): string {
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => c.charCodeAt(0) + 127397));
}

export function BankingClient() {
  const user = useAdminAuthStore((s) => s.user);
  const isOwner = user?.role === "owner";
  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccountResponse | null>(null);

  const query = useQuery<BankAccountResponse[]>({
    queryKey: ["admin", "bank-accounts", { includeInactive }],
    queryFn: () => adminListBankAccounts(includeInactive),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      adminSetBankAccountActive(id, active),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "bank-accounts"] });
    },
  });

  const openCreate = () => {
    setEditingAccount(null);
    setModalOpen(true);
  };

  const openEdit = (account: BankAccountResponse) => {
    setEditingAccount(account);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingAccount(null);
  };

  return (
    <>
      <header className="admin-page-header">
        <div>
          <span className="admin-kpi-kicker">{t("banking.kicker")}</span>
          <h1 className="admin-page-title" style={{ marginTop: 6 }}>
            {t("banking.title")}
          </h1>
          <p className="admin-page-sub">
            {t("banking.subtitle")}
          </p>
        </div>
        {isOwner ? (
          <button type="button" className="admin-btn admin-btn-primary" onClick={openCreate}>
            <Plus size={16} strokeWidth={1.75} />
            <span>{t("banking.addAccount")}</span>
          </button>
        ) : null}
      </header>

      <div className="admin-filter-row">
        <label className="admin-checkbox-row">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          <span>{t("banking.includeDisabled")}</span>
        </label>
      </div>

      {query.isPending ? (
        <div className="admin-skeleton-block" aria-busy="true">
          {t("banking.loading")}
        </div>
      ) : query.isError ? (
        <div className="admin-error-block">
          {t("banking.errorLoad")}{" "}
          <button type="button" className="admin-link" onClick={() => void query.refetch()}>
            {t("banking.retry")}
          </button>
        </div>
      ) : query.data.length === 0 ? (
        <EmptyBanking isOwner={isOwner} onCreate={openCreate} />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
            gap: "var(--spacing-4, 16px)",
            marginTop: "var(--spacing-4, 16px)",
          }}
        >
          {query.data.map((account) => (
            <BankAccountCard
              key={account.id}
              account={account}
              isOwner={isOwner}
              onEdit={() => openEdit(account)}
              onToggleActive={(active) => toggleActive.mutate({ id: account.id, active })}
              togglePending={toggleActive.isPending}
            />
          ))}
        </div>
      )}

      {modalOpen ? (
        <AddEditBankAccountModal
          existing={editingAccount}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            void qc.invalidateQueries({ queryKey: ["admin", "bank-accounts"] });
          }}
        />
      ) : null}
    </>
  );
}

function BankAccountCard({
  account,
  isOwner,
  onEdit,
  onToggleActive,
  togglePending,
}: {
  account: BankAccountResponse;
  isOwner: boolean;
  onEdit: () => void;
  onToggleActive: (active: boolean) => void;
  togglePending: boolean;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);

  const handleReveal = async () => {
    setRevealing(true);
    try {
      const result = await adminRevealAccountNumber(account.id);
      setRevealed(result.account_number);
      setConfirmReveal(false);
    } catch {
      // error handled by UI
    } finally {
      setRevealing(false);
    }
  };

  return (
    <div
      className="admin-card"
      style={{
        opacity: account.is_active ? 1 : 0.55,
        padding: "var(--spacing-5, 20px)",
        borderRadius: "var(--radius-lg, 12px)",
        border: "1px solid var(--color-border, #e5e5e5)",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>{countryFlag(account.country_code)}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{account.bank_name}</div>
          <div className="admin-muted" style={{ fontSize: 13 }}>
            {account.account_holder}
          </div>
        </div>
        <span
          className="admin-chip"
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 4,
            background: "var(--color-surface-raised, #f5f5f5)",
          }}
        >
          {account.currency_code}
        </span>
      </div>

      <div style={{ fontSize: 18, fontFamily: "var(--font-mono, monospace)", marginBottom: 8 }}>
        {revealed ? revealed : `•••• ${account.account_number_last4}`}
      </div>

      {account.iban_last4 ? (
        <div className="admin-muted" style={{ fontSize: 12, marginBottom: 4 }}>
          {t("banking.ibanPrefix")} •••• {account.iban_last4}
        </div>
      ) : null}

      {account.swift ? (
        <div className="admin-muted" style={{ fontSize: 12, marginBottom: 4 }}>
          {t("banking.swiftPrefix")} {account.swift}
        </div>
      ) : null}

      {account.name_i18n.en ? (
        <div className="admin-muted" style={{ fontSize: 12, marginTop: 8 }}>
          {account.name_i18n.en}
        </div>
      ) : null}

      {!account.is_active ? (
        <span
          className="admin-chip-inactive"
          style={{ display: "inline-block", marginTop: 8, fontSize: 11 }}
        >
          {t("banking.disabled")}
        </span>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid var(--color-border, #e5e5e5)",
        }}
      >
        {isOwner ? (
          <>
            {!revealed ? (
              confirmReveal ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-danger"
                    disabled={revealing}
                    onClick={() => void handleReveal()}
                  >
                    {revealing ? "..." : t("banking.confirmReveal")}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm"
                    onClick={() => setConfirmReveal(false)}
                  >
                    {t("banking.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="admin-btn admin-btn-sm"
                  onClick={() => setConfirmReveal(true)}
                >
                  <Eye size={14} strokeWidth={1.5} />
                  <span>{t("banking.reveal")}</span>
                </button>
              )
            ) : (
              <button
                type="button"
                className="admin-btn admin-btn-sm"
                onClick={() => setRevealed(null)}
              >
                <EyeOff size={14} strokeWidth={1.5} />
                <span>{t("banking.hide")}</span>
              </button>
            )}

            <button type="button" className="admin-btn admin-btn-sm" onClick={onEdit}>
              <Pencil size={14} strokeWidth={1.5} />
              <span>{t("banking.edit")}</span>
            </button>

            <button
              type="button"
              className="admin-btn admin-btn-sm"
              disabled={togglePending}
              onClick={() => onToggleActive(!account.is_active)}
            >
              {account.is_active ? t("banking.disable") : t("banking.enable")}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function EmptyBanking({ isOwner, onCreate }: { isOwner: boolean; onCreate: () => void }) {
  return (
    <div className="admin-empty-block">
      <Building2 size={32} strokeWidth={1.25} />
      <h2>{t("banking.empty.title")}</h2>
      <p>
        {t("banking.empty.body")}
      </p>
      {isOwner ? (
        <button type="button" className="admin-btn admin-btn-primary" onClick={onCreate}>
          {t("banking.empty.createFirst")}
        </button>
      ) : (
        <p className="admin-muted">{t("banking.empty.ownerOnly")}</p>
      )}
    </div>
  );
}

function AddEditBankAccountModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: BankAccountResponse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!existing;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bankName, setBankName] = useState(existing?.bank_name ?? "");
  const [accountHolder, setAccountHolder] = useState(existing?.account_holder ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [swift, setSwift] = useState(existing?.swift ?? "");
  const [currencyCode, setCurrencyCode] = useState(existing?.currency_code ?? "");
  const [countryCode, setCountryCode] = useState(existing?.country_code ?? "");
  const [nameEn, setNameEn] = useState(existing?.name_i18n.en ?? "");
  const [notesEn, setNotesEn] = useState(existing?.notes_i18n.en ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (isEdit) {
        const body: UpdateBankAccountInput = {};
        if (bankName !== existing.bank_name) body.bank_name = bankName;
        if (accountHolder !== existing.account_holder) body.account_holder = accountHolder;
        if (accountNumber) body.account_number = accountNumber;
        if (iban) body.iban = iban;
        if (swift !== (existing.swift ?? "")) body.swift = swift;
        if (currencyCode !== existing.currency_code) body.currency_code = currencyCode;
        if (countryCode !== existing.country_code) body.country_code = countryCode;
        if (nameEn !== existing.name_i18n.en) body.name_en = nameEn;
        if (notesEn !== existing.notes_i18n.en) body.notes_en = notesEn;

        if (Object.keys(body).length === 0) {
          onSaved();
          return;
        }
        await adminUpdateBankAccount(existing.id, body);
      } else {
        const body: CreateBankAccountInput = {
          bank_name: bankName,
          account_holder: accountHolder,
          account_number: accountNumber,
          currency_code: currencyCode,
          country_code: countryCode,
          ...(iban ? { iban } : {}),
          ...(swift ? { swift } : {}),
          ...(nameEn ? { name_en: nameEn } : {}),
          ...(notesEn ? { notes_en: notesEn } : {}),
        };
        await adminCreateBankAccount(body);
      }
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("banking.modal.fallbackError");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: "100%" }}
      >
        <h2 className="admin-modal-title">
          {isEdit ? t("banking.modal.editTitle") : t("banking.modal.addTitle")}
        </h2>

        {error ? <div className="admin-error-block" style={{ marginBottom: 12 }}>{error}</div> : null}

        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span className="admin-label">{t("banking.modal.bankName")}</span>
              <input
                className="admin-input"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                required
                maxLength={200}
              />
            </label>

            <label className="admin-field">
              <span className="admin-label">{t("banking.modal.accountHolder")}</span>
              <input
                className="admin-input"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                required
                maxLength={200}
              />
            </label>

            <label className="admin-field">
              <span className="admin-label">
                {isEdit ? t("banking.modal.accountNumberEdit") : t("banking.modal.accountNumberNew")}
              </span>
              <input
                className="admin-input"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                required={!isEdit}
                minLength={4}
                maxLength={34}
                placeholder={isEdit ? `•••• ${existing.account_number_last4}` : ""}
              />
            </label>

            <label className="admin-field">
              <span className="admin-label">{t("banking.modal.iban")}</span>
              <input
                className="admin-input"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                maxLength={34}
              />
            </label>

            <label className="admin-field">
              <span className="admin-label">{t("banking.modal.swift")}</span>
              <input
                className="admin-input"
                value={swift}
                onChange={(e) => setSwift(e.target.value)}
                maxLength={11}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label className="admin-field">
                <span className="admin-label">{t("banking.modal.currencyCode")}</span>
                <input
                  className="admin-input"
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                  required
                  maxLength={3}
                  minLength={3}
                  placeholder="USD"
                  style={{ textTransform: "uppercase" }}
                />
              </label>

              <label className="admin-field">
                <span className="admin-label">{t("banking.modal.countryCode")}</span>
                <input
                  className="admin-input"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                  required
                  maxLength={2}
                  minLength={2}
                  placeholder="US"
                  style={{ textTransform: "uppercase" }}
                />
              </label>
            </div>

            <label className="admin-field">
              <span className="admin-label">{t("banking.modal.displayName")}</span>
              <input
                className="admin-input"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                maxLength={200}
                placeholder={t("banking.modal.displayNamePlaceholder")}
              />
            </label>

            <label className="admin-field">
              <span className="admin-label">{t("banking.modal.notes")}</span>
              <textarea
                className="admin-input"
                value={notesEn}
                onChange={(e) => setNotesEn(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </label>
          </div>

          <div className="admin-modal-actions">
            <button type="button" className="admin-btn" onClick={onClose} disabled={saving}>
              {t("banking.modal.cancel")}
            </button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
              {saving ? t("banking.modal.saving") : isEdit ? t("banking.modal.update") : t("banking.modal.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
