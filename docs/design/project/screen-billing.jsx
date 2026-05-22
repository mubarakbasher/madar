// Madar — Billing screens (Subscription / Plan, Invoices, Pay Invoice, History)
// PAGES.md §55–58 — tenant-side bank-transfer payment to platform

const { useState: useStateB, useEffect: useEffectB, useMemo: useMemoB } = React;

// ─── Data ────────────────────────────────────────────────────────────────
const PLATFORM_BANKS = [
  {
    id: 'cib',
    bank: 'Commercial International Bank (CIB)',
    bank_ar: 'البنك التجاري الدولي',
    country: 'Egypt',
    currency: 'EGP',
    holder: 'Madar Software Technologies LLC',
    iban: 'EG38 0010 0001 0000 0001 8420 6712',
    swift: 'CIBEEGCX',
    flag: '🇪🇬',
    primary: true,
  },
  {
    id: 'nbe',
    bank: 'National Bank of Egypt',
    bank_ar: 'البنك الأهلي المصري',
    country: 'Egypt',
    currency: 'EGP',
    holder: 'Madar Software Technologies LLC',
    iban: 'EG24 0030 0002 0001 1110 2308 5544',
    swift: 'NBEGEGCX',
    flag: '🇪🇬',
    primary: false,
  },
  {
    id: 'enbd',
    bank: 'Emirates NBD',
    country: 'UAE',
    currency: 'AED',
    holder: 'Madar Software Technologies FZE',
    iban: 'AE07 0260 0010 1535 1234 902',
    swift: 'EBILAEAD',
    flag: '🇦🇪',
    primary: false,
  },
];

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 590,
    branches: 1,
    users: 3,
    tx: '500 / mo',
    storage: '2 GB',
    tagline: 'Single shop. Owners learning the ropes.',
    features: ['1 branch', 'Up to 3 users', '500 transactions / mo', 'POS + inventory', 'Email support'],
  },
  {
    id: 'growth',
    name: 'Growth',
    priceMonthly: 1490,
    branches: 5,
    users: 12,
    tx: '5,000 / mo',
    storage: '20 GB',
    tagline: 'A few locations, real volume.',
    features: ['Up to 5 branches', '12 users', '5,000 transactions / mo', 'Inter-branch transfers', 'Custom dashboards', 'Priority support'],
    current: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    priceMonthly: 2890,
    branches: 15,
    users: 40,
    tx: '25,000 / mo',
    storage: '100 GB',
    tagline: 'Multi-region. Procurement at scale.',
    features: ['Up to 15 branches', '40 users', '25,000 transactions / mo', 'Supplier scorecards', 'PO automation', 'Accountant exports', 'Phone support'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: null,
    tagline: 'Custom contract, dedicated rep.',
    features: ['Unlimited branches', 'Custom permissions', 'SSO & SCIM', 'Dedicated success manager', 'Custom SLA', 'On-prem option'],
  },
];

const INVOICES = [
  { id: 'INV-2026-0005', issued: '2026-05-01', due: '2026-05-15', amount: 1490, status: 'awaiting', plan: 'Growth · May 2026', ref: 'MDR-BAYT-0005' },
  { id: 'INV-2026-0004', issued: '2026-04-01', due: '2026-04-15', amount: 1490, status: 'paid',     plan: 'Growth · April 2026', ref: 'MDR-BAYT-0004', paidOn: '2026-04-08' },
  { id: 'INV-2026-0003', issued: '2026-03-01', due: '2026-03-15', amount: 1490, status: 'paid',     plan: 'Growth · March 2026', ref: 'MDR-BAYT-0003', paidOn: '2026-03-11' },
  { id: 'INV-2026-0002', issued: '2026-02-01', due: '2026-02-15', amount: 1490, status: 'paid',     plan: 'Growth · February 2026', ref: 'MDR-BAYT-0002', paidOn: '2026-02-07' },
  { id: 'INV-2026-0001', issued: '2026-01-01', due: '2026-01-15', amount: 1490, status: 'paid',     plan: 'Growth · January 2026', ref: 'MDR-BAYT-0001', paidOn: '2026-01-09' },
  { id: 'INV-2025-0012', issued: '2025-12-01', due: '2025-12-15', amount: 590,  status: 'paid',     plan: 'Starter · December 2025', ref: 'MDR-BAYT-9912', paidOn: '2025-12-06' },
];

