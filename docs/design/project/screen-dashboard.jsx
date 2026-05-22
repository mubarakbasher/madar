// Madar — Dashboard screen.
// 3 layout variants via tweak `dashLayout`: 'editorial' | 'kpi' | 'newspaper'

const { useState: useStateD } = React;

function Dashboard({ branch, lang, dashLayout = 'editorial', onAIToggle, onNav }) {
  const D = window.MADAR_DATA;
  const branchObj = branch === 'all' ? null : D.BRANCHES.find(b => b.id === branch);
  const series = D.REVENUE_30D[branch] || D.REVENUE_30D.total;
  const total = series.reduce((a, b) => a + b, 0);

  // Headline
  const headline = lang === 'ar'
    ? <>الإيرادات هذا الأسبوع <em className="serif" style={{ color: 'var(--sage)', fontStyle: 'normal' }}>+12%</em> في المعادي، <em className="serif" style={{ color: 'var(--rose)', fontStyle: 'normal' }}>−4%</em> في الزمالك. قهوة المعادي اليمنية في طريقها للنفاد خلال 4 أيام.</>
    : <>Revenue is up <em className="serif" style={{ color: 'var(--sage)', fontStyle: 'normal' }}>12%</em> on Maadi, down <em className="serif" style={{ color: 'var(--rose)', fontStyle: 'normal' }}>4%</em> on Zamalek. Yirgacheffe runs out in <em className="serif" style={{ color: 'var(--accent)', fontStyle: 'normal' }}>4 days</em> at current pace.</>;

  if (dashLayout === 'kpi') return <DashboardKPI series={series} total={total} headline={headline} branchObj={branchObj} onAIToggle={onAIToggle} lang={lang} />;
  if (dashLayout === 'newspaper') return <DashboardNewspaper series={series} total={total} headline={headline} branchObj={branchObj} onAIToggle={onAIToggle} lang={lang} />;
  return <DashboardEditorial series={series} total={total} headline={headline} branchObj={branchObj} onAIToggle={onAIToggle} onNav={onNav} lang={lang} />;
}

// ─── EDITORIAL (default) ────────────────────────────────────────────────
function DashboardEditorial({ series, total, headline, branchObj, onAIToggle, onNav, lang }) {
  const D = window.MADAR_DATA;
  return (
    <div className="content-inner">
      {/* Editorial header */}
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
          <span className="kicker">Monday, 8 May 2026 · Weekly digest</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>by <strong style={{ color: 'var(--accent)' }}>Madar AI</strong> · 06:14</span>
        </div>
        <h1 className="serif" style={{
          margin: 0, fontSize: 'clamp(28px, 3.4vw, 44px)',
          fontWeight: 400, lineHeight: 1.18, letterSpacing: '-0.02em',
          maxWidth: '24ch', textWrap: 'balance', color: 'var(--ink)'
        }}>
          {headline}
        </h1>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-sm" onClick={onAIToggle}><Icons.Sparkles size={13} />Why?</button>
          <button className="btn btn-sm">Read full digest</button>
          <button className="btn btn-sm btn-ghost">Skip this week</button>
        </div>
      </header>

      {/* KPI row */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        <UI.KPICard label="Revenue · this week" value="181,300" unit="£" delta={8.4}
                    spark={series.slice(-7)} big />
        <UI.KPICard label="Gross profit" value="118,100" unit="£" delta={11.2}
                    spark={series.slice(-7).map(v => v * 0.65)} big />
        <UI.KPICard label="Transactions" value="2,847" delta={4.1}
                    spark={series.slice(-7).map(v => v / 70)} big />
      </section>

      {/* Hero chart + AI insights rail */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, marginBottom: 24 }}>
        <RevenueHeroChart series={series} branchName={branchObj?.name || 'All branches'} />
        <AIInsightsRail onAIToggle={onAIToggle} />
      </section>

      {/* Branch leaderboard strip + heatmap */}
      <BranchStrip onNav={onNav} />

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <HeatmapCard />
        <RecentTxCard onNav={onNav} />
      </section>
    </div>
  );
}

