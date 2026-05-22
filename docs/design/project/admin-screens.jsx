// Madar Admin — supporting screens
// AdminHome, TenantList, TenantDetail, InvoicesAdmin,
// PlatformBanking, SuperAdminTeam, LoginAsAudit, PlatformAudit

const { useState: useStateS, useMemo: useMemoS } = React;

// ─── A1. Admin Home ──────────────────────────────────────────────────────
function AdminHome({ navigate }) {
  const D = window.ADMIN_DATA;
  const trialEnding = D.TENANTS.filter(t => t.status === 'trial').length + 2;
  const mrr = D.TENANTS.filter(t => t.status === 'active').reduce((s, t) => s + t.mrr, 0);
  const grace = D.TENANTS.filter(t => t.status === 'grace').length;

  const kpis = [
    { kicker: 'Monthly recurring',  value: `£${mrr.toLocaleString()}`,  delta: '+ 8.4 %', dir: 'up',  note: 'across active subscriptions' },
    { kicker: 'Active tenants',     value: D.TENANTS.filter(t => t.status === 'active').length, delta: '+ 2', dir: 'up', note: 'this week · 1 trial → paid' },
    { kicker: 'Trials ending',      value: trialEnding,                   delta: '— ', dir: '',     note: 'within 7 days · 4 likely to convert' },
    { kicker: 'Pending verifications', value: D.PROOFS.length,            delta: '+ 3 since 9 AM', dir: '',  note: 'oldest 6.2 days · finance queue' },
    { kicker: 'System',             value: 'Healthy',                     delta: '99.97 % · 30d', dir: 'up', note: 'last incident · 14 days ago' },
  ];

  return (
    <div className="admin-content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <span className="kicker">Mon · 8 May 2026 · 14:23 EET</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em' }}>
            Good afternoon, Layla.
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--ink-3)' }}>
            <strong className="tnum" style={{ color: 'var(--amber)' }}>{D.PROOFS.length}</strong> receipts need verification ·
            <strong className="tnum"> {grace}</strong> tenants in grace ·
            <strong className="tnum"> 1</strong> overdue invoice past 30 days
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm"><Icons.Download size={13} />Weekly digest</button>
          <button className="btn btn-sm btn-primary" onClick={() => navigate.toScreen('verify')}>
            <Icons.Check size={13} />Open verification queue
          </button>
        </div>
      </header>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpis.length}, 1fr)`, gap: 12, marginBottom: 22 }}>
        {kpis.map(k => (
          <div key={k.kicker} className="card" style={{ padding: 18 }}>
            <div className="kicker">{k.kicker}</div>
            <div className="serif tnum" style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 4 }}>{k.value}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              {k.delta && (
                <span className={`delta ${k.dir}`} style={{ fontSize: 11.5 }}>{k.delta}</span>
              )}
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>· {k.note}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Two-col body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18 }}>
        {/* Verification snapshot */}
        <section className="card" style={{ padding: 0 }}>
          <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--rule)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <span className="kicker" style={{ color: 'var(--admin)' }}>Verification · top 5 oldest</span>
              <h2 className="serif" style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 500 }}>Needs your attention</h2>
            </div>
            <button className="btn btn-sm" onClick={() => navigate.toScreen('verify')}>Open queue →</button>
          </header>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {D.PROOFS.slice().sort((a, b) => b.daysPending - a.daysPending).slice(0, 5).map(p => {
              const t = D.TENANTS.find(t => t.id === p.tenantId);
              const flags = Object.values(p.match).filter(v => !v).length;
              return (
                <li key={p.id} style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto auto',
                  gap: 14, padding: '14px 20px',
                  borderBottom: '1px solid var(--rule)', alignItems: 'center',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 50,
                    background: 'var(--admin-soft)', color: 'var(--admin)',
                    display: 'grid', placeItems: 'center',
                    fontFamily: 'var(--serif)', fontSize: 13, fontWeight: 500,
                  }}>{t.name.slice(0, 1)}</div>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
                      {p.id} · {flags > 0 ? <span style={{ color: 'var(--amber)' }}>{flags} mismatch{flags === 1 ? '' : 'es'}</span> : <span style={{ color: 'var(--sage)' }}>all matched</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'end' }}>
                    <div className="serif tnum" style={{ fontSize: 16, fontWeight: 500 }}>{p.symbol}{p.amount.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: p.daysPending > 3 ? 'var(--rose)' : 'var(--ink-3)' }}>{p.daysPending.toFixed(1)}d</div>
                  </div>
                  <button className="btn btn-sm btn-primary" style={{ background: 'var(--sage)', borderColor: 'var(--sage)' }} onClick={() => navigate.toScreen('verify')}>
                    <Icons.Check size={12} />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Activity feed */}
        <section className="card" style={{ padding: 0 }}>
          <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--rule)' }}>
            <span className="kicker">Recent activity</span>
            <h2 className="serif" style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 500 }}>Across the platform</h2>
          </header>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 440, overflow: 'auto' }}>
            {D.RECENT_ACTIVITY.map((e, i) => (
              <li key={i} style={{
                display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: 12,
                padding: '12px 20px', borderBottom: i === D.RECENT_ACTIVITY.length - 1 ? 'none' : '1px solid var(--rule)',
                alignItems: 'center',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 50,
                  background: e.kind === 'verified' ? 'var(--sage)' :
                              e.kind === 'signup' ? 'var(--admin)' :
                              e.kind === 'suspend' || e.kind === 'cancel' ? 'var(--rose)' :
                              e.kind === 'submit' ? 'var(--amber)' : 'var(--ink-3)',
                }} />
                <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{e.text}</div>
                <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{e.ts}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Growth strip */}
      <section style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="card" style={{ padding: 22 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span className="kicker">Tenant growth · 90 days</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>10 → 12 tenants</span>
          </header>
          <MiniChart kind="line" />
        </div>
        <div className="card" style={{ padding: 22 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span className="kicker">MRR trend · 90 days</span>
            <span style={{ fontSize: 11, color: 'var(--sage)' }}>+ £4,840</span>
          </header>
          <MiniChart kind="area" />
        </div>
      </section>
    </div>
  );
}

function MiniChart({ kind }) {
  const points = [12, 14, 11, 16, 19, 18, 21, 24, 22, 27, 30, 28, 33, 36, 34, 38, 41, 39, 44, 46];
  const max = Math.max(...points), min = Math.min(...points);
  const w = 600, h = 100;
  const pts = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - ((v - min) / (max - min)) * (h - 16) - 4}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 100 }} preserveAspectRatio="none">
      {kind === 'area' && (
        <polygon points={`0,${h} ${pts} ${w},${h}`} fill="var(--admin-soft)" opacity="0.6" />
      )}
      <polyline points={pts} fill="none" stroke="var(--admin)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── A2. All Tenants List ────────────────────────────────────────────────
function TenantList({ onOpen }) {
  const D = window.ADMIN_DATA;
  const [filter, setFilter] = useStateS('all');
  const [country, setCountry] = useStateS('all');
  const [search, setSearch] = useStateS('');

  const rows = D.TENANTS.filter(t =>
    (filter === 'all' || t.status === filter) &&
    (country === 'all' || t.country === country) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()))
  );

  const countries = [...new Set(D.TENANTS.map(t => t.country))];

  return (
    <div className="admin-content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <span className="kicker">Tenants · all plans</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            All tenants
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            <strong className="tnum">{rows.length}</strong> matching · across{' '}
            <strong className="tnum">{countries.length}</strong> countries
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm"><Icons.Send size={13} />Send announcement</button>
          <button className="btn btn-sm"><Icons.Download size={13} />Export</button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['all','All'],['trial','Trial'],['active','Active'],['grace','In grace'],['suspended','Suspended'],['cancelled','Cancelled']].map(([k,l]) => (
          <button key={k} className="chip" data-active={filter === k} onClick={() => setFilter(k)} style={{ cursor: 'pointer' }}>{l}</button>
        ))}
        <span style={{ width: 1, height: 18, background: 'var(--rule)', margin: '0 4px' }} />
        <select value={country} onChange={e => setCountry(e.target.value)} style={{
          padding: '5px 10px', borderRadius: 100, border: '1px solid var(--rule)', background: 'var(--bg-elev)', fontSize: 12,
        }}>
          <option value="all">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <div className="tb-search" style={{ width: 280 }}>
          <Icons.Search size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tenant name…" />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
          <thead>
            <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
              {['', 'Tenant', 'Country', 'Plan', 'Branches', 'Users', 'MRR', 'Status', 'Last activity', 'Signed up'].map((h, i) => (
                <th key={h + i} style={{ textAlign: i === 6 ? 'end' : 'start', padding: '12px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const s = D.STATUS_MAP[t.status];
              return (
                <tr key={t.id} className="inv-row" onClick={() => onOpen(t.id)}
                    style={{ borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--rule)', cursor: 'pointer' }}>
                  <td style={{ padding: '14px', width: 32 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: 'var(--admin-soft)', color: 'var(--admin)',
                      display: 'grid', placeItems: 'center',
                      fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 500,
                    }}>{t.name.slice(0, 1)}</div>
                  </td>
                  <td style={{ padding: '14px', fontWeight: 500 }}>{t.name}</td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{t.flag} {t.country}</td>
                  <td style={{ padding: '14px' }}>{t.plan}</td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{t.branches}</td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{t.users}</td>
                  <td style={{ padding: '14px', textAlign: 'end', fontWeight: 500 }}>£{t.mrr.toLocaleString()}</td>
                  <td style={{ padding: '14px' }}>
                    <span className="chip" style={{ background: s.bg, color: s.color, borderColor: 'transparent', fontSize: 11 }}>{s.label}</span>
                  </td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)', fontSize: 12 }}>{t.lastActivity}</td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)', fontSize: 12 }}>{t.signed.slice(0, 7)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── A3. Tenant Detail ──────────────────────────────────────────────────
function TenantDetail({ tenantId, onBack, onImpersonate }) {
  const D = window.ADMIN_DATA;
  const t = D.TENANTS.find(t => t.id === tenantId);
  const [tab, setTab] = useStateS('overview');
  const [confirmImp, setConfirmImp] = useStateS(false);
  if (!t) return null;
  const s = D.STATUS_MAP[t.status];

  return (
    <div className="admin-content-inner">
      <button className="btn btn-sm btn-ghost" onClick={onBack} style={{ marginBottom: 14 }}>
        <Icons.ChevronLeft size={12} />All tenants
      </button>

      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 14,
            background: 'linear-gradient(135deg, var(--admin), var(--admin-ink))', color: '#fff',
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 500,
          }}>{t.name.slice(0, 1)}</div>
          <div>
            <span className="kicker">{t.flag} {t.country} · {t.plan} plan</span>
            <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em' }}>
              {t.name}
            </h1>
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-3)' }}>
              <span className="chip" style={{ background: s.bg, color: s.color, borderColor: 'transparent', fontSize: 11 }}>{s.label}</span>
              <span>Signed up <strong className="tnum" style={{ color: 'var(--ink-2)' }}>{t.signed}</strong></span>
              <span>· last activity <strong style={{ color: 'var(--ink-2)' }}>{t.lastActivity}</strong></span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setConfirmImp(true)} style={{
            borderColor: 'color-mix(in oklab, var(--rose) 30%, var(--rule))',
            color: 'var(--rose)',
          }}>
            <Icons.Eye size={13} />Log in as
          </button>
          <button className="btn btn-sm"><Icons.Send size={13} />Send message</button>
          <button className="btn btn-sm"><Icons.More size={13} /></button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--rule)' }}>
        {[
          ['overview','Overview'],
          ['branches', `Branches · ${t.branches}`],
          ['users',    `Users · ${t.users}`],
          ['billing',  'Billing'],
          ['activity', 'Activity'],
          ['notes',    'Internal notes'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            border: 0, background: 'transparent', padding: '10px 14px', fontSize: 13,
            color: tab === k ? 'var(--ink)' : 'var(--ink-3)',
            borderBottom: `2px solid ${tab === k ? 'var(--admin)' : 'transparent'}`,
            fontWeight: tab === k ? 500 : 400, marginBottom: -1, cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && <TenantOverview tenant={t} />}
      {tab === 'branches' && <PlaceholderTab text="Branch list filtered to this tenant — same shape as the tenant-side branch list." />}
      {tab === 'users'    && <PlaceholderTab text="Users with last-seen and role chips. Click to see audit log filtered to that user." />}
      {tab === 'billing'  && <TenantBilling tenant={t} />}
      {tab === 'activity' && <PlaceholderTab text="Audit log filtered to this tenant. Cross-tenant view available to Platform Owner role." />}
      {tab === 'notes'    && <TenantNotes />}

      {confirmImp && (
        <div className="vq-modal-bg" onClick={() => setConfirmImp(false)}>
          <div className="vq-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <header style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--rule)' }}>
              <span className="kicker" style={{ color: 'var(--rose)' }}>Sensitive action</span>
              <h2 className="serif" style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 500 }}>
                Log in as {t.name}?
              </h2>
            </header>
            <div style={{ padding: 20 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                You'll see Madar exactly as {t.name} sees it. Every action you take during this session is logged with your user ID as <code style={{ fontSize: 11.5 }}>impersonator_id</code> and visible to the tenant in their audit log.
              </p>
              <div className="kicker" style={{ marginBottom: 6 }}>Reason (required, audited)</div>
              <input className="madar-input" style={{ width: '100%' }} placeholder="e.g. Reproducing reported bug #1284" />
            </div>
            <footer style={{ padding: 16, borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn" onClick={() => setConfirmImp(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--rose)', borderColor: 'var(--rose)' }}
                      onClick={() => { onImpersonate(t); setConfirmImp(false); }}>
                <Icons.Eye size={12} />Start impersonation
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function TenantOverview({ tenant }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
        <KPIStat kicker="Lifetime revenue (their POS)" value={`£${(tenant.txCount * 92).toLocaleString()}`} note="across all branches" />
        <KPIStat kicker="Transactions all-time" value={tenant.txCount.toLocaleString()} note="POS tickets · cash + card + transfer" />
        <KPIStat kicker="Branches"   value={tenant.branches} note="of " plus={`${tenant.plan === 'Growth' ? 5 : tenant.plan === 'Scale' ? 15 : 1} max`} />
        <KPIStat kicker="Active users" value={tenant.users} note="last 30 days" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        <section className="card" style={{ padding: 22 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h2 className="serif" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>Plan utilization</h2>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>This billing cycle</span>
          </header>
          {[
            { label: 'Transactions',  used: 3420, max: 5000 },
            { label: 'Active users',  used: tenant.users, max: 12 },
            { label: 'Branches',      used: tenant.branches, max: 5 },
            { label: 'Storage',       used: 8.4, max: 20, unit: ' GB' },
          ].map(u => (
            <UsageBar key={u.label} {...u} />
          ))}
        </section>

        <section className="card" style={{ padding: 0 }}>
          <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)' }}>
            <h2 className="serif" style={{ margin: 0, fontSize: 17, fontWeight: 500 }}>Recent invoices</h2>
          </header>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {window.ADMIN_DATA.ADMIN_INVOICES.filter(i => i.tenantId === tenant.id).slice(0, 4).map((inv, i, arr) => (
              <li key={inv.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 18px',
                borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--rule)',
              }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500 }}>{inv.id}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Issued {inv.issued.slice(5)}</div>
                </div>
                <div className="serif tnum" style={{ fontSize: 16, fontWeight: 500 }}>{inv.symbol}{inv.amount.toLocaleString()}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

function KPIStat({ kicker, value, note, plus }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="kicker">{kicker}</div>
      <div className="serif tnum" style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{note}{plus && <strong className="tnum" style={{ color: 'var(--ink-2)' }}>{plus}</strong>}</div>
    </div>
  );
}

function UsageBar({ label, used, max, unit = '' }) {
  const pct = Math.min(100, (used / max) * 100);
  const warn = pct >= 90;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ color: 'var(--ink-2)' }}>{label}</span>
        <span className="tnum" style={{ color: 'var(--ink-3)' }}>
          <strong style={{ color: warn ? 'var(--amber)' : 'var(--ink)' }}>{used.toLocaleString()}{unit}</strong> / {max.toLocaleString()}{unit}
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--bg-sunk)', borderRadius: 100, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: warn ? 'var(--amber)' : 'var(--admin)', borderRadius: 100 }} />
      </div>
    </div>
  );
}

function TenantBilling({ tenant }) {
  const D = window.ADMIN_DATA;
  const invs = D.ADMIN_INVOICES.filter(i => i.tenantId === tenant.id);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
        <thead>
          <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
            {['Invoice', 'Issued', 'Due', 'Amount', 'Status'].map((h, i) => (
              <th key={h} style={{ textAlign: i === 3 ? 'end' : 'start', padding: '12px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invs.map((inv, i, arr) => (
            <tr key={inv.id} style={{ borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--rule)' }}>
              <td style={{ padding: '14px', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500 }}>{inv.id}</td>
              <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{inv.issued}</td>
              <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{inv.due}</td>
              <td style={{ padding: '14px', textAlign: 'end', fontWeight: 500 }}>{inv.symbol}{inv.amount.toLocaleString()}</td>
              <td style={{ padding: '14px' }}><InvStatusChip status={inv.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TenantNotes() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 18 }}>
      <div className="card" style={{ padding: 0 }}>
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)' }}>
          <span className="kicker">Internal notes · super-admins only</span>
        </header>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {[
            ['Layla H.', '2 days ago', 'Owner mentioned they\'re evaluating moving to Scale plan in June, ahead of opening 2 more branches. Pinged sales.'],
            ['Karim B.', '6 days ago', 'Always pays on time. Personal account once, otherwise from Bayt Coffee Co. LLC.'],
            ['Ziad A.',  '11 days ago','Helped them with bilingual receipt templates. Sent docs link.'],
          ].map(([who, when, text], i, arr) => (
            <li key={i} style={{
              padding: '14px 18px',
              borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--rule)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <strong style={{ fontSize: 13 }}>{who}</strong>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>· {when}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{text}</div>
            </li>
          ))}
        </ol>
        <footer style={{ padding: 14, borderTop: '1px solid var(--rule)' }}>
          <textarea rows={2} placeholder="Add a note. Visible only to super-admins." className="madar-input" style={{ width: '100%' }} />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm btn-primary">Save note</button>
          </div>
        </footer>
      </div>
      <aside className="card" style={{ padding: 18 }}>
        <div className="kicker" style={{ marginBottom: 8 }}>Visibility</div>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
          Notes are visible to all super-admins but never to the tenant. They show up in the audit log when created or edited.
        </p>
      </aside>
    </div>
  );
}

function PlaceholderTab({ text }) {
  return (
    <div className="card" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ink-3)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', marginBottom: 8 }}>[ placeholder ]</div>
      <p style={{ margin: 0, maxWidth: 460, marginInline: 'auto', fontSize: 13, lineHeight: 1.55 }}>{text}</p>
    </div>
  );
}

function InvStatusChip({ status }) {
  const map = {
    submitted: { label: 'In review',  color: 'var(--admin)', bg: 'var(--admin-soft)' },
    paid:      { label: 'Paid',       color: 'var(--sage)',  bg: 'var(--sage-soft)' },
    overdue:   { label: 'Overdue',    color: 'var(--rose)',  bg: 'var(--rose-soft)' },
    awaiting:  { label: 'Awaiting',   color: 'var(--amber)', bg: 'var(--amber-soft)' },
  };
  const s = map[status] || map.submitted;
  return <span className="chip" style={{ background: s.bg, color: s.color, borderColor: 'transparent', fontSize: 11 }}>{s.label}</span>;
}

// ─── A6. All Invoices ───────────────────────────────────────────────────
function InvoicesAdmin({ onOpenTenant }) {
  const D = window.ADMIN_DATA;
  const [filter, setFilter] = useStateS('all');
  const rows = D.ADMIN_INVOICES.filter(i => filter === 'all' || i.status === filter);

  return (
    <div className="admin-content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <span className="kicker">Across all tenants</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            All invoices
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            <strong className="tnum">{D.ADMIN_INVOICES.filter(i => i.status === 'submitted').length}</strong> awaiting review ·{' '}
            <strong className="tnum" style={{ color: 'var(--rose)' }}>{D.ADMIN_INVOICES.filter(i => i.status === 'overdue').length}</strong> overdue ·{' '}
            <strong className="tnum">£{D.ADMIN_INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0).toLocaleString()}</strong> collected this month
          </p>
        </div>
        <button className="btn btn-sm"><Icons.Download size={13} />Export</button>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[['all','All'],['submitted','In review'],['paid','Paid'],['overdue','Overdue']].map(([k,l]) => (
          <button key={k} className="chip" data-active={filter === k} onClick={() => setFilter(k)} style={{ cursor: 'pointer' }}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
          <thead>
            <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
              {['Invoice', 'Tenant', 'Amount', 'Currency', 'Issued', 'Due', 'Status', 'Days overdue'].map((h, i) => (
                <th key={h} style={{ textAlign: i === 2 ? 'end' : 'start', padding: '12px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((inv, i) => {
              const t = D.TENANTS.find(t => t.id === inv.tenantId);
              return (
                <tr key={inv.id} className="inv-row" style={{ borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--rule)', cursor: 'pointer' }}
                    onClick={() => onOpenTenant(inv.tenantId)}>
                  <td style={{ padding: '14px', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500 }}>{inv.id}</td>
                  <td style={{ padding: '14px', fontWeight: 500 }}>{t?.flag} {t?.name}</td>
                  <td style={{ padding: '14px', textAlign: 'end', fontWeight: 500 }}>{inv.symbol}{inv.amount.toLocaleString()}</td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{inv.currency}</td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{inv.issued}</td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{inv.due}</td>
                  <td style={{ padding: '14px' }}><InvStatusChip status={inv.status} /></td>
                  <td style={{ padding: '14px', color: inv.daysOverdue > 30 ? 'var(--rose)' : inv.daysOverdue > 0 ? 'var(--amber)' : 'var(--ink-4)' }}>
                    {inv.daysOverdue > 0 ? `+ ${inv.daysOverdue} d` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── A7. Platform Bank Accounts ─────────────────────────────────────────
function PlatformBanking() {
  const D = window.ADMIN_DATA;
  const [reveal, setReveal] = useStateS({});
  return (
    <div className="admin-content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <span className="kicker">Platform · receiving accounts</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Bank accounts
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            Where tenants send their subscription payments. One default per currency.
          </p>
        </div>
        <button className="btn btn-sm btn-primary"><Icons.Plus size={13} />Add account</button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
        {D.PLATFORM_BANKS.map(b => (
          <div key={b.id} className="card" style={{ padding: 20, opacity: b.active ? 1 : 0.55 }}>
            <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 24 }}>{b.flag}</div>
              <div style={{ flex: 1 }}>
                <h3 className="serif" style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: '-0.005em' }}>{b.bank}</h3>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{b.country} · {b.holder}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <span className="chip" style={{ background: 'var(--admin-soft)', color: 'var(--admin)', borderColor: 'transparent', fontSize: 11 }}>{b.currency}</span>
                {b.primary && <span style={{ fontSize: 10, color: 'var(--accent)' }}>● default for {b.currency}</span>}
              </div>
            </header>

            <div style={{ background: 'var(--bg-sunk)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="kicker">IBAN</div>
                <button className="btn btn-sm btn-ghost" style={{ padding: '2px 8px' }} onClick={() => setReveal(r => ({...r, [b.id]: !r[b.id]}))}>
                  <Icons.Eye size={11} />{reveal[b.id] ? 'Hide' : 'Reveal'}
                </button>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, marginTop: 4, letterSpacing: '0.02em' }}>
                {reveal[b.id] ? b.iban : b.iban.replace(/\d/g, '•').replace(/•+$/, b.iban.slice(-4))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                <div>
                  <div className="kicker">SWIFT</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, marginTop: 2 }}>{b.swift}</div>
                </div>
                <div>
                  <div className="kicker">This month</div>
                  <div className="tnum" style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>
                    {b.txns} <span style={{ color: 'var(--ink-3)', fontWeight: 400, fontSize: 11 }}>· {b.currency} {b.monthIn.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm">Edit</button>
              {b.active
                ? <button className="btn btn-sm btn-ghost" style={{ color: 'var(--rose)' }}>Disable</button>
                : <button className="btn btn-sm">Re-enable</button>}
              {!b.primary && b.active && <button className="btn btn-sm btn-ghost">Make default</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── A8. Super-Admin Team ───────────────────────────────────────────────
function SuperAdminTeam() {
  const D = window.ADMIN_DATA;
  const [tab, setTab] = useStateS('members');
  return (
    <div className="admin-content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <span className="kicker">Super-admins · {D.ADMIN_TEAM.length} members</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Team & roles
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            All super-admins are required to have MFA enabled within 7 days of joining.
          </p>
        </div>
        <button className="btn btn-sm btn-primary"><Icons.Plus size={13} />Invite member</button>
      </header>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--rule)' }}>
        {[['members', `Members · ${D.ADMIN_TEAM.length}`], ['roles', `Roles · ${D.ADMIN_ROLES.length}`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            border: 0, background: 'transparent', padding: '10px 14px', fontSize: 13,
            color: tab === k ? 'var(--ink)' : 'var(--ink-3)',
            borderBottom: `2px solid ${tab === k ? 'var(--admin)' : 'transparent'}`,
            fontWeight: tab === k ? 500 : 400, marginBottom: -1, cursor: 'pointer',
          }}>{l}</button>
        ))}
      </div>

      {tab === 'members' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
                {['', 'Member', 'Email', 'Role', 'MFA', 'Last login', 'Status', ''].map((h, i) => (
                  <th key={h + i} style={{ textAlign: 'start', padding: '12px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {D.ADMIN_TEAM.map((u, i) => (
                <tr key={u.id} className="inv-row" style={{ borderBottom: i === D.ADMIN_TEAM.length - 1 ? 'none' : '1px solid var(--rule)' }}>
                  <td style={{ padding: '14px' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 50, background: 'var(--admin)', color: '#fff', display: 'grid', placeItems: 'center', fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 500 }}>{u.avatar}</div>
                  </td>
                  <td style={{ padding: '14px', fontWeight: 500 }}>{u.name}</td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{u.email}</td>
                  <td style={{ padding: '14px' }}>
                    <span className="chip" style={{ background: u.role === 'Platform Owner' ? 'var(--rose-soft)' : 'var(--admin-soft)', color: u.role === 'Platform Owner' ? 'var(--rose)' : 'var(--admin)', borderColor: 'transparent', fontSize: 11 }}>{u.role}</span>
                  </td>
                  <td style={{ padding: '14px' }}>
                    {u.mfa
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--sage)' }}><span style={{ width: 7, height: 7, borderRadius: 50, background: 'var(--sage)' }} />Enabled</span>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--rose)' }}><span style={{ width: 7, height: 7, borderRadius: 50, background: 'var(--rose)' }} />Required</span>}
                  </td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)', fontSize: 12 }}>{u.lastLogin}</td>
                  <td style={{ padding: '14px' }}>
                    <span className="chip" style={{ background: u.status === 'active' ? 'var(--sage-soft)' : 'var(--amber-soft)', color: u.status === 'active' ? 'var(--sage)' : 'var(--amber)', borderColor: 'transparent', fontSize: 11, textTransform: 'capitalize' }}>{u.status}</span>
                  </td>
                  <td style={{ padding: '14px', textAlign: 'end' }}>
                    <button className="tb-icon-btn"><Icons.More size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'roles' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {D.ADMIN_ROLES.map(r => (
            <div key={r.id} className="card" style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 200px auto', gap: 18, alignItems: 'center' }}>
              <div>
                <h3 className="serif" style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{r.name}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>{r.description}</p>
              </div>
              <div>
                <div className="kicker" style={{ marginBottom: 2 }}>Permissions</div>
                <div style={{ fontSize: 12 }}>{r.perms}</div>
              </div>
              <div style={{ textAlign: 'end' }}>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 500 }}>{r.members}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>members</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── A9. Login-as Audit ─────────────────────────────────────────────────
function LoginAsAudit({ onOpenTenant }) {
  const D = window.ADMIN_DATA;
  const [open, setOpen] = useStateS(null);
  return (
    <div className="admin-content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <span className="kicker">Audit · impersonation sessions</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Login-as audit log
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            Every time a super-admin signed in as a tenant. Append-only.
          </p>
        </div>
      </header>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
              {['Timestamp', 'Super-admin', 'Tenant', 'Duration', 'Actions', 'IP', 'Device', 'Reason'].map((h, i) => (
                <th key={h} style={{ textAlign: 'start', padding: '12px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {D.LOGIN_AS_AUDIT.map((e, i) => (
              <React.Fragment key={e.id}>
                <tr className="inv-row" onClick={() => setOpen(o => o === e.id ? null : e.id)}
                    style={{ borderBottom: '1px solid var(--rule)', cursor: 'pointer' }}>
                  <td style={{ padding: '14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>{e.ts}</td>
                  <td style={{ padding: '14px', fontWeight: 500 }}>{e.admin}</td>
                  <td style={{ padding: '14px' }}>
                    <button onClick={(ev) => { ev.stopPropagation(); onOpenTenant(e.tenantId); }} style={{ background: 'none', border: 0, color: 'var(--admin)', fontSize: 13, padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {e.tenant} →
                    </button>
                  </td>
                  <td style={{ padding: '14px' }} className="tnum">{e.duration}</td>
                  <td style={{ padding: '14px' }} className="tnum">{e.actions}</td>
                  <td style={{ padding: '14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>{e.ip}</td>
                  <td style={{ padding: '14px', fontSize: 11.5, color: 'var(--ink-3)' }}>{e.ua}</td>
                  <td style={{ padding: '14px', fontSize: 12.5, color: 'var(--ink-2)' }}>{e.reason}</td>
                </tr>
                {open === e.id && (
                  <tr>
                    <td colSpan={8} style={{ padding: 0, background: 'var(--bg-sunk)' }}>
                      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--rule)' }}>
                        <div className="kicker" style={{ marginBottom: 8 }}>Actions taken during this session</div>
                        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {[
                            ['Opened POS sell screen', '+ 0:01'],
                            ['Searched products: "yirgacheffe"', '+ 0:14'],
                            ['Opened sale TX-94821', '+ 0:42'],
                            ['Viewed payment verification queue', '+ 2:08'],
                            ['Updated branch hours for Maadi', '+ 5:30'],
                            ['Ended impersonation', `+ ${e.duration}`],
                          ].slice(0, Math.min(6, e.actions + 1)).map(([t, ts], i) => (
                            <li key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 12, padding: '4px 0', fontSize: 12.5 }}>
                              <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-3)' }}>{ts}</span>
                              <span>{t}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── A10. Platform Audit Log ────────────────────────────────────────────
function PlatformAudit() {
  const D = window.ADMIN_DATA;
  return (
    <div className="admin-content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <span className="kicker">Audit · all platform actions</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Platform audit log
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            Append-only record of everything super-admins do.
          </p>
        </div>
        <button className="btn btn-sm"><Icons.Download size={13} />Export full log</button>
      </header>

      <div style={{ padding: '12px 14px', background: 'var(--amber-soft)', color: 'var(--amber)', borderRadius: 8, fontSize: 12.5, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icons.Sparkles size={14} />
        This log is append-only. Entries cannot be edited or deleted. Retention: 7 years.
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
              {['Timestamp', 'Super-admin', 'Action', 'Target', 'IP'].map((h) => (
                <th key={h} style={{ textAlign: 'start', padding: '12px 14px', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {D.PLATFORM_AUDIT.map((e, i) => (
              <tr key={i} style={{ borderBottom: i === D.PLATFORM_AUDIT.length - 1 ? 'none' : '1px solid var(--rule)' }}>
                <td style={{ padding: '14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>{e.ts}</td>
                <td style={{ padding: '14px', fontWeight: 500 }}>{e.admin}</td>
                <td style={{ padding: '14px' }}>
                  <code style={{ fontFamily: 'var(--mono)', fontSize: 11.5, background: 'var(--bg-sunk)', padding: '2px 6px', borderRadius: 4, color: 'var(--ink-2)' }}>
                    {e.action}
                  </code>
                </td>
                <td style={{ padding: '14px', fontSize: 13 }}>{e.target}</td>
                <td style={{ padding: '14px', fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>{e.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

window.AdminHome = AdminHome;
window.TenantList = TenantList;
window.TenantDetail = TenantDetail;
window.InvoicesAdmin = InvoicesAdmin;
window.PlatformBanking = PlatformBanking;
window.SuperAdminTeam = SuperAdminTeam;
window.LoginAsAudit = LoginAsAudit;
window.PlatformAudit = PlatformAudit;
