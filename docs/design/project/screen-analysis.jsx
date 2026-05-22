// Madar — Income & analysis screen.
// Reads like a magazine article: headline → key chart → AI commentary → tables.

const { useState: useStateAn } = React;

function Analysis({ lang, onAIToggle }) {
  const D = window.MADAR_DATA;
  const [period, setPeriod] = useStateAn('week');

  return (
    <div className="content-inner" style={{ maxWidth: 1100 }}>
      {/* Article header */}
      <header style={{ marginBottom: 28, borderBottom: '1px solid var(--rule)', paddingBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="kicker">Income & analysis · weekly review</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['day','Today'],['week','This week'],['month','This month'],['quarter','Quarter'],['year','Year']].map(([k, l]) => (
              <button key={k} className="chip" data-active={period === k} onClick={() => setPeriod(k)} style={{ cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
        </div>
        <h1 className="serif" style={{
          margin: 0, fontSize: 'clamp(28px, 3.2vw, 42px)', fontWeight: 400,
          lineHeight: 1.15, letterSpacing: '-0.02em', textWrap: 'balance', maxWidth: '20ch'
        }}>
          Profit grew faster than revenue — the mix is doing the work.
        </h1>
        <p style={{ marginTop: 14, fontSize: 15, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: '60ch', textWrap: 'pretty' }}>
          Revenue rose <strong className="serif">8.4%</strong> across the chain to <strong className="serif">£181,300</strong>.
          Gross profit rose <strong className="serif">11.2%</strong>. The lift is driven by higher pour-over and pastry attach,
          not by raising prices. Below: the chart, the why, and the numbers.
        </p>
      </header>

      {/* Hero figure */}
      <figure style={{ margin: '0 0 32px' }}>
        <div className="card" style={{ padding: 24 }}>
          <ProfitChart />
        </div>
        <figcaption style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8, fontStyle: 'italic', textAlign: 'center' }}>
          Fig. 1 · Revenue and gross profit, last 12 weeks. Margin widening since week 8.
        </figcaption>
      </figure>

      {/* AI commentary */}
      <section style={{
        background: 'color-mix(in oklab, var(--accent-soft) 30%, var(--bg-elev))',
        border: '1px solid color-mix(in oklab, var(--accent) 22%, var(--rule))',
        borderRadius: 14, padding: '22px 26px', marginBottom: 32,
        position: 'relative'
      }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <Icons.Sparkles size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div className="kicker" style={{ color: 'var(--accent)', marginBottom: 6 }}>Why this happened</div>
            <p className="serif" style={{ margin: 0, fontSize: 18, lineHeight: 1.55, fontWeight: 400, letterSpacing: '-0.005em', textWrap: 'pretty' }}>
              Margin widened because the weekend product mix shifted. Pour-over share rose from <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>11% → 16%</em> of espresso-equivalent units, and the croissant pairing experiment lifted basket size at Maadi. Two soft spots: Zamalek evenings (down 31% weekday 6–9 PM) and Affogato refunds at Zamalek (4.1% vs 1.8% chain average).
            </p>
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <button className="btn btn-sm" onClick={onAIToggle}>Ask follow-up</button>
              <button className="btn btn-sm btn-ghost">Show calculations</button>
            </div>
          </div>
        </div>
      </section>

      {/* Two-column data tables */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
        <BestWorstTable kind="best" />
        <BestWorstTable kind="worst" />
      </section>

      {/* Branch P&L */}
      <section style={{ marginBottom: 32 }}>
        <div className="hr-label"><h2>Branch P&L · this week</h2></div>
        <BranchPLTable />
      </section>

      {/* Cashier performance */}
      <section style={{ marginBottom: 32 }}>
        <div className="hr-label"><h2>Cashier performance</h2></div>
        <CashierTable />
      </section>

      {/* Reports list */}
      <section style={{ marginBottom: 32 }}>
        <div className="hr-label"><h2>Standard reports</h2></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { title: 'Profit & Loss', sub: 'Configurable period · PDF / Excel', icon: Icons.Receipt },
            { title: 'Cash flow summary', sub: 'In / out / runway · weekly', icon: Icons.Cash },
            { title: 'Tax report', sub: 'VAT 14% · per branch', icon: Icons.Bank },
            { title: 'Cost of goods sold', sub: 'COGS by product, by branch', icon: Icons.Box },
            { title: 'Inventory valuation', sub: 'Weighted average · live', icon: Icons.Hash },
            { title: 'Reconciliation', sub: 'Bank receipts vs statement', icon: Icons.Check },
          ].map(r => (
            <button key={r.title} className="card" style={{
              padding: 16, textAlign: 'start', cursor: 'pointer',
              display: 'flex', alignItems: 'flex-start', gap: 12
            }}>
              <r.icon size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div className="serif" style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{r.title}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{r.sub}</div>
              </div>
              <Icons.ArrowRight size={14} style={{ color: 'var(--ink-3)' }} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProfitChart() {
  const w = 900, h = 280, pad = 36;
  const weeks = 12;
  const rev = [];
  const prof = [];
  for (let i = 0; i < weeks; i++) {
    rev.push(140 + i * 4 + Math.sin(i * 0.7) * 8);
    prof.push(82 + i * 3.4 + Math.cos(i * 0.6) * 4);
  }
  const min = 60, max = 200;
  const stepX = (w - pad * 2) / (weeks - 1);
  const yFor = v => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const pathFor = arr => arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${pad + i * stepX},${yFor(v)}`).join(' ');

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div className="kicker">Revenue · gross profit</div>
          <div className="serif tnum" style={{ fontSize: 28, fontWeight: 500, marginTop: 4, letterSpacing: '-0.01em' }}>
            <span style={{ fontSize: '0.6em', color: 'var(--ink-3)', marginInlineEnd: 4 }}>£</span>181,300
            <span className="delta up" style={{ marginInlineStart: 12, fontSize: 14 }}>
              <Icons.ArrowUp />8.4%
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 2, background: 'var(--accent)' }} /> Revenue
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 12, height: 2, background: 'var(--sage)', borderTop: '1px dashed var(--sage)' }} /> Gross profit
          </span>
        </div>
      </header>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {[0, 0.25, 0.5, 0.75, 1].map(g => (
          <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)}
                stroke="var(--rule)" strokeDasharray="2 4" strokeWidth="1" />
        ))}
        <path d={pathFor(rev)} stroke="var(--accent)" strokeWidth="2" fill="none" />
        <path d={pathFor(prof)} stroke="var(--sage)" strokeWidth="1.6" strokeDasharray="4 4" fill="none" />
        {rev.map((_, i) => (
          <text key={i} x={pad + i * stepX} y={h - 8} textAnchor="middle" fontSize="10" fill="var(--ink-3)">
            W{i + 1}
          </text>
        ))}
      </svg>
    </>
  );
}

function BestWorstTable({ kind }) {
  const D = window.MADAR_DATA;
  const sorted = [...D.PRODUCTS].sort((a, b) => kind === 'best' ? b.vel - a.vel : a.vel - b.vel).slice(0, 5);
  return (
    <div>
      <div className="kicker" style={{ color: kind === 'best' ? 'var(--sage)' : 'var(--rose)', marginBottom: 6 }}>
        {kind === 'best' ? 'Top sellers · this week' : 'Slow movers · this week'}
      </div>
      <h3 className="serif" style={{ margin: '0 0 12px', fontSize: 19, fontWeight: 500 }}>
        {kind === 'best' ? 'Carrying their weight' : 'Worth a second look'}
      </h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--rule)' }}>
              <td style={{ padding: '10px 0', width: 24, color: 'var(--ink-3)' }}>{i + 1}</td>
              <td style={{ padding: '10px 0', fontWeight: 500 }}>{p.name}</td>
              <td style={{ padding: '10px 0', textAlign: 'end', color: 'var(--ink-3)' }}>£{p.price}</td>
              <td style={{ padding: '10px 0', textAlign: 'end', width: 60,
                            color: kind === 'best' ? 'var(--sage)' : 'var(--rose)' }}>
                {p.vel}/wk
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BranchPLTable() {
  const D = window.MADAR_DATA;
  return (
    <div className="card" style={{ padding: 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
        <thead>
          <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
            {['Branch','Revenue','COGS','Gross profit','Margin','Δ wk'].map((h, i) => (
              <th key={h} style={{ textAlign: i === 0 ? 'start' : 'end', padding: '12px 16px',
                                    fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em',
                                    textTransform: 'uppercase', color: 'var(--ink-3)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {D.BRANCHES.map(b => {
            const cogs = Math.round(b.weekRev * 0.36);
            const gp = b.weekRev - cogs;
            const margin = ((gp / b.weekRev) * 100).toFixed(1);
            return (
              <tr key={b.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td style={{ padding: '14px 16px', fontWeight: 500 }}>{b.name}</td>
                <td style={{ padding: '14px 16px', textAlign: 'end' }}>£{b.weekRev.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', textAlign: 'end', color: 'var(--ink-3)' }}>£{cogs.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', textAlign: 'end', fontWeight: 500 }}>£{gp.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', textAlign: 'end', color: 'var(--sage)' }}>{margin}%</td>
                <td style={{ padding: '14px 16px', textAlign: 'end',
                              color: b.deltaWk >= 0 ? 'var(--sage)' : 'var(--rose)' }}>
                  {b.deltaWk >= 0 ? '+' : ''}{b.deltaWk.toFixed(1)}%
                </td>
              </tr>
            );
          })}
          <tr style={{ background: 'var(--paper)' }}>
            <td style={{ padding: '14px 16px', fontWeight: 600 }}>Chain total</td>
            <td style={{ padding: '14px 16px', textAlign: 'end', fontWeight: 600 }}>£181,300</td>
            <td style={{ padding: '14px 16px', textAlign: 'end', color: 'var(--ink-3)' }}>£65,200</td>
            <td style={{ padding: '14px 16px', textAlign: 'end', fontWeight: 600 }}>£116,100</td>
            <td style={{ padding: '14px 16px', textAlign: 'end', color: 'var(--sage)', fontWeight: 600 }}>64.0%</td>
            <td style={{ padding: '14px 16px', textAlign: 'end', color: 'var(--sage)', fontWeight: 600 }}>+8.4%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CashierTable() {
  const D = window.MADAR_DATA;
  const branchName = id => D.BRANCHES.find(b => b.id === id)?.name;
  return (
    <div className="card" style={{ padding: 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
        <thead>
          <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
            {['Cashier','Branch','Avg checkout','Avg basket','Upsell','Refund'].map((h, i) => (
              <th key={h} style={{ textAlign: i < 2 ? 'start' : 'end', padding: '12px 16px',
                                    fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em',
                                    textTransform: 'uppercase', color: 'var(--ink-3)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {D.STAFF.map(s => (
            <tr key={s.name} style={{ borderBottom: '1px solid var(--rule)' }}>
              <td style={{ padding: '14px 16px', fontWeight: 500 }}>
                {s.name} {s.name.startsWith('Hala') && <span className="chip" style={{ marginInlineStart: 6, padding: '1px 6px', fontSize: 10, background: 'var(--sage-soft)', color: 'var(--sage)', borderColor: 'transparent' }}>Top</span>}
              </td>
              <td style={{ padding: '14px 16px', color: 'var(--ink-3)' }}>{branchName(s.branch)}</td>
              <td style={{ padding: '14px 16px', textAlign: 'end' }}>{s.avgTicket}s</td>
              <td style={{ padding: '14px 16px', textAlign: 'end' }}>£{s.basket}</td>
              <td style={{ padding: '14px 16px', textAlign: 'end',
                            color: s.upsell >= 25 ? 'var(--sage)' : 'var(--ink-2)' }}>{s.upsell}%</td>
              <td style={{ padding: '14px 16px', textAlign: 'end',
                            color: s.refund >= 3 ? 'var(--rose)' : 'var(--ink-3)' }}>{s.refund}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

window.Analysis = Analysis;