const INV_STATUS = {
  awaiting:  { label: 'Awaiting transfer', color: 'var(--amber)', bg: 'var(--amber-soft)' },
  submitted: { label: 'In review',         color: 'var(--accent)', bg: 'var(--accent-soft)' },
  paid:      { label: 'Paid',              color: 'var(--sage)',  bg: 'var(--sage-soft)' },
  overdue:   { label: 'Overdue',           color: 'var(--rose)',  bg: 'var(--rose-soft)' },
};

// ─── Root ────────────────────────────────────────────────────────────────
function Billing({ lang }) {
  const [tab, setTab] = useStateB('plan');
  const [payOpen, setPayOpen] = useStateB(null);   // invoice obj
  const [invoices, setInvoices] = useStateB(INVOICES);

  const onSubmit = (invId) => {
    setInvoices(list => list.map(i => i.id === invId ? { ...i, status: 'submitted', submittedOn: '2026-05-08' } : i));
    setPayOpen(null);
  };

  const next = invoices.find(i => i.status === 'awaiting' || i.status === 'submitted') || invoices[0];

  return (
    <div className="content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="kicker">Subscription · Bayt Coffee Co.</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Billing
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            On the <strong style={{ color: 'var(--ink)' }}>Growth</strong> plan · next bill{' '}
            <strong style={{ color: 'var(--ink)' }} className="tnum">£1,490</strong> due{' '}
            <strong style={{ color: 'var(--ink)' }}>15 May 2026</strong>
          </p>
        </div>
        {next.status !== 'paid' && (
          <button className="btn btn-primary" onClick={() => setPayOpen(next)}>
            <Icons.Bank size={13} />Pay invoice {next.id}
          </button>
        )}
      </header>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--rule)' }}>
        {[
          ['plan',     'Plan & usage'],
          ['invoices', `Invoices · ${invoices.length}`],
          ['history',  'Payment history'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
                  style={{
                    border: 0, background: 'transparent', padding: '10px 14px', fontSize: 13,
                    color: tab === k ? 'var(--ink)' : 'var(--ink-3)',
                    borderBottom: `2px solid ${tab === k ? 'var(--accent)' : 'transparent'}`,
                    fontWeight: tab === k ? 500 : 400,
                    marginBottom: -1, cursor: 'pointer',
                  }}>{l}</button>
        ))}
      </div>

      {tab === 'plan'     && <PlanTab onUpgrade={() => setTab('invoices')} nextInv={next} onPay={() => setPayOpen(next)} />}
      {tab === 'invoices' && <InvoicesTab invoices={invoices} onPay={inv => setPayOpen(inv)} />}
      {tab === 'history'  && <HistoryTab invoices={invoices} />}

      {payOpen && <PayInvoiceSheet inv={payOpen} onClose={() => setPayOpen(null)} onSubmit={() => onSubmit(payOpen.id)} />}
    </div>
  );
}