// ─── KPI-FIRST (variant) ────────────────────────────────────────────────
function DashboardKPI({ series, total, headline, branchObj, onAIToggle, lang }) {
  return (
    <div className="content-inner">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <span className="kicker">Dashboard · This week</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            {branchObj ? branchObj.name : 'All branches'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['Today','Week','Month','Quarter','Year'].map((t, i) => (
            <button key={t} className="chip" data-active={i === 1}>{t}</button>
          ))}
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <UI.KPICard label="Revenue" value="181,300" unit="£" delta={8.4} spark={series.slice(-7)} />
        <UI.KPICard label="Gross profit" value="118,100" unit="£" delta={11.2} spark={series.slice(-7).map(v => v * 0.65)} />
        <UI.KPICard label="Net profit" value="42,800" unit="£" delta={6.2} spark={series.slice(-7).map(v => v * 0.24)} />
        <UI.KPICard label="Tickets" value="2,847" delta={4.1} spark={series.slice(-7).map(v => v / 70)} />
      </section>

      <div className="card" style={{ padding: '18px 20px', marginBottom: 18,
        borderColor: 'color-mix(in oklab, var(--accent) 35%, var(--rule))',
        background: 'color-mix(in oklab, var(--accent-soft) 30%, var(--bg-elev))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icons.Sparkles size={15} />
          </div>
          <p className="serif" style={{ margin: 0, fontSize: 17, fontWeight: 500, lineHeight: 1.4, flex: 1, textWrap: 'pretty' }}>
            {headline}
          </p>
          <button className="btn btn-sm" onClick={onAIToggle}>Ask</button>
        </div>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 18 }}>
        <RevenueHeroChart series={series} branchName={branchObj?.name || 'All branches'} compact />
        <AIInsightsRail onAIToggle={onAIToggle} compact />
      </section>

      <BranchStrip />
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <HeatmapCard />
        <RecentTxCard />
      </section>
    </div>
  );
}

// ─── NEWSPAPER (variant) ────────────────────────────────────────────────
function DashboardNewspaper({ series, total, headline, branchObj, onAIToggle, lang }) {
  const D = window.MADAR_DATA;
  return (
    <div className="content-inner" style={{ maxWidth: 1180 }}>
      {/* Masthead */}
      <header style={{ borderBottom: '3px double var(--ink)', paddingBottom: 14, marginBottom: 20,
                       display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 className="serif" style={{ margin: 0, fontSize: 44, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 0.95 }}>
            The Madar Weekly
          </h1>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, fontStyle: 'italic' }}>
            Vol. 47 · Bayt Coffee Co. · Mon, 8 May 2026
          </div>
        </div>
        <div style={{ textAlign: 'end', fontSize: 11, color: 'var(--ink-3)' }}>
          <div>5 branches · 47 staff</div>
          <div>£181,300 · 2,847 tickets</div>
        </div>
      </header>

      {/* Hero story */}
      <article style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 28, marginBottom: 24,
                        paddingBottom: 24, borderBottom: '1px solid var(--rule)' }}>
        <div>
          <span className="kicker">Lead · AI weekly digest</span>
          <h2 className="serif" style={{ margin: '10px 0 12px', fontSize: 36, fontWeight: 500,
                                          lineHeight: 1.1, letterSpacing: '-0.02em', textWrap: 'balance' }}>
            {headline}
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)', columnCount: 2, columnGap: 24, textWrap: 'pretty' }}>
            Maadi gained on the back of stronger weekend traffic — Saturday afternoons alone drove 31% of the branch's weekly revenue. The croissant-with-pour-over pairing experiment, in its third week, lifted basket size from £128 to £164. Zamalek's evening dip is concentrated 6–9 PM weekdays; the new Korba café opening on the same street is a likely culprit. Inventory is the urgent item: at current pace, Yirgacheffe will run out in four days, and Sidamo Direct's lead time is eighteen.
          </p>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={onAIToggle}>Read full digest</button>
            <button className="btn btn-sm">Listen · 4 min</button>
          </div>
        </div>
        <div>
          <RevenueHeroChart series={series} branchName={branchObj?.name || 'All branches'} compact noChrome />
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8, fontStyle: 'italic', textAlign: 'center' }}>
            Fig. 1 · Revenue across the chain, last 30 days. Weekend traffic dominant.
          </div>
        </div>
      </article>

      {/* Three-column digest */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28, marginBottom: 24 }}>
        {[
          { kicker: 'BRANCHES', title: 'Maadi outpaces Heliopolis', body: 'For the first time in six weeks, Maadi takes the chain lead with £47,800. Heliopolis (£41,100) loses ground despite still leading on margin. Sheikh Zayed posts its strongest week yet at £24,800.' },
          { kicker: 'PRODUCTS', title: 'Cortado is undersold', body: '72% margin, only 18% of espresso volume. Featuring it on the favorites grid for two weeks could lift contribution by ~£8,400/month. Geisha continues to underperform at four units.' },
          { kicker: 'STAFF',    title: 'Hala leads on speed and upsell', body: 'Heliopolis cashier Hala Mansour averages 47s per ticket against the chain average of 1m12s, with a 28% upsell rate. Worth pairing her with new hires next week.' },
        ].map((s, i) => (
          <article key={i}>
            <span className="kicker">{s.kicker}</span>
            <h3 className="serif" style={{ margin: '6px 0 8px', fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
              {s.title}
            </h3>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', textWrap: 'pretty' }}>
              {s.body}
            </p>
          </article>
        ))}
      </section>

      <div style={{ borderBottom: '1px solid var(--rule)', marginBottom: 24 }} />

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <BranchStripList />
        <AIInsightsRail onAIToggle={onAIToggle} compact />
      </section>
    </div>
  );
}

