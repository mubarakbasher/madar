// Madar Admin — super-admin app (slate teal accent)
// Shell: sidebar + topbar + impersonation banner. Routes screens.

const { useState: useStateAA, useEffect: useEffectAA, useMemo: useMemoAA } = React;

function AdminApp() {
  const [screen, setScreen] = useStateAA('home');
  const [t, setT] = useStateAA({ dark: false, impersonate: null });
  const [tenantOpen, setTenantOpen] = useStateAA(null);
  const [proofOpen, setProofOpen] = useStateAA(null);

  useEffectAA(() => {
    const r = document.documentElement;
    r.dataset.theme = t.dark ? 'dark' : 'light';
  }, [t.dark]);

  const crumbs = {
    home:        { c: 'Dashboard',         s: 'Mon · 8 May 2026' },
    tenants:     { c: 'Tenants',           s: `${window.ADMIN_DATA.TENANTS.length} total` },
    tenant_detail: { c: 'Tenant',          s: tenantOpen ? (window.ADMIN_DATA.TENANTS.find(t => t.id === tenantOpen)?.name || '') : '' },
    verify:      { c: 'Verification',      s: `${window.ADMIN_DATA.PROOFS.length} pending` },
    invoices:    { c: 'Invoices',          s: 'All tenants' },
    banking:     { c: 'Bank accounts',     s: 'Platform' },
    team:        { c: 'Team',              s: 'Super-admins' },
    audit_la:    { c: 'Login-as audit',    s: 'Impersonation log' },
    audit_pl:    { c: 'Platform audit',    s: 'All actions' },
    settings:    { c: 'Platform settings', s: '' },
  }[screen] || { c: screen, s: '' };

  const navigate = {
    toTenant: id => { setTenantOpen(id); setScreen('tenant_detail'); },
    toProof: id => setProofOpen(id),
    toScreen: setScreen,
  };

  let body;
  switch (screen) {
    case 'home':        body = <AdminHome navigate={navigate} />; break;
    case 'tenants':     body = <TenantList onOpen={id => navigate.toTenant(id)} />; break;
    case 'tenant_detail': body = <TenantDetail tenantId={tenantOpen} onBack={() => setScreen('tenants')} onImpersonate={(t) => setT(s => ({...s, impersonate: t}))} />; break;
    case 'verify':      body = <VerificationQueue onOpenProof={navigate.toProof} />; break;
    case 'invoices':    body = <InvoicesAdmin onOpenTenant={id => navigate.toTenant(id)} />; break;
    case 'banking':     body = <PlatformBanking />; break;
    case 'team':        body = <SuperAdminTeam />; break;
    case 'audit_la':    body = <LoginAsAudit onOpenTenant={id => navigate.toTenant(id)} />; break;
    case 'audit_pl':    body = <PlatformAudit />; break;
    default:            body = <AdminHome navigate={navigate} />;
  }

  return (
    <div className="admin-app">
      {t.impersonate && (
        <ImpersonationBanner tenant={t.impersonate} onExit={() => setT(s => ({...s, impersonate: null}))} />
      )}
      <AdminSidebar active={screen} onNav={setScreen} />
      <AdminTopbar crumb={crumbs.c} sub={crumbs.s} dark={t.dark} onToggleDark={() => setT(s => ({...s, dark: !s.dark}))} />
      <div className="admin-content">
        {body}
      </div>

      {proofOpen && <ProofDetailFull proofId={proofOpen} onClose={() => setProofOpen(null)} />}
    </div>
  );
}