// ─── PLAN TAB ────────────────────────────────────────────────────────────
function PlanTab({ onUpgrade, nextInv, onPay }) {
  const usage = [
    { label: 'Transactions this month', used: 3420, limit: 5000, unit: '' },
    { label: 'Active users',            used: 9,    limit: 12,   unit: '' },
    { label: 'Branches',                used: 5,    limit: 5,    unit: '' },
    { label: 'Storage',                 used: 8.4,  limit: 20,   unit: ' GB' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
      {/* Current plan + usage card */}
      <section className="card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, color-mix(in oklab, var(--accent-soft) 50%, transparent), transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="kicker">Current plan</span>
            <span className="chip" style={{ background: 'var(--sage-soft)', color: 'var(--sage)', borderColor: 'transparent', fontSize: 11 }}>● Active</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4 }}>
            <h2 className="serif" style={{ margin: 0, fontSize: 44, fontWeight: 500, letterSpacing: '-0.015em' }}>Growth</h2>
            <span className="tnum" style={{ fontSize: 16, color: 'var(--ink-3)' }}>£1,490 / mo</span>
          </div>
          <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--ink-3)', maxWidth: 480, textWrap: 'pretty' }}>
            Renews automatically on the 1st of each month. Next invoice issues <strong style={{ color: 'var(--ink)' }}>1 May 2026</strong> and is due within 14 days of issue.
          </p>

          <div className="kicker" style={{ marginBottom: 10 }}>Usage this billing period</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {usage.map(u => {
              const pct = Math.min(100, (u.used / u.limit) * 100);
              const warn = pct >= 90;
              return (
                <div key={u.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ color: 'var(--ink-2)' }}>{u.label}</span>
                    <span className="tnum" style={{ color: 'var(--ink-3)' }}>
                      <strong style={{ color: warn ? 'var(--amber)' : 'var(--ink)' }}>{u.used.toLocaleString()}{u.unit}</strong> / {u.limit.toLocaleString()}{u.unit}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-sunk)', borderRadius: 100, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: warn ? 'var(--amber)' : 'var(--accent)',
                      borderRadius: 100, transition: 'width .6s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn">Compare plans</button>
            <button className="btn btn-ghost">Cancel subscription</button>
          </div>
        </div>
      </section>

      {/* Next invoice card + at a glance */}
      <section style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
        <div className="card" style={{ padding: 22 }}>
          <span className="kicker">Next invoice</span>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 6, marginBottom: 4 }}>
            <span className="tnum serif" style={{ fontSize: 38, fontWeight: 500, letterSpacing: '-0.01em' }}>£{nextInv.amount.toLocaleString()}</span>
            <span className="chip" style={{ background: INV_STATUS[nextInv.status].bg, color: INV_STATUS[nextInv.status].color, borderColor: 'transparent', fontSize: 11 }}>
              {INV_STATUS[nextInv.status].label}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            {nextInv.id} · due <strong className="tnum" style={{ color: 'var(--ink-2)' }}>{nextInv.due.slice(5)}</strong>
          </div>
          <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '14px 0' }} />
          <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55, margin: '0 0 14px', textWrap: 'pretty' }}>
            Madar invoices are paid by bank transfer. After you transfer, upload the receipt — we verify within 24 hours and your service stays active throughout.
          </p>
          {nextInv.status !== 'paid' && (
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onPay}>
              <Icons.Bank size={13} />Pay by bank transfer
            </button>
          )}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Billing contact</div>
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>
            <strong>Adam Saleh</strong><br />
            <span style={{ color: 'var(--ink-3)' }}>billing@baytcoffee.eg</span><br />
            <span style={{ color: 'var(--ink-3)' }}>+20 100 234 5678</span>
          </div>
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 10, padding: '4px 0' }}>Change contact →</button>
        </div>
      </section>

      {/* Plan comparison strip — full width */}
      <section style={{ gridColumn: '1 / -1', marginTop: 6 }}>
        <div className="hr-label"><h2>Plans</h2></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {PLANS.map(p => (
            <div key={p.id} className="card"
                 style={{
                   padding: 20, position: 'relative',
                   borderColor: p.current ? 'var(--accent)' : 'var(--rule)',
                   boxShadow: p.current ? '0 0 0 1px var(--accent) inset' : 'var(--shadow-sm)',
                   background: p.current ? 'color-mix(in oklab, var(--accent-soft) 30%, var(--bg-elev))' : 'var(--bg-elev)',
                 }}>
              {p.current && (
                <span style={{
                  position: 'absolute', top: 14, insetInlineEnd: 14,
                  fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'var(--accent-ink)',
                }}>Current</span>
              )}
              <h3 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>{p.name}</h3>
              <div style={{ margin: '4px 0 12px', fontSize: 12, color: 'var(--ink-3)', minHeight: 32, lineHeight: 1.4, textWrap: 'pretty' }}>
                {p.tagline}
              </div>
              <div style={{ marginBottom: 14 }}>
                {p.priceMonthly ? (
                  <>
                    <span className="serif tnum" style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.01em' }}>£{p.priceMonthly.toLocaleString()}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)', marginInlineStart: 4 }}>/ mo</span>
                  </>
                ) : (
                  <span className="serif" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink-2)' }}>Let's talk</span>
                )}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                {p.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--ink-2)' }}>
                    <span style={{ color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}><Icons.Check size={12} /></span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button className={`btn ${p.current ? '' : 'btn-primary'}`}
                      disabled={p.current}
                      style={{ width: '100%', justifyContent: 'center', marginTop: 16, opacity: p.current ? 0.55 : 1, cursor: p.current ? 'default' : 'pointer' }}>
                {p.current ? 'You\u2019re here' : p.priceMonthly ? `Switch to ${p.name}` : 'Contact sales'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── INVOICES TAB ────────────────────────────────────────────────────────
function InvoicesTab({ invoices, onPay }) {
  const [filter, setFilter] = useStateB('all');
  const counts = useMemoB(() => {
    return {
      all: invoices.length,
      awaiting: invoices.filter(i => i.status === 'awaiting').length,
      submitted: invoices.filter(i => i.status === 'submitted').length,
      paid: invoices.filter(i => i.status === 'paid').length,
    };
  }, [invoices]);
  const rows = invoices.filter(i => filter === 'all' || i.status === filter);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          ['all',       `All · ${counts.all}`],
          ['awaiting',  `Awaiting · ${counts.awaiting}`],
          ['submitted', `In review · ${counts.submitted}`],
          ['paid',      `Paid · ${counts.paid}`],
        ].map(([k, l]) => (
          <button key={k} className="chip" data-active={filter === k} onClick={() => setFilter(k)} style={{ cursor: 'pointer' }}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm"><Icons.Download size={13} />Export</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
          <thead>
            <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
              {['Invoice', 'Period', 'Issued', 'Due', 'Amount', 'Status', ''].map((h, i) => (
                <th key={h} style={{ textAlign: i === 4 ? 'end' : 'start', padding: '12px 14px',
                                      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em',
                                      textTransform: 'uppercase', color: 'var(--ink-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((inv, i) => {
              const s = INV_STATUS[inv.status];
              return (
                <tr key={inv.id} className="inv-row" style={{ borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--rule)' }}>
                  <td style={{ padding: '14px', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500 }}>{inv.id}</td>
                  <td style={{ padding: '14px' }}>{inv.plan}</td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{inv.issued.slice(5)}</td>
                  <td style={{ padding: '14px', color: 'var(--ink-3)' }}>{inv.due.slice(5)}</td>
                  <td style={{ padding: '14px', textAlign: 'end', fontWeight: 500, fontSize: 14 }}>£{inv.amount.toLocaleString()}</td>
                  <td style={{ padding: '14px' }}>
                    <span className="chip" style={{ background: s.bg, color: s.color, borderColor: 'transparent', fontSize: 11 }}>{s.label}</span>
                  </td>
                  <td style={{ padding: '14px', textAlign: 'end' }}>
                    {inv.status === 'awaiting' && (
                      <button className="btn btn-sm btn-primary" onClick={() => onPay(inv)}>Pay</button>
                    )}
                    {inv.status === 'submitted' && (
                      <button className="btn btn-sm" onClick={() => onPay(inv)}>View status</button>
                    )}
                    {inv.status === 'paid' && (
                      <button className="btn btn-sm btn-ghost"><Icons.Download size={12} />PDF</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── HISTORY TAB — timeline ──────────────────────────────────────────────
function HistoryTab({ invoices }) {
  const paid = invoices.filter(i => i.status === 'paid');
  const submitted = invoices.filter(i => i.status === 'submitted');
  const events = [
    ...submitted.map(i => ({ date: i.submittedOn || i.issued, label: 'Receipt submitted', detail: `${i.id} · awaiting verification`, kind: 'submit', amount: i.amount, ref: i.ref })),
    ...paid.map(i => ({ date: i.paidOn, label: 'Payment verified', detail: `${i.id} · ${i.plan}`, kind: 'paid', amount: i.amount, ref: i.ref })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
      <div className="card" style={{ padding: 0 }}>
        <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)' }}>
          <div className="kicker">Activity</div>
        </header>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {events.map((e, i) => (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 14, padding: '16px 18px',
                                  borderBottom: i === events.length - 1 ? 'none' : '1px solid var(--rule)' }}>
              <div style={{
                width: 24, height: 24, borderRadius: 50,
                background: e.kind === 'paid' ? 'var(--sage-soft)' : 'var(--accent-soft)',
                color: e.kind === 'paid' ? 'var(--sage)' : 'var(--accent-ink)',
                display: 'grid', placeItems: 'center', marginTop: 2,
              }}>
                {e.kind === 'paid' ? <Icons.Check size={12} /> : <Icons.Send size={12} />}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{e.label}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{e.detail}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4, fontFamily: 'var(--mono)' }}>Ref {e.ref}</div>
              </div>
              <div style={{ textAlign: 'end' }}>
                <div className="serif tnum" style={{ fontSize: 18, fontWeight: 500 }}>£{e.amount.toLocaleString()}</div>
                <div className="tnum" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{e.date && e.date.slice(5)}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <aside style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="kicker" style={{ marginBottom: 10 }}>Lifetime spend</div>
          <div className="serif tnum" style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            £{paid.reduce((s, i) => s + i.amount, 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            Across <strong className="tnum" style={{ color: 'var(--ink)' }}>{paid.length}</strong> verified payments, since Dec 2025.
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Avg verification time</div>
          <div className="serif tnum" style={{ fontSize: 28, fontWeight: 500 }}>4.2<span style={{ fontSize: 14, color: 'var(--ink-3)', marginInlineStart: 4 }}>hrs</span></div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            From receipt submission to verified status. Service stayed active the whole time.
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── PAY INVOICE FLOW ────────────────────────────────────────────────────
function PayInvoiceSheet({ inv, onClose, onSubmit }) {
  const isSubmitted = inv.status === 'submitted';
  // Steps: status (if submitted) | transfer | upload | done
  const initial = isSubmitted ? 'status' : 'transfer';
  const [step, setStep] = useStateB(initial);
  const [bank, setBank] = useStateB(PLATFORM_BANKS[0]);
  const [file, setFile] = useStateB(null);
  const [payerName, setPayerName] = useStateB('Bayt Coffee Co.');
  const [transferDate, setTransferDate] = useStateB('2026-05-08');
  const [bankRef, setBankRef] = useStateB('');
  const [copied, setCopied] = useStateB('');

  useEffectB(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = (text, key) => {
    try { navigator.clipboard.writeText(text); } catch {}
    setCopied(key);
    setTimeout(() => setCopied(c => c === key ? '' : c), 1400);
  };

  const handleSubmit = () => {
    setStep('done');
    setTimeout(onSubmit, 1600);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           style={{
             width: 640, maxWidth: '100vw', height: '100%',
             background: 'var(--bg-elev)', borderInlineStart: '1px solid var(--rule)',
             boxShadow: 'var(--shadow-lg)', overflow: 'auto',
             animation: 'slideInEnd .26s ease-out',
             display: 'flex', flexDirection: 'column',
           }}>
        {/* Header — invoice summary */}
        <header style={{
          padding: '22px 28px', borderBottom: '1px solid var(--rule)',
          background: 'color-mix(in oklab, var(--paper) 60%, var(--bg-elev))',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <span className="kicker">Pay invoice</span>
              <h2 className="serif tnum" style={{ margin: '4px 0 6px', fontSize: 30, fontWeight: 500, letterSpacing: '-0.015em' }}>
                £{inv.amount.toLocaleString()}
                <span style={{ fontSize: 13, fontFamily: 'var(--sans)', color: 'var(--ink-3)', fontWeight: 400, marginInlineStart: 10 }}>
                  {inv.id} · {inv.plan}
                </span>
              </h2>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                Due {inv.due} · service stays active during verification
              </div>
            </div>
            <button className="tb-icon-btn" onClick={onClose} title="Close (Esc)"><Icons.X size={14} /></button>
          </div>

          {/* Step indicator */}
          {step !== 'done' && step !== 'status' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
              <StepPip n={1} label="Make the transfer" active={step === 'transfer'} done={step === 'upload'} />
              <div style={{ flex: 1, height: 1, background: step === 'upload' ? 'var(--accent)' : 'var(--rule)' }} />
              <StepPip n={2} label="Upload receipt" active={step === 'upload'} done={false} />
            </div>
          )}
        </header>

        {step === 'transfer' && (
          <TransferStep bank={bank} setBank={setBank} inv={inv} copy={copy} copied={copied} onContinue={() => setStep('upload')} />
        )}

        {step === 'upload' && (
          <UploadStep
            inv={inv} file={file} setFile={setFile}
            payerName={payerName} setPayerName={setPayerName}
            transferDate={transferDate} setTransferDate={setTransferDate}
            bankRef={bankRef} setBankRef={setBankRef}
            onBack={() => setStep('transfer')}
            onSubmit={handleSubmit}
          />
        )}

        {step === 'done' && <DoneStep inv={inv} />}

        {step === 'status' && (
          <StatusStep inv={inv} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function StepPip({ n, label, active, done }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 22, height: 22, borderRadius: 50,
        background: done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--bg-sunk)',
        color: done || active ? '#fff' : 'var(--ink-3)',
        border: '1px solid ' + (done || active ? 'var(--accent)' : 'var(--rule)'),
        display: 'grid', placeItems: 'center',
        fontSize: 11, fontWeight: 600, fontFamily: 'var(--sans)',
      }}>{done ? <Icons.Check size={11} /> : n}</div>
      <span style={{ fontSize: 12, fontWeight: 500, color: active || done ? 'var(--ink)' : 'var(--ink-3)' }}>{label}</span>
    </div>
  );
}

// Step 1 — make the transfer
function TransferStep({ bank, setBank, inv, copy, copied, onContinue }) {
  const Row = ({ label, value, mono, k }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, padding: '10px 0',
                  borderBottom: '1px dashed var(--rule)', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontFamily: mono ? 'var(--mono)' : 'inherit', fontSize: mono ? 13 : 13.5, fontWeight: mono ? 500 : 400, letterSpacing: mono ? '0.02em' : 'normal' }}>{value}</div>
      </div>
      <button className="btn btn-sm btn-ghost" onClick={() => copy(value, k)}
              style={{ padding: '4px 10px', minWidth: 78, justifyContent: 'center' }}>
        {copied === k ? <><Icons.Check size={11} /> Copied</> : <><Icons.Receipt size={11} /> Copy</>}
      </button>
    </div>
  );

  return (
    <section style={{ padding: '24px 28px', flex: 1 }}>
      <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', textWrap: 'pretty' }}>
        Send <strong className="tnum">£{inv.amount.toLocaleString()}</strong> by bank transfer to one of our accounts below.
        Use the reference code so we can match your payment automatically.
      </p>

      {/* Pick a bank */}
      <div className="kicker" style={{ marginTop: 18, marginBottom: 8 }}>Choose an account</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {PLATFORM_BANKS.map(b => (
          <button key={b.id} onClick={() => setBank(b)}
                  className="chip" data-active={bank.id === b.id}
                  style={{ cursor: 'pointer', padding: '6px 12px' }}>
            <span style={{ fontSize: 13 }}>{b.flag}</span>
            <span style={{ fontWeight: 500 }}>{b.bank.split('(')[0].trim()}</span>
            <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>{b.currency}</span>
            {b.primary && <span style={{ fontSize: 10, color: 'var(--accent)', marginInlineStart: 4 }}>● default</span>}
          </button>
        ))}
      </div>

      {/* Bank details card */}
      <div className="card" style={{ padding: '6px 18px', background: 'var(--bg)' }}>
        <Row label="Bank" value={bank.bank} k="bank" />
        <Row label="Account holder" value={bank.holder} k="holder" />
        <Row label="IBAN" value={bank.iban} mono k="iban" />
        <Row label="SWIFT / BIC" value={bank.swift} mono k="swift" />
        <Row label={`Currency`} value={`${bank.currency} · ${bank.country}`} k="cur" />
      </div>

      {/* Reference code — highlighted */}
      <div style={{ marginTop: 16, padding: 16, borderRadius: 12,
                    background: 'color-mix(in oklab, var(--accent-soft) 35%, var(--bg-elev))',
                    border: '1px solid color-mix(in oklab, var(--accent) 22%, var(--rule))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Icons.Sparkles size={13} style={{ color: 'var(--accent)' }} />
              <span className="kicker" style={{ color: 'var(--accent-ink)' }}>Must include · payment reference</span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 500, letterSpacing: '0.04em' }}>
              {inv.ref}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, maxWidth: 360, textWrap: 'pretty' }}>
              Paste this in the transfer description / memo field. Without it, manual verification adds 24–48h.
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => copy(inv.ref, 'ref')}
                  style={{ minWidth: 100, justifyContent: 'center' }}>
            {copied === 'ref' ? <><Icons.Check size={12} /> Copied</> : <><Icons.Receipt size={12} /> Copy code</>}
          </button>
        </div>
      </div>

      {/* Amount */}
      <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12,
                    background: 'var(--bg-sunk)', border: '1px solid var(--rule)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div className="kicker" style={{ marginBottom: 2 }}>Amount to transfer</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Exact match required for automatic verification</div>
        </div>
        <span className="serif tnum" style={{ fontSize: 28, fontWeight: 500 }}>£{inv.amount.toLocaleString()}</span>
      </div>

      <footer style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', maxWidth: 320, textWrap: 'pretty' }}>
          Most banks complete the transfer within 1–2 hours during business hours.
        </span>
        <button className="btn btn-primary" onClick={onContinue}>
          I've sent the transfer
          <Icons.ChevronRight size={13} />
        </button>
      </footer>
    </section>
  );
}

// Step 2 — upload receipt + payer details
function UploadStep({ inv, file, setFile, payerName, setPayerName, transferDate, setTransferDate, bankRef, setBankRef, onBack, onSubmit }) {
  const valid = file && payerName && transferDate && bankRef;
  const [drag, setDrag] = useStateB(false);

  const pickFile = () => {
    const fakeNames = ['CIB-transfer-08-may.pdf', 'WhatsApp-Image-08-05-2026.jpg', 'screenshot-receipt.png'];
    setFile({ name: fakeNames[Math.floor(Math.random() * fakeNames.length)], size: '348 KB' });
  };

  return (
    <section style={{ padding: '24px 28px', flex: 1 }}>
      <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', textWrap: 'pretty' }}>
        Snap or upload the bank transfer receipt. We'll verify it against our incoming statement and mark the invoice paid within 24 hours.
      </p>

      {/* Drop zone */}
      <label onDragOver={e => { e.preventDefault(); setDrag(true); }}
             onDragLeave={() => setDrag(false)}
             onDrop={e => { e.preventDefault(); setDrag(false); pickFile(); }}
             onClick={pickFile}
             style={{
               display: 'block', cursor: 'pointer',
               border: `2px dashed ${drag ? 'var(--accent)' : 'var(--rule)'}`,
               borderRadius: 14, padding: file ? 18 : 32,
               background: drag ? 'color-mix(in oklab, var(--accent-soft) 40%, var(--bg-elev))' : 'var(--bg)',
               textAlign: 'center', transition: 'all .18s ease',
             }}>
        {file ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'start' }}>
            <div style={{ width: 56, height: 70, borderRadius: 6,
                          background: 'linear-gradient(180deg, var(--paper), var(--bg-sunk))',
                          border: '1px solid var(--rule)',
                          display: 'grid', placeItems: 'center', color: 'var(--ink-3)' }}>
              <Icons.Receipt size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {file.size} · ready to submit · <span style={{ color: 'var(--sage)' }}>● scanned, no malware</span>
              </div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={e => { e.preventDefault(); e.stopPropagation(); setFile(null); }}>Replace</button>
          </div>
        ) : (
          <>
            <div style={{ width: 48, height: 48, borderRadius: 50, background: 'var(--paper)', display: 'grid', placeItems: 'center', margin: '0 auto 10px', color: 'var(--ink-3)' }}>
              <Icons.Camera size={20} />
            </div>
            <div className="serif" style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Drop receipt here</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
              or click to pick a file · PDF, JPG, PNG · up to 10 MB
            </div>
          </>
        )}
      </label>

      {/* Payer details */}
      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Payer name" hint="Whose account the money came from">
          <input value={payerName} onChange={e => setPayerName(e.target.value)} className="madar-input" />
        </Field>
        <Field label="Transfer date" hint="When the bank processed it">
          <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="madar-input" />
        </Field>
        <Field label="Bank reference number" hint="Found on the receipt — e.g. TR-2026-…">
          <input value={bankRef} onChange={e => setBankRef(e.target.value)} placeholder="e.g. CIB-TR-988412" className="madar-input" style={{ fontFamily: 'var(--mono)' }} />
        </Field>
        <Field label="Amount transferred">
          <input value={`£${inv.amount.toLocaleString()}`} disabled className="madar-input tnum"
                 style={{ background: 'var(--bg-sunk)', color: 'var(--ink-3)' }} />
        </Field>
      </div>

      {/* Notes */}
      <div style={{ marginTop: 14 }}>
        <Field label="Notes (optional)" hint="Anything our reviewer should know">
          <textarea rows={2} placeholder="e.g. Sent from owner's personal account because the company card was rejected." className="madar-input" style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>
      </div>

      <footer style={{
        marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--rule)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
      }}>
        <button className="btn btn-ghost" onClick={onBack}>
          <Icons.ChevronLeft size={13} />Back
        </button>
        <button className="btn btn-primary" onClick={onSubmit} disabled={!valid}
                style={{ opacity: valid ? 1 : 0.55, cursor: valid ? 'pointer' : 'not-allowed' }}>
          <Icons.Send size={13} />Submit for verification
        </button>
      </footer>

      <style>{`
        .madar-input {
          width: 100%; padding: 9px 11px;
          border: 1px solid var(--rule);
          border-radius: 8px;
          background: var(--bg);
          font-size: 13.5px;
          outline: none;
          color: var(--ink);
          font-family: var(--sans);
        }
        .madar-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 22%, transparent);
        }
        .madar-input::placeholder { color: var(--ink-4); }
      `}</style>
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div className="kicker" style={{ marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

// Done — submitted, awaiting verification
function DoneStep({ inv }) {
  return (
    <section style={{ padding: '60px 32px', flex: 1, display: 'grid', placeContent: 'center', textAlign: 'center' }}>
      <div style={{
        width: 76, height: 76, borderRadius: 50,
        background: 'var(--sage-soft)', color: 'var(--sage)',
        margin: '0 auto 18px',
        display: 'grid', placeItems: 'center',
        animation: 'fadeUp .4s ease-out',
      }}>
        <Icons.Check size={32} />
      </div>
      <h2 className="serif" style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}>
        Your payment is being verified
      </h2>
      <p style={{ margin: '0 auto 22px', maxWidth: 380, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, textWrap: 'pretty' }}>
        Receipt for <strong className="tnum">£{inv.amount.toLocaleString()}</strong> on <strong>{inv.id}</strong> received.
        Our finance team typically verifies within 4 hours during business hours.
        You'll get an email when it's done. Service stays active throughout.
      </p>
      <div style={{
        margin: '0 auto', padding: '10px 14px', borderRadius: 100,
        background: 'var(--bg-sunk)', border: '1px solid var(--rule)',
        display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12,
        color: 'var(--ink-2)',
      }}>
        <span className="dot-anim" />
        <span>Waiting for finance team to match against bank statement</span>
      </div>
    </section>
  );
}

// Already-submitted status view
function StatusStep({ inv, onClose }) {
  return (
    <section style={{ padding: 28, flex: 1 }}>
      <div className="card" style={{
        padding: 22, marginBottom: 16,
        background: 'color-mix(in oklab, var(--accent-soft) 30%, var(--bg-elev))',
        borderColor: 'color-mix(in oklab, var(--accent) 25%, var(--rule))',
      }}>
        <div className="kicker" style={{ color: 'var(--accent-ink)', marginBottom: 4 }}>In review</div>
        <h3 className="serif" style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 500 }}>
          Receipt submitted for {inv.id}
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55, textWrap: 'pretty' }}>
          Our finance team is matching your transfer against our bank statement. This usually takes under 4 hours during business hours.
          Your service stays active the whole time.
        </p>
      </div>

      <div className="kicker" style={{ marginBottom: 8 }}>Verification timeline</div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, borderInlineStart: '2px solid var(--rule)', marginInlineStart: 11 }}>
        {[
          ['Receipt submitted',   '2026-05-08 · 14:22', true,  'You uploaded CIB-transfer-08-may.pdf'],
          ['Auto-scan complete',  '2026-05-08 · 14:23', true,  'Reference code matched · amount matched'],
          ['Bank statement check','Today',              false, 'Awaiting next statement import (every 4 hours)'],
          ['Payment verified',    'Pending',            false, 'Service continues uninterrupted'],
        ].map(([t, ts, done, detail], i) => (
          <li key={i} style={{ position: 'relative', padding: '10px 0 10px 22px' }}>
            <div style={{
              position: 'absolute', insetInlineStart: -7, top: 14,
              width: 12, height: 12, borderRadius: 50,
              background: done ? 'var(--accent)' : 'var(--bg-elev)',
              border: '2px solid ' + (done ? 'var(--accent)' : 'var(--rule)'),
            }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: done ? 'var(--ink)' : 'var(--ink-3)' }}>{t}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>{ts}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{detail}</div>
          </li>
        ))}
      </ol>

      <footer style={{ marginTop: 22, display: 'flex', gap: 10 }}>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn btn-ghost"><Icons.Receipt size={12} />View receipt</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost"><Icons.Send size={12} />Message support</button>
      </footer>
    </section>
  );
}

// Export
window.Billing = Billing;
