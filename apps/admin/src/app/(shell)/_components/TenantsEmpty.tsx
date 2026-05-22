export function TenantsEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="admin-empty">
      <p className="admin-empty-title">
        {filtered ? "No tenants match those filters" : "No tenants yet"}
      </p>
      <p className="admin-empty-body">
        {filtered
          ? "Try widening the filters or clearing the search."
          : "Tenants appear here as they sign up."}
      </p>
    </div>
  );
}
