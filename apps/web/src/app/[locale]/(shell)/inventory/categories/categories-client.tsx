"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { Link } from "../../../../../../i18n/routing";
import { ApiError } from "@/lib/api/client";
import {
  categoriesListRequest,
  categoryCreateRequest,
  categoryDeleteRequest,
  categoryUpdateRequest,
  type ApiCategory,
  type CreateCategoryBody,
  type UpdateCategoryBody,
} from "@/lib/api/catalog";
import "./categories.css";

interface TreeNode extends ApiCategory {
  depth: number;
  children: TreeNode[];
}

function buildTree(items: ApiCategory[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const c of items) byId.set(c.id, { ...c, depth: 0, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      const parent = byId.get(node.parent_id)!;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Stable sort: by sort_order asc, then by en name. Apply to every level.
  const sortLevel = (nodes: TreeNode[], depth: number): void => {
    nodes.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name_i18n.en.localeCompare(b.name_i18n.en);
    });
    for (const n of nodes) {
      n.depth = depth;
      sortLevel(n.children, depth + 1);
    }
  };
  sortLevel(roots, 0);
  return roots;
}

function flatten(nodes: TreeNode[], expanded: Set<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (ns: TreeNode[]): void => {
    for (const n of ns) {
      out.push(n);
      if (n.children.length > 0 && expanded.has(n.id)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

type DialogState =
  | { kind: "closed" }
  | { kind: "create"; parentId: string | null }
  | { kind: "edit"; category: ApiCategory };

export function CategoriesClient({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("categoriesPage");
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [confirmDelete, setConfirmDelete] = useState<ApiCategory | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const categoriesQ = useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: () => categoriesListRequest(),
    staleTime: 30_000,
  });

  const items = useMemo(
    () => categoriesQ.data?.items ?? [],
    [categoriesQ.data],
  );
  const tree = useMemo(() => buildTree(items), [items]);
  const rows = useMemo(() => flatten(tree, expanded), [tree, expanded]);
  const selected = useMemo(
    () => items.find((c) => c.id === selectedId) ?? null,
    [items, selectedId],
  );
  const parentOf = useMemo(() => {
    if (!selected?.parent_id) return null;
    return items.find((c) => c.id === selected.parent_id) ?? null;
  }, [items, selected]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoryDeleteRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog"] });
      setConfirmDelete(null);
      setSelectedId(null);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === "category_in_use") setActionError(t("errors.inUse"));
        else if (err.code === "forbidden_during_impersonation")
          setActionError(t("errors.impersonating"));
        else setActionError(err.message);
      } else {
        setActionError(t("errors.network"));
      }
    },
  });

  function toggleExpand(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function fmt(c: ApiCategory): string {
    return locale === "ar" && c.name_i18n.ar ? c.name_i18n.ar : c.name_i18n.en;
  }

  if (categoriesQ.isPending) {
    return (
      <div className="cat">
        <p className="cat-head-sub">{t("loading")}</p>
      </div>
    );
  }
  if (categoriesQ.isError) {
    return (
      <div className="cat">
        <p className="cat-head-sub">{t("errors.loadFailed")}</p>
        <button
          type="button"
          className="cat-btn"
          onClick={() => categoriesQ.refetch()}
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="cat">
      <header className="cat-head">
        <div>
          <span className="kicker">{t("kicker")}</span>
          <h1 className="cat-head-title">{t("title")}</h1>
          <p className="cat-head-sub">
            <Link href="/inventory">← {t("backToInventory")}</Link>
          </p>
        </div>
        <div>
          <button
            type="button"
            className="cat-btn cat-btn-primary"
            onClick={() => {
              setActionError(null);
              setDialog({ kind: "create", parentId: null });
            }}
          >
            <Plus size={14} strokeWidth={1.5} />
            {t("actions.addCategory")}
          </button>
        </div>
      </header>

      <div className="cat-grid">
        <section className="cat-tree" aria-label={t("tree.label")}>
          {rows.length === 0 ? (
            <div className="cat-tree-empty">
              <p>{t("empty.title")}</p>
              <button
                type="button"
                className="cat-btn cat-btn-primary"
                style={{ marginBlockStart: "var(--space-3)" }}
                onClick={() => setDialog({ kind: "create", parentId: null })}
              >
                <Plus size={14} strokeWidth={1.5} />
                {t("empty.cta")}
              </button>
            </div>
          ) : (
            rows.map((node) => {
              const hasChildren = node.children.length > 0;
              const isOpen = expanded.has(node.id);
              const isSelected = node.id === selectedId;
              return (
                <button
                  key={node.id}
                  type="button"
                  className="cat-row"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedId(node.id);
                    setActionError(null);
                  }}
                  style={{ paddingInlineStart: 12 + node.depth * 16 }}
                >
                  {hasChildren ? (
                    <span
                      role="button"
                      aria-label={isOpen ? t("tree.collapse") : t("tree.expand")}
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(node.id);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      {isOpen ? (
                        <ChevronDown className="cat-chevron" size={14} strokeWidth={1.5} />
                      ) : (
                        <ChevronRight
                          className="cat-chevron"
                          size={14}
                          strokeWidth={1.5}
                        />
                      )}
                    </span>
                  ) : (
                    <span style={{ width: 14 }} />
                  )}
                  <span className="cat-row-name">{fmt(node)}</span>
                  <span className="cat-row-code">{node.code}</span>
                  <span className="cat-row-count">
                    {t("tree.countLabel", { count: node.product_count })}
                  </span>
                </button>
              );
            })
          )}
        </section>

        <aside className="cat-panel" aria-label={t("panel.label")}>
          {!selected ? (
            <div className="cat-panel-empty">{t("panel.empty")}</div>
          ) : (
            <>
              <h2 className="cat-panel-title">{fmt(selected)}</h2>
              <div className="cat-row-code" style={{ marginBlockStart: 2 }}>
                {selected.code}
              </div>

              <div className="cat-panel-section">
                <div className="cat-panel-label">{t("panel.nameEn")}</div>
                <div className="cat-panel-value">{selected.name_i18n.en}</div>
              </div>
              <div className="cat-panel-section">
                <div className="cat-panel-label">{t("panel.nameAr")}</div>
                <div className="cat-panel-value">
                  {selected.name_i18n.ar || (
                    <span className="cat-panel-value dim">{t("panel.empty")}</span>
                  )}
                </div>
              </div>
              <div className="cat-panel-section">
                <div className="cat-panel-label">{t("panel.parent")}</div>
                <div className="cat-panel-value">
                  {parentOf ? (
                    fmt(parentOf)
                  ) : (
                    <span className="cat-panel-value dim">{t("panel.noParent")}</span>
                  )}
                </div>
              </div>
              <div className="cat-panel-section">
                <div className="cat-panel-label">{t("panel.productCount")}</div>
                <div className="cat-panel-value">
                  {t("tree.countLabel", { count: selected.product_count })}
                </div>
              </div>
              <div className="cat-panel-section">
                <div className="cat-panel-label">{t("panel.sortOrder")}</div>
                <div className="cat-panel-value">{selected.sort_order}</div>
              </div>

              {actionError && (
                <div className="cat-server-error" style={{ marginBlockStart: "var(--space-3)" }}>
                  {actionError}
                </div>
              )}

              <div className="cat-actions">
                <button
                  type="button"
                  className="cat-btn"
                  onClick={() => {
                    setActionError(null);
                    setDialog({ kind: "create", parentId: selected.id });
                  }}
                >
                  <Plus size={13} strokeWidth={1.5} />
                  {t("actions.addChild")}
                </button>
                <button
                  type="button"
                  className="cat-btn"
                  onClick={() => {
                    setActionError(null);
                    setDialog({ kind: "edit", category: selected });
                  }}
                >
                  <Pencil size={13} strokeWidth={1.5} />
                  {t("actions.edit")}
                </button>
                <button
                  type="button"
                  className="cat-btn cat-btn-danger"
                  onClick={() => {
                    setActionError(null);
                    setConfirmDelete(selected);
                  }}
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                  {t("actions.delete")}
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {dialog.kind !== "closed" && (
        <CategoryFormDialog
          state={dialog}
          siblings={items}
          onClose={() => setDialog({ kind: "closed" })}
          onSaved={(id) => {
            qc.invalidateQueries({ queryKey: ["catalog"] });
            setSelectedId(id);
            setDialog({ kind: "closed" });
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          category={confirmDelete}
          locale={locale}
          submitting={deleteMutation.isPending}
          error={actionError}
          onCancel={() => {
            setConfirmDelete(null);
            setActionError(null);
          }}
          onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
        />
      )}
    </div>
  );
}

interface FormFields {
  code: string;
  name_en: string;
  name_ar: string;
  parent_id: string;
  sort_order: string;
}

function CategoryFormDialog({
  state,
  siblings,
  onClose,
  onSaved,
}: {
  state: Exclude<DialogState, { kind: "closed" }>;
  siblings: ApiCategory[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const t = useTranslations("categoriesPage");
  const isEdit = state.kind === "edit";
  const existing = isEdit ? state.category : null;

  const [form, setForm] = useState<FormFields>(() => ({
    code: existing?.code ?? "",
    name_en: existing?.name_i18n.en ?? "",
    name_ar: existing?.name_i18n.ar ?? "",
    parent_id: existing
      ? existing.parent_id ?? ""
      : state.kind === "create"
        ? state.parentId ?? ""
        : "",
    sort_order: String(existing?.sort_order ?? 0),
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function set<K extends keyof FormFields>(key: K, value: FormFields[K]): void {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => {
      if (!e[String(key)]) return e;
      const next = { ...e };
      delete next[String(key)];
      return next;
    });
  }

  function handleApiError(err: unknown): void {
    if (err instanceof ApiError) {
      if (err.fields) setFieldErrors(err.fields);
      if (err.code === "category_code_taken") {
        setFieldErrors((e) => ({ ...e, code: t("errors.codeTaken") }));
        setServerError(null);
      } else if (err.code === "self_parent") {
        setFieldErrors((e) => ({ ...e, parent_id: t("errors.selfParent") }));
        setServerError(null);
      } else {
        setServerError(err.message);
      }
    } else {
      setServerError(t("errors.network"));
    }
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateCategoryBody) => categoryCreateRequest(body),
    onSuccess: (c) => onSaved(c.id),
    onError: handleApiError,
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateCategoryBody) =>
      categoryUpdateRequest(existing!.id, body),
    onSuccess: (c) => onSaved(c.id),
    onError: handleApiError,
  });

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!form.code.trim()) errs.code = t("errors.required");
    else if (!/^[A-Z0-9_-]+$/.test(form.code.trim()))
      errs.code = t("errors.codeFormat");
    if (!form.name_en.trim()) errs.name_en = t("errors.required");
    if (!form.name_ar.trim()) errs.name_ar = t("errors.required");
    const so = Number(form.sort_order);
    if (!Number.isFinite(so) || so < 0) errs.sort_order = t("errors.sortOrder");
    return errs;
  }

  function submit(): void {
    setServerError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const parent_id = form.parent_id.trim() || null;
    const sort_order = Number(form.sort_order);
    const name_i18n = { en: form.name_en.trim(), ar: form.name_ar.trim() };
    if (isEdit) {
      const body: UpdateCategoryBody = {};
      if (form.code.trim() !== existing!.code) body.code = form.code.trim();
      if (
        name_i18n.en !== existing!.name_i18n.en ||
        name_i18n.ar !== existing!.name_i18n.ar
      ) {
        body.name_i18n = name_i18n;
      }
      if (parent_id !== existing!.parent_id) body.parent_id = parent_id;
      if (sort_order !== existing!.sort_order) body.sort_order = sort_order;
      updateMutation.mutate(body);
    } else {
      createMutation.mutate({
        code: form.code.trim(),
        name_i18n,
        parent_id,
        sort_order,
      });
    }
  }

  const busy = createMutation.isPending || updateMutation.isPending;

  // Build parent options. In edit mode, exclude self + descendants to prevent cycles.
  const parentOptions = useMemo(() => {
    if (!isEdit) return siblings;
    const forbidden = new Set<string>([existing!.id]);
    // Mark descendants recursively.
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of siblings) {
        if (c.parent_id && forbidden.has(c.parent_id) && !forbidden.has(c.id)) {
          forbidden.add(c.id);
          changed = true;
        }
      }
    }
    return siblings.filter((c) => !forbidden.has(c.id));
  }, [siblings, isEdit, existing]);

  return (
    <div
      className="cat-modal-backdrop"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div className="cat-modal" onClick={(e) => e.stopPropagation()}>
        <header className="cat-modal-head">
          <h2 className="cat-modal-title">
            {isEdit ? t("dialog.titleEdit") : t("dialog.titleNew")}
          </h2>
          <button
            type="button"
            className="cat-btn"
            style={{ padding: "var(--space-1)", border: 0 }}
            aria-label={t("dialog.close")}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>
        <div className="cat-modal-body">
          {serverError && <div className="cat-server-error">{serverError}</div>}

          <label className="cat-field">
            <span className="cat-field-label">{t("form.code")}</span>
            <input
              className="cat-field-input"
              type="text"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="ESPRESSO"
              autoFocus={!isEdit}
            />
            {fieldErrors.code && (
              <div className="cat-field-error">{fieldErrors.code}</div>
            )}
          </label>

          <div className="cat-field-row">
            <label className="cat-field">
              <span className="cat-field-label">{t("form.nameEn")}</span>
              <input
                className="cat-field-input"
                type="text"
                value={form.name_en}
                onChange={(e) => set("name_en", e.target.value)}
                dir="ltr"
              />
              {fieldErrors.name_en && (
                <div className="cat-field-error">{fieldErrors.name_en}</div>
              )}
            </label>
            <label className="cat-field">
              <span className="cat-field-label">{t("form.nameAr")}</span>
              <input
                className="cat-field-input"
                type="text"
                value={form.name_ar}
                onChange={(e) => set("name_ar", e.target.value)}
                dir="rtl"
              />
              {fieldErrors.name_ar && (
                <div className="cat-field-error">{fieldErrors.name_ar}</div>
              )}
            </label>
          </div>

          <label className="cat-field">
            <span className="cat-field-label">{t("form.parent")}</span>
            <select
              className="cat-field-select"
              value={form.parent_id}
              onChange={(e) => set("parent_id", e.target.value)}
            >
              <option value="">{t("form.parentNone")}</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_i18n.en} ({c.code})
                </option>
              ))}
            </select>
            {fieldErrors.parent_id && (
              <div className="cat-field-error">{fieldErrors.parent_id}</div>
            )}
          </label>

          <label className="cat-field">
            <span className="cat-field-label">{t("form.sortOrder")}</span>
            <input
              className="cat-field-input"
              type="number"
              min={0}
              step={1}
              value={form.sort_order}
              onChange={(e) => set("sort_order", e.target.value)}
            />
            {fieldErrors.sort_order && (
              <div className="cat-field-error">{fieldErrors.sort_order}</div>
            )}
          </label>

          <div className="cat-modal-footer">
            <button
              type="button"
              className="cat-btn"
              onClick={onClose}
              disabled={busy}
            >
              {t("dialog.cancel")}
            </button>
            <button
              type="button"
              className="cat-btn cat-btn-primary"
              onClick={submit}
              disabled={busy}
            >
              {busy ? "…" : isEdit ? t("dialog.save") : t("dialog.create")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({
  category,
  locale,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  category: ApiCategory;
  locale: "en" | "ar";
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("categoriesPage");
  const name = locale === "ar" && category.name_i18n.ar ? category.name_i18n.ar : category.name_i18n.en;
  return (
    <div className="cat-modal-backdrop" role="dialog" aria-modal onClick={onCancel}>
      <div className="cat-modal" onClick={(e) => e.stopPropagation()}>
        <header className="cat-modal-head">
          <h2 className="cat-modal-title">{t("confirmDelete.title")}</h2>
          <button
            type="button"
            className="cat-btn"
            style={{ padding: "var(--space-1)", border: 0 }}
            aria-label={t("dialog.close")}
            onClick={onCancel}
          >
            <X size={16} />
          </button>
        </header>
        <div className="cat-modal-body">
          {error && <div className="cat-server-error">{error}</div>}
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>
            {t("confirmDelete.body", { name })}
          </p>
          <div className="cat-modal-footer">
            <button
              type="button"
              className="cat-btn"
              onClick={onCancel}
              disabled={submitting}
            >
              {t("dialog.cancel")}
            </button>
            <button
              type="button"
              className="cat-btn cat-btn-danger"
              onClick={onConfirm}
              disabled={submitting}
            >
              {submitting ? "…" : t("confirmDelete.confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