// ─── Impersonation banner ────────────────────────────────────────────────
function ImpersonationBanner({ tenant, onExit }) {
  return (
    <div className="impersonation-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
        <span style={{
          background: 'rgba(255,255,255,0.18)', padding: '4px 10px',
          borderRadius: 4, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>● Impersonating</span>
        <div style={{ flex: 1, fontSize: 13.5 }}>
          You are viewing Madar as <strong>{tenant.name}</strong>.
          Every action is logged to <code style={{ fontSize: 12, opacity: 0.85 }}>audit_log</code> with your user ID as <code style={{ fontSize: 12, opacity: 0.85 }}>impersonator_id</code>.
        </div>
        <button onClick={onExit} style={{
          background: '#fff', color: 'var(--rose)', border: 0,
          padding: '6px 14px', borderRadius: 6, fontFamily: 'inherit',
          fontSize: 12.5, fontWeight: 600, cursor: 'pointer', letterSpacing: '-0.005em',
        }}>Exit impersonation</button>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────
function AdminSidebar({ active, onNav }) {
  const sections = [
    { title: 'Operations', items: [
      { id: 'home',     label: 'Dashboard',  Icon: Icons.Dashboard },
      { id: 'tenants',  label: 'Tenants',    Icon: Icons.Truck },
    ]},
    { title: 'Billing', items: [
      { id: 'verify',   label: 'Verification queue', Icon: Icons.Check, badge: String(window.ADMIN_DATA.PROOFS.length) },
      { id: 'invoices', label: 'All invoices',       Icon: Icons.Receipt },
      { id: 'banking',  label: 'Bank accounts',      Icon: Icons.Bank },
    ]},
    { title: 'Security', items: [
      { id: 'team',     label: 'Super-admin team',  Icon: Icons.User },
      { id: 'audit_la', label: 'Login-as audit',    Icon: Icons.Eye },
      { id: 'audit_pl', label: 'Platform audit',    Icon: Icons.Refresh },
    ]},
  ];
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-mark" style={{ background: 'var(--admin)' }}>M</div>
        <div className="sb-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Madar</span>
          <span style={{
            fontFamily: 'var(--sans)', fontSize: 9.5, fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--admin)', background: 'var(--admin-soft)',
            padding: '2px 6px', borderRadius: 4,
          }}>Admin</span>
        </div>
      </div>

      {sections.map(s => (
        <React.Fragment key={s.title}>
          <div className="sb-section">{s.title}</div>
          <nav className="sb-nav">
            {s.items.map(({ id, label, Icon, badge }) => (
              <button key={id} className="sb-item" aria-current={active === id} onClick={() => onNav(id)}>
                <Icon className="sb-ico" />
                <span className="sb-item-label">{label}</span>
                {badge && <span className="sb-badge">{badge}</span>}
              </button>
            ))}
          </nav>
        </React.Fragment>
      ))}

      <div className="sb-merchant">
        <div className="sb-merchant-avatar" style={{ background: 'linear-gradient(135deg, var(--admin), var(--admin-ink))', color: '#fff' }}>L</div>
        <div className="sb-merchant-meta">
          <b>Layla H.</b>
          <small>Platform Owner</small>
        </div>
      </div>

      <div className="sb-foot">
        <button className="sb-item" onClick={() => onNav('settings')}>
          <Icons.Settings className="sb-ico" />
          <span className="sb-foot-label sb-item-label">Settings</span>
        </button>
      </div>
    </aside>
  );
}

// ─── Topbar ─────────────────────────────────────────────────────────────
function AdminTopbar({ crumb, sub, dark, onToggleDark }) {
  return (
    <div className="topbar">
      <div className="tb-crumb">
        <span className="serif">{crumb}</span>
        {sub && <span className="tb-crumb-sub"> · {sub}</span>}
      </div>
      <div className="tb-spacer" />
      <div className="tb-search" style={{ width: 320 }}>
        <Icons.Search size={14} />
        <input placeholder="Tenants, invoices, proofs, audit…" />
        <kbd>⌘K</kbd>
      </div>
      <div className="tb-pill">
        <span className="dot" />System nominal
      </div>
      <button className="tb-icon-btn" onClick={onToggleDark} title={dark ? 'Light' : 'Dark'}>
        {dark ? <Icons.Sun size={16} /> : <Icons.Moon size={16} />}
      </button>
      <button className="tb-icon-btn" title="Alerts">
        <Icons.Bell size={16} /><span className="badge" />
      </button>
      <button className="tb-avatar" style={{ background: 'var(--admin)', color: '#fff' }}>L</button>
    </div>
  );
}

window.AdminApp = AdminApp;
window.AdminSidebar = AdminSidebar;
window.AdminTopbar = AdminTopbar;
window.ImpersonationBanner = ImpersonationBanner;

ReactDOM.createRoot(document.getElementById('root')).render(<AdminApp />);