// ─── Hero chart ─────────────────────────────────────────────────────────
function RevenueHeroChart({ series, branchName, compact = false, noChrome = false }) {
  const w = 720, h = compact ? 220 : 280, pad = 32;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (series.length - 1);
  const pts = series.map((v, i) => [pad + i * stepX, h - pad - ((v - min) / range) * (h - pad * 2)]);
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = `${path} L${pts[pts.length - 1][0]},${h - pad} L${pad},${h - pad} Z`;
  const last = series[series.length - 1];

  const Inner = (
    <>
      {!noChrome && (
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <div>
            <div className="kicker">Revenue · 30 days · {branchName}</div>
            <div className="serif tnum" style={{ fontSize: 28, fontWeight: 500, marginTop: 4 }}>
              <span style={{ fontSize: '0.6em', color: 'var(--ink-3)', marginInlineEnd: 4 }}>£</span>
              {last.toLocaleString()}
              <span className="delta up" style={{ marginInlineStart: 12, fontSize: 14 }}>
                <Icons.ArrowUp />8.4% <span style={{ color: 'var(--ink-3)' }}>this week</span>
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['7d','30d','90d','1y'].map((t, i) => (
              <button key={t} className="chip" data-active={i === 1} style={{ padding: '3px 10px', fontSize: 11.5 }}>{t}</button>
            ))}
          </div>
        </header>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="revfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(g => (
          <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)}
                stroke="var(--rule)" strokeDasharray="2 4" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#revfill)" />
        <path d={path} stroke="var(--accent)" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill="var(--accent)" stroke="var(--bg-elev)" strokeWidth="2" />
        {/* x labels */}
        {[0, 7, 14, 21, 29].map(i => (
          <text key={i} x={pts[i][0]} y={h - 10} textAnchor="middle"
                fontSize="10" fill="var(--ink-3)" fontFamily="var(--sans)">
            {`${30 - i}d`}
          </text>
        ))}
      </svg>
    </>
  );
  return noChrome ? Inner : <div className="card">{Inner}</div>;
}

