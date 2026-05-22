export function TenantsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="admin-error" role="alert">
      <p className="admin-error-title">Couldn&apos;t load tenants</p>
      <p className="admin-error-body" style={{ marginBottom: 14 }}>
        The platform API didn&apos;t respond. Try again — if it persists, check the API service.
      </p>
      <button type="button" className="admin-tb-action" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
