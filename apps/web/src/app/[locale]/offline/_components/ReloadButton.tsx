"use client";

export function ReloadButton({ label }: { label: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") window.location.reload();
      }}
      style={{
        padding: "10px 16px",
        borderRadius: 8,
        background: "var(--coral)",
        color: "var(--bg)",
        border: 0,
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}