// ─── AI Insights rail ──────────────────────────────────────────────────
function AIInsightsRail({ onAIToggle, compact }) {
  const D = window.MADAR_DATA;
  const [dismissed, setDismissed] = useStateD([]);
  const visible = D.INSIGHTS.filter(i => !dismissed.includes(i.id));

  return (
    <div className="card" style={{ padding: '20px 22px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icons.Sparkles size={14} style={{ color: 'var(--accent)' }} />
        <span className="kicker" style={{ color: 'var(--accent)' }}>For your attention</span>
        <span style={{ flex: 1 }} />
        <button className="card-link" onClick={onAIToggle}>Ask Madar →</button>
      </header>
      <div style={{ marginTop: 4 }}>
        {visible.slice(0, compact ? 3 : 4).map((ins, i) => (
          <UI.AIInsightCard key={ins.id} insight={ins} idx={i}
            dense={compact}
            onAction={(id, a) => {
              if (a === 'Dismiss' || a === 'Mark as expected') setDismissed(d => [...d, id]);
            }} />
        ))}
      </div>
    </div>
  );
}

// ─── Branch leaderboard strip ──────────────────────────────────────────
function BranchStrip({ onNav }) {
  const D = window.MADAR_DATA;
  const max = Math.max(...D.BRANCHES.map(b => b.weekRev));
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <header className="card-h">
        <div>
          <span className="kicker">Branches · this week</span>
          <div className="card-title">Leaderboard</div>
        </div>
        <button className="card-link" onClick={() => onNav && onNav('branches')}>All branches →</button>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${D.BRANCHES.length}, 1fr)`, gap: 18 }}>
        {D.BRANCHES.sort((a, b) => b.weekRev - a.weekRev).map((b, i) => {
          const w = (b.weekRev / max) * 100;
          const up = b.deltaWk >= 0;
          return (
            <div key={b.id} style={{ borderInlineStart: '1px solid var(--rule)', paddingInlineStart: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span className="serif" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{String(i + 1).padStart(2, '0')}</span>
                <strong style={{ fontSize: 13 }}>{b.name}</strong>
              </div>
              <div className="serif tnum" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em' }}>
                <span style={{ fontSize: '0.55em', color: 'var(--ink-3)', marginInlineEnd: 2 }}>£</span>
                {(b.weekRev / 1000).toFixed(1)}k
              </div>
              <div style={{ height: 3, background: 'var(--rule)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: `${w}%`, height: '100%', background: i === 0 ? 'var(--accent)' : 'var(--ink-3)' }} />
              </div>
              <div className={`delta ${up ? 'up' : 'dn'}`} style={{ marginTop: 6, fontSize: 11.5 }}>
                {up ? <Icons.ArrowUp /> : <Icons.ArrowDown />}{Math.abs(b.deltaWk).toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// list version for newspaper layout
function BranchStripList() {
  const D = window.MADAR_DATA;
  return (
    <div>
      <span className="kicker">Branch leaderboard</span>
      <h3 className="serif" style={{ margin: '6px 0 14px', fontSize: 19, fontWeight: 500 }}>This week's standings</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
        <tbody>
          {D.BRANCHES.sort((a,b)=>b.weekRev-a.weekRev).map((b, i) => (
            <tr key={b.id} style={{ borderBottom: '1px dotted var(--rule)' }}>
              <td style={{ padding: '8px 0', width: 28, color: 'var(--ink-3)' }}>{i + 1}</td>
              <td style={{ padding: '8px 0', fontWeight: 500 }}>{b.name}</td>
              <td style={{ padding: '8px 0', textAlign: 'end' }}>£{b.weekRev.toLocaleString()}</td>
              <td style={{ padding: '8px 0', textAlign: 'end', width: 60,
                           color: b.deltaWk >= 0 ? 'var(--sage)' : 'var(--rose)' }}>
                {b.deltaWk >= 0 ? '+' : ''}{b.deltaWk.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Heatmap card ──────────────────────────────────────────────────────
function HeatmapCard() {
  const D = window.MADAR_DATA;
  return (
    <div className="card">
      <header className="card-h">
        <div>
          <span className="kicker">When customers buy</span>
          <div className="card-title">Hour × day</div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Last 4 weeks</span>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '32px repeat(12, 1fr)', gap: 3, fontSize: 10, color: 'var(--ink-3)' }}>
        <div></div>
        {[8,9,10,11,12,1,2,3,4,5,6,7].map((h, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9.5 }}>{h}{(i < 4) ? 'a' : 'p'}</div>
        ))}
        {D.HEATMAP.map(row => (
          <React.Fragment key={row.day}>
            <div style={{ fontSize: 11, alignSelf: 'center' }}>{row.day}</div>
            {row.cells.map((v, i) => (
              <div key={i} title={`${row.day} · ${v.toFixed(2)}`} style={{
                height: 22, borderRadius: 3,
                background: `color-mix(in oklab, var(--accent) ${Math.round(v * 100)}%, var(--bg-sunk))`
              }} />
            ))}
          </React.Fragment>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 12, textWrap: 'pretty' }}>
        Saturday 9–11 AM is the chain's hottest window. Weekday mornings hold steady; afternoons soft.
      </p>
    </div>
  );
}

// ─── Recent transactions ──────────────────────────────────────────────
function RecentTxCard({ onNav }) {
  const D = window.MADAR_DATA;
  const branchName = (id) => D.BRANCHES.find(b => b.id === id)?.name || id;
  const methodIcon = (m) => m === 'cash' ? <Icons.Cash size={12} /> : m === 'card' ? <Icons.Card size={12} /> : <Icons.Bank size={12} />;
  return (
    <div className="card">
      <header className="card-h">
        <div>
          <span className="kicker">Live · last 20 minutes</span>
          <div className="card-title">Recent transactions</div>
        </div>
        <button className="card-link">View all →</button>
      </header>
      <div>
        {D.RECENT_TX.slice(0, 7).map(tx => (
          <div key={tx.id} style={{
            display: 'grid',
            gridTemplateColumns: '14px 1fr auto auto',
            gap: 12, alignItems: 'center',
            padding: '10px 0', borderBottom: '1px solid var(--rule)',
            fontSize: 13
          }}>
            <span style={{ color: 'var(--ink-3)' }}>{methodIcon(tx.method)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{tx.id}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{branchName(tx.branch)} · {tx.cashier} · {tx.items} items</div>
            </div>
            {tx.status === 'pending'
              ? <span className="chip" style={{ background: 'var(--amber-soft)', color: 'var(--amber)', borderColor: 'transparent', fontSize: 10.5 }}>Pending</span>
              : <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tx.time} ago</span>}
            <span className="serif tnum" style={{ fontSize: 16, fontWeight: 500, minWidth: 60, textAlign: 'end' }}>
              £{tx.total}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
