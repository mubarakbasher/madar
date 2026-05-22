// Madar — Suppliers (card grid) + Branches (map-led) + Income/analysis screens.

const { useState: useStateSb } = React;

// ───────────────────────────────────────────────────────────────────────
// SUPPLIERS
// ───────────────────────────────────────────────────────────────────────
function Suppliers({ lang, onAIToggle }) {
  const D = window.MADAR_DATA;
  const [open, setOpen] = useStateSb(null);

  return (
    <div className="content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <span className="kicker">Suppliers</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Your supply network
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            <strong>{D.SUPPLIERS.length}</strong> active partners ·
            <strong> £{D.SUPPLIERS.reduce((s,x)=>s+x.owed,0).toLocaleString()}</strong> owed ·
            <strong> 12</strong> open POs
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm"><Icons.Receipt size={13} />New PO</button>
          <button className="btn btn-sm btn-primary"><Icons.Plus size={13} />Add supplier</button>
        </div>
      </header>

      <div className="card" style={{ marginBottom: 18, padding: '14px 18px',
        background: 'color-mix(in oklab, var(--rose-soft) 30%, var(--bg-elev))',
        borderColor: 'color-mix(in oklab, var(--rose) 30%, var(--rule))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icons.Sparkles size={16} style={{ color: 'var(--rose)', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
            <strong>Atlas Packaging</strong> reliability dropped from 88% → 74% in Q2. Defect rate doubled. Lead time grew 4 days. Madar found 3 alternates.
          </div>
          <button className="btn btn-sm">Review supplier</button>
          <button className="btn btn-sm btn-primary">See alternates</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {D.SUPPLIERS.map(s => (
          <SupplierCard key={s.id} s={s} onClick={() => setOpen(s)} />
        ))}
      </div>

      {open && <SupplierProfile s={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function SupplierCard({ s, onClick }) {
  const trendColor = s.trend === 'up' ? 'var(--sage)' : s.trend === 'down' ? 'var(--rose)' : 'var(--ink-3)';
  return (
    <button onClick={onClick} className="card" style={{
      textAlign: 'start', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14,
      padding: 20, transition: 'border-color .12s, transform .12s', alignItems: 'stretch'
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--rule)'; }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 className="serif" style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
            {s.name}
          </h3>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
            {s.ctry} · {s.items} SKU{s.items > 1 ? 's' : ''} · {s.leadDays}d lead
          </div>
        </div>
        <ReliabilityDial value={s.reliability} />
      </header>

      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, textWrap: 'pretty', minHeight: 36 }}>
        {s.note}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
                    paddingTop: 12, borderTop: '1px solid var(--rule)' }}>
        <div>
          <div className="kicker" style={{ fontSize: 9.5 }}>Last order</div>
          <div className="tnum" style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{s.lastOrder.slice(5)}</div>
        </div>
        <div>
          <div className="kicker" style={{ fontSize: 9.5 }}>Owed</div>
          <div className="serif tnum" style={{ fontSize: 17, fontWeight: 500, marginTop: 0, color: s.owed > 10000 ? 'var(--rose)' : 'var(--ink)' }}>
            £{s.owed.toLocaleString()}
          </div>
        </div>
      </div>

      <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: trendColor }}>
        <span>{s.trend === 'up' ? '↗ Quality trending up' : s.trend === 'down' ? '↘ Quality slipping' : '→ Steady performance'}</span>
        <span style={{ color: 'var(--ink-3)' }}>Open profile →</span>
      </footer>
    </button>
  );
}

function ReliabilityDial({ value }) {
  const r = 18, c = 2 * Math.PI * r;
  const fill = (value / 100) * c;
  const color = value >= 90 ? 'var(--sage)' : value >= 80 ? 'var(--amber)' : 'var(--rose)';
  return (
    <div style={{ position: 'relative', width: 50, height: 50, flexShrink: 0 }}>
      <svg width="50" height="50" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r={r} fill="none" stroke="var(--rule)" strokeWidth="3" />
        <circle cx="25" cy="25" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${fill} ${c}`} transform="rotate(-90 25 25)" />
      </svg>
      <div className="serif tnum" style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        fontSize: 14, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.02em'
      }}>{value}</div>
    </div>
  );
}

function SupplierProfile({ s, onClose }) {
  const orders = [
    { date: '2026-04-22', amount: 18400, status: 'Pending payment', items: 'Yirgacheffe ×80, Sidamo ×60' },
    { date: '2026-03-28', amount: 22100, status: 'Paid', items: 'Yirgacheffe ×100, Geisha ×12' },
    { date: '2026-03-04', amount: 19800, status: 'Paid', items: 'Sidamo ×80, Yirgacheffe ×60' },
    { date: '2026-02-09', amount: 16200, status: 'Paid', items: 'Yirgacheffe ×60, Kenya AA ×20' },
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.45)', zIndex: 50,
                  display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 540, maxWidth: '100vw', height: '100%',
        background: 'var(--bg-elev)', borderInlineStart: '1px solid var(--rule)',
        boxShadow: 'var(--shadow-lg)', overflow: 'auto',
        animation: 'slideInEnd .25s ease-out'
      }}>
        <header style={{ padding: '20px 24px', borderBottom: '1px solid var(--rule)',
                         display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <span className="kicker">{s.ctry} · {s.items} SKUs · {s.leadDays}d lead</span>
            <h2 className="serif" style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}>
              {s.name}
            </h2>
          </div>
          <ReliabilityDial value={s.reliability} />
          <button className="tb-icon-btn" onClick={onClose}><Icons.X size={14} /></button>
        </header>

        <section style={{ padding: '20px 24px', borderBottom: '1px solid var(--rule)' }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Madar's read</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink)', textWrap: 'pretty' }}>
            {s.note} On-time delivery <strong>{s.reliability}%</strong>. Average lead time <strong>{s.leadDays} days</strong>.
            {s.trend === 'down' ? ' Quality slipping in the last 3 shipments — investigate.' :
             s.trend === 'up' ? ' Performance trending up over the last quarter.' :
             ' Steady. No flags.'}
          </p>
        </section>

        <section style={{ padding: '20px 24px', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="kicker">Order history</span>
            <button className="card-link">Export →</button>
          </div>
          {orders.map((o, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 12,
                                   padding: '12px 0', borderBottom: i === orders.length - 1 ? 0 : '1px solid var(--rule)' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }} className="tnum">{o.date.slice(5)}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{o.items}</div>
                <div style={{ fontSize: 11, color: o.status === 'Paid' ? 'var(--sage)' : 'var(--amber)' }}>{o.status}</div>
              </div>
              <div className="serif tnum" style={{ fontSize: 17, fontWeight: 500 }}>£{o.amount.toLocaleString()}</div>
            </div>
          ))}
        </section>

        <section style={{ padding: '20px 24px', display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Create new PO</button>
          <button className="btn">Settle owed · £{s.owed.toLocaleString()}</button>
        </section>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// BRANCHES (map-led)
// ───────────────────────────────────────────────────────────────────────
function Branches({ lang }) {
  const D = window.MADAR_DATA;
  const [active, setActive] = useStateSb(D.BRANCHES[0].id);
  const branch = D.BRANCHES.find(b => b.id === active);

  return (
    <div className="content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <span className="kicker">Branches · live</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            All five locations, in one place
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm"><Icons.Download size={13} />Daily report</button>
          <button className="btn btn-sm btn-primary"><Icons.Plus size={13} />New branch</button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, marginBottom: 16 }}>
        {/* Map */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative', minHeight: 460 }}>
          <CairoMap branches={D.BRANCHES} active={active} onSelect={setActive} />
          <div style={{ position: 'absolute', top: 14, insetInlineStart: 14, display: 'flex', flexDirection: 'column', gap: 6,
                        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
                        padding: 10, borderRadius: 10, fontSize: 11, color: 'var(--ink-2)', maxWidth: 220 }}>
            <strong className="serif" style={{ fontSize: 14 }}>Cairo</strong>
            <div>Bayt Coffee Co. operates 5 branches across Greater Cairo. Tap a pin for details.</div>
          </div>
          <div style={{ position: 'absolute', top: 14, insetInlineEnd: 14, display: 'flex', gap: 4 }}>
            <button className="btn btn-sm" style={{ padding: '4px 10px' }}>Live</button>
            <button className="btn btn-sm btn-ghost" style={{ padding: '4px 10px' }}>Today</button>
            <button className="btn btn-sm btn-ghost" style={{ padding: '4px 10px' }}>Week</button>
          </div>
        </div>

        {/* Active branch dossier */}
        <BranchDossier branch={branch} />
      </div>

      {/* Comparison table */}
      <BranchCompareTable branches={D.BRANCHES} active={active} onSelect={setActive} />
    </div>
  );
}

function CairoMap({ branches, active, onSelect }) {
  return (
    <div style={{ position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, #F0EAD9 0%, #E8DFC8 100%)',
      backgroundImage: `
        radial-gradient(ellipse 200px 80px at 35% 50%, rgba(60,90,140,0.18), transparent),
        radial-gradient(ellipse 100px 50px at 65% 65%, rgba(60,90,140,0.12), transparent)`
    }}>
      {/* Nile suggestion */}
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
           style={{ position: 'absolute', inset: 0, opacity: 0.55 }}>
        <path d="M30 100 C 35 70, 32 40, 36 0" stroke="#3A6FAF" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M40 100 C 45 70, 42 40, 46 0" stroke="#3A6FAF" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.4" />
        {/* roads */}
        {[
          'M0 30 L100 35','M0 60 L100 55','M0 80 L100 78',
          'M20 0 L25 100','M50 0 L55 100','M70 0 L75 100','M90 0 L92 100'
        ].map((d, i) => (
          <path key={i} d={d} stroke="rgba(0,0,0,0.06)" strokeWidth="0.4" fill="none" />
        ))}
      </svg>
      {/* district labels */}
      <div style={{ position: 'absolute', top: '18%', insetInlineEnd: '12%', fontSize: 10, color: 'var(--ink-4)',
                    letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500 }}>Heliopolis</div>
      <div style={{ position: 'absolute', top: '32%', insetInlineStart: '25%', fontSize: 10, color: 'var(--ink-4)',
                    letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500 }}>Zamalek</div>
      <div style={{ position: 'absolute', top: '50%', insetInlineEnd: '24%', fontSize: 10, color: 'var(--ink-4)',
                    letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500 }}>Maadi</div>
      <div style={{ position: 'absolute', top: '12%', insetInlineEnd: '14%', fontSize: 10, color: 'var(--ink-4)',
                    letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 500, opacity: 0 }}>—</div>

      {branches.map(b => (
        <UI.BranchPin key={b.id} branch={b} active={active === b.id} onClick={() => onSelect(b.id)} />
      ))}
    </div>
  );
}

function BranchDossier({ branch }) {
  return (
    <div className="card">
      <header style={{ marginBottom: 14 }}>
        <span className="kicker">Branch · live</span>
        <h2 className="serif" style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 500, letterSpacing: '-0.01em' }}>
          {branch.name} <span style={{ color: 'var(--ink-3)', fontSize: '0.75em' }}>{branch.name_ar}</span>
        </h2>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
          Opened {branch.opened} · {branch.staff} staff · status <span style={{ color: 'var(--sage)' }}>● {branch.status}</span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Stat label="Today" value={`£${(branch.today/1000).toFixed(1)}k`} />
        <Stat label="Week" value={`£${(branch.weekRev/1000).toFixed(1)}k`}
              delta={branch.deltaWk} />
        <Stat label="Peak hour" value={branch.peakHr} />
        <Stat label="Top product" value={branch.topProduct} small />
      </div>

      <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 14, marginBottom: 14 }}>
        <div className="kicker" style={{ marginBottom: 6 }}>Madar's note</div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)', textWrap: 'pretty' }}>
          {branch.deltaWk > 10 ?
            `${branch.name} is your fastest-growing location. Consider adding evening staff coverage — peak hour ${branch.peakHr} is straining the queue.` :
            branch.deltaWk < 0 ?
            `${branch.name} is soft this week. Evening foot traffic the likely cause. Worth comparing against ${branch.name === 'Zamalek' ? 'a possible new competitor on Korba' : 'local events'}.` :
            `${branch.name} is performing in line with expectations. ${branch.topProduct} continues to be the anchor product.`}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }}>Open ledger</button>
        <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center' }}>Staff schedule</button>
      </div>
    </div>
  );
}

function Stat({ label, value, delta, small = false }) {
  return (
    <div>
      <div className="kicker" style={{ fontSize: 9.5 }}>{label}</div>
      <div className="serif tnum" style={{ fontSize: small ? 14 : 22, fontWeight: 500, marginTop: 2, letterSpacing: '-0.01em' }}>
        {value}
      </div>
      {typeof delta === 'number' && (
        <div className={`delta ${delta >= 0 ? 'up' : 'dn'}`} style={{ fontSize: 11 }}>
          {delta >= 0 ? <Icons.ArrowUp /> : <Icons.ArrowDown />}{Math.abs(delta).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function BranchCompareTable({ branches, active, onSelect }) {
  return (
    <div className="card">
      <header className="card-h">
        <div>
          <span className="kicker">All branches</span>
          <div className="card-title">Comparison</div>
        </div>
      </header>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
        <thead>
          <tr style={{ color: 'var(--ink-3)' }}>
            {['Branch','Today','Week','Δ wk','Staff','Peak','Top product'].map(h => (
              <th key={h} style={{ textAlign: 'start', fontWeight: 500, fontSize: 10.5,
                                    letterSpacing: '0.12em', textTransform: 'uppercase',
                                    padding: '10px 8px', borderBottom: '1px solid var(--rule)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {branches.map(b => (
            <tr key={b.id} onClick={() => onSelect(b.id)}
                style={{ cursor: 'pointer', borderBottom: '1px solid var(--rule)',
                         background: active === b.id ? 'color-mix(in oklab, var(--accent-soft) 30%, var(--bg-elev))' : 'transparent' }}>
              <td style={{ padding: '12px 8px', fontWeight: 500 }}>{b.name}</td>
              <td style={{ padding: '12px 8px' }}>£{b.today.toLocaleString()}</td>
              <td style={{ padding: '12px 8px' }}>£{b.weekRev.toLocaleString()}</td>
              <td style={{ padding: '12px 8px', color: b.deltaWk >= 0 ? 'var(--sage)' : 'var(--rose)' }}>
                {b.deltaWk >= 0 ? '+' : ''}{b.deltaWk.toFixed(1)}%
              </td>
              <td style={{ padding: '12px 8px', color: 'var(--ink-3)' }}>{b.staff}</td>
              <td style={{ padding: '12px 8px', color: 'var(--ink-3)' }}>{b.peakHr}</td>
              <td style={{ padding: '12px 8px' }}>{b.topProduct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

window.Suppliers = Suppliers;
window.Branches = Branches;
