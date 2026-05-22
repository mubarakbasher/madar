// Madar — Extra screens: Sales records, Purchase orders, Reconciliation,
// Stock transfers, Returns/refunds, Settings, Onboarding wizard.
// Notifications panel is exported here too.

const { useState: useStateE, useMemo: useMemoE, useEffect: useEffectE } = React;

// ───────────────────────────────────────────────────────────────────
// SALES RECORDS — full transaction log with filters & detail drawer
// ───────────────────────────────────────────────────────────────────
function expandedTx() {
  const D = window.MADAR_DATA;
  const base = D.RECENT_TX;
  const out = [];
  for (let i = 0; i < 32; i++) {
    const t = base[i % base.length];
    out.push({
      ...t,
      id: `TX-${94821 - i}`,
      time: `${(i * 3 + 2)} min`,
      total: t.total + ((i * 17) % 240) - 60,
      items: ((t.items + i) % 6) + 1,
      verified: t.status === 'verified' || (i % 5 !== 0),
      ts: `08 May · ${String(11 - Math.floor(i / 4)).padStart(2,'0')}:${String(45 - i*3).padStart(2,'0')}`.replace('-',''),
    });
  }
  return out;
}

function SalesRecords({ lang, onAIToggle }) {
  const D = window.MADAR_DATA;
  const txs = useMemoE(expandedTx, []);
  const [open, setOpen] = useStateE(null);
  const [method, setMethod] = useStateE('all');
  const [status, setStatus] = useStateE('all');
  const [bch, setBch] = useStateE('all');
  const [search, setSearch] = useStateE('');

  const rows = txs.filter(t =>
    (method === 'all' || t.method === method) &&
    (status === 'all' || (status === 'pending' ? t.status === 'pending' : t.status !== 'pending')) &&
    (bch === 'all' || t.branch === bch) &&
    (!search || t.id.toLowerCase().includes(search.toLowerCase()) || t.cashier.toLowerCase().includes(search.toLowerCase()))
  );

  const branchName = id => D.BRANCHES.find(b => b.id === id)?.name || id;
  const methodIcon = m => m === 'cash' ? <Icons.Cash size={12} /> : m === 'card' ? <Icons.Card size={12} /> : <Icons.Bank size={12} />;
  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <span className="kicker">Sales records · today</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            All transactions
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            <strong className="tnum">{rows.length}</strong> tickets ·
            <strong className="tnum"> £{total.toLocaleString()}</strong> volume ·
            <strong className="tnum"> {rows.filter(r => r.status === 'pending').length}</strong> pending verification
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm"><Icons.Calendar size={13} />Today</button>
          <button className="btn btn-sm"><Icons.Download size={13} />Export</button>
        </div>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['all','All'],['cash','Cash'],['card','Card'],['tx','Transfer']].map(([k,l]) => (
          <button key={k} className="chip" data-active={method === k} onClick={() => setMethod(k)} style={{ cursor:'pointer' }}>
            {k !== 'all' && methodIcon(k)} {l}
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: 'var(--rule)', margin: '0 4px' }} />
        {[['all','All status'],['pending','Pending'],['verified','Verified']].map(([k,l]) => (
          <button key={k} className="chip" data-active={status === k} onClick={() => setStatus(k)} style={{ cursor:'pointer' }}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        <div className="tb-search" style={{ width: 260 }}>
          <Icons.Search size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ticket ID, cashier, customer…" />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
          <thead>
            <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
              {['Ticket','Time','Branch','Cashier','Items','Method','Status','Total',''].map((h, i) => (
                <th key={h} style={{ textAlign: i >= 7 ? 'end' : 'start', padding: '12px 14px',
                                      fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em',
                                      textTransform: 'uppercase', color: 'var(--ink-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 24).map((tx, i) => (
              <tr key={tx.id} onClick={() => setOpen(tx)}
                  style={{ borderBottom: '1px solid var(--rule)', cursor: 'pointer' }}
                  className="inv-row">
                <td style={{ padding: '12px 14px', fontWeight: 500, fontFamily: 'var(--mono)', fontSize: 12 }}>{tx.id}</td>
                <td style={{ padding: '12px 14px', color: 'var(--ink-3)' }}>{tx.time} ago</td>
                <td style={{ padding: '12px 14px' }}>{branchName(tx.branch)}</td>
                <td style={{ padding: '12px 14px' }}>{tx.cashier}</td>
                <td style={{ padding: '12px 14px', color: 'var(--ink-3)' }}>{tx.items}</td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:6, color:'var(--ink-2)' }}>
                    {methodIcon(tx.method)} {tx.method === 'tx' ? 'Transfer' : tx.method === 'card' ? 'Card' : 'Cash'}
                  </span>
                </td>
                <td style={{ padding: '12px 14px' }}>
                  {tx.status === 'pending'
                    ? <span className="chip" style={{ background:'var(--amber-soft)', color:'var(--amber)', borderColor:'transparent', fontSize:10.5 }}>Pending</span>
                    : <span style={{ color:'var(--sage)', fontSize:11.5 }}>● Verified</span>}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'end', fontWeight: 500, fontSize: 14 }}>£{tx.total}</td>
                <td style={{ padding: '12px 14px', textAlign: 'end', color: 'var(--ink-4)' }}><Icons.ChevronRight size={14} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <SaleDetail tx={open} onClose={() => setOpen(null)} branchName={branchName(open.branch)} />}
    </div>
  );
}

function SaleDetail({ tx, onClose, branchName }) {
  const [stage, setStage] = useStateE('view'); // view | refund
  const D = window.MADAR_DATA;
  const items = D.PRODUCTS.slice(0, tx.items).map((p, i) => ({ ...p, qty: ((i+1) % 3) + 1 }));
  const subtotal = items.reduce((s,p) => s + p.price * p.qty, 0);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(26,23,20,0.45)', zIndex:50, display:'flex', justifyContent:'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, maxWidth:'100vw', height:'100%', background:'var(--bg-elev)',
        borderInlineStart:'1px solid var(--rule)', boxShadow:'var(--shadow-lg)', overflow:'auto',
        animation:'slideInEnd .25s ease-out', display:'flex', flexDirection:'column'
      }}>
        <header style={{ padding:'20px 24px', borderBottom:'1px solid var(--rule)', display:'flex', alignItems:'flex-start', gap:12 }}>
          <div style={{ flex:1 }}>
            <span className="kicker">Ticket · {branchName}</span>
            <h2 className="serif tnum" style={{ margin:'4px 0 0', fontSize: 24, fontWeight: 500, letterSpacing:'-0.01em' }}>
              {tx.id}
            </h2>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              {tx.time} ago · cashier <strong>{tx.cashier}</strong>
              {tx.status === 'pending' && <> · <span style={{ color:'var(--amber)' }}>● Pending verification</span></>}
            </div>
          </div>
          <button className="tb-icon-btn" onClick={onClose}><Icons.X size={14} /></button>
        </header>

        {stage === 'view' && (
          <>
            <section style={{ padding:'18px 24px', borderBottom:'1px solid var(--rule)' }}>
              <div className="kicker" style={{ marginBottom: 10 }}>Items</div>
              {items.map(p => (
                <div key={p.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap: 12, padding:'8px 0', fontSize:13 }}>
                  <span><strong>{p.qty}×</strong> {p.name}</span>
                  <span className="tnum" style={{ color:'var(--ink-3)' }}>£{p.price}</span>
                  <span className="tnum" style={{ minWidth:50, textAlign:'end', fontWeight:500 }}>£{p.price * p.qty}</span>
                </div>
              ))}
              <div style={{ borderTop:'1px solid var(--rule)', marginTop:8, paddingTop:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--ink-2)' }}>
                  <span>Subtotal</span><span className="tnum">£{subtotal}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--ink-2)' }}>
                  <span>VAT 14%</span><span className="tnum">£{Math.round(subtotal*0.14)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:6 }}>
                  <span className="kicker">Total</span>
                  <span className="serif tnum" style={{ fontSize: 22, fontWeight:500 }}>£{tx.total}</span>
                </div>
              </div>
            </section>

            {tx.status === 'pending' && (
              <section style={{ padding:'18px 24px', borderBottom:'1px solid var(--rule)',
                                background:'color-mix(in oklab, var(--amber-soft) 30%, var(--bg-elev))' }}>
                <div className="kicker" style={{ color:'var(--amber)', marginBottom: 6 }}>Bank receipt · pending</div>
                <div style={{ fontSize: 13, color:'var(--ink-2)', lineHeight: 1.5 }}>
                  Reference <strong className="tnum">CIB-2026-0508-{tx.id.slice(-5)}</strong> · receipt uploaded.
                  Awaiting manager verification against the daily bank statement.
                </div>
                <div style={{ marginTop: 10, display:'flex', gap: 6 }}>
                  <button className="btn btn-sm btn-primary"><Icons.Check size={12} />Mark verified</button>
                  <button className="btn btn-sm">View receipt</button>
                </div>
              </section>
            )}

            <section style={{ padding:'18px 24px', display:'grid', gap: 6 }}>
              <button className="btn" style={{ justifyContent:'space-between' }}><span><Icons.Receipt size={13} />&nbsp;&nbsp;Reprint receipt</span><Icons.ChevronRight size={12} /></button>
              <button className="btn" style={{ justifyContent:'space-between' }} onClick={() => setStage('refund')}>
                <span><Icons.Refresh size={13} />&nbsp;&nbsp;Return / refund</span><Icons.ChevronRight size={12} />
              </button>
              <button className="btn" style={{ justifyContent:'space-between' }}><span><Icons.Send size={13} />&nbsp;&nbsp;Email or SMS receipt</span><Icons.ChevronRight size={12} /></button>
            </section>
          </>
        )}

        {stage === 'refund' && <RefundFlow tx={tx} items={items} onBack={() => setStage('view')} onClose={onClose} />}
      </div>
    </div>
  );
}

function RefundFlow({ tx, items, onBack, onClose }) {
  const [picked, setPicked] = useStateE([]);
  const [reason, setReason] = useStateE('');
  const [stage, setStage] = useStateE('select'); // select | approval | done
  const refundTotal = picked.reduce((s, id) => {
    const it = items.find(i => i.id === id);
    return s + (it ? it.price * it.qty : 0);
  }, 0);
  const tax = Math.round(refundTotal * 0.14);

  if (stage === 'done') {
    return (
      <section style={{ padding:'40px 24px', textAlign:'center', flex:1, display:'grid', placeContent:'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 50, background:'var(--sage-soft)', color:'var(--sage)', display:'grid', placeItems:'center', margin:'0 auto 14px' }}>
          <Icons.Check size={26} />
        </div>
        <h3 className="serif" style={{ fontSize: 22, fontWeight: 500, margin:'0 0 8px' }}>Refund processed</h3>
        <p style={{ fontSize: 13, color:'var(--ink-3)', maxWidth: 280, margin:'0 auto 20px', textWrap:'pretty' }}>
          £{refundTotal + tax} returned to {tx.method === 'cash' ? 'cash drawer' : 'original payment method'}. Inventory adjusted. Audit log entry created.
        </p>
        <button className="btn btn-primary" style={{ justifyContent:'center' }} onClick={onClose}>Done</button>
      </section>
    );
  }

  if (stage === 'approval') {
    return (
      <>
        <section style={{ padding:'18px 24px', borderBottom:'1px solid var(--rule)' }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setStage('select')}><Icons.ChevronLeft size={12} />Back</button>
        </section>
        <section style={{ padding:'24px', flex: 1 }}>
          <div className="kicker" style={{ marginBottom: 6 }}>Manager approval required</div>
          <h3 className="serif" style={{ fontSize: 20, fontWeight: 500, margin: '0 0 10px' }}>
            Refund of <span className="tnum">£{refundTotal + tax}</span> on {tx.id}
          </h3>
          <p style={{ fontSize: 13, color:'var(--ink-2)', lineHeight: 1.55, textWrap:'pretty', marginBottom: 16 }}>
            Refunds over £100 require manager approval. Either ask a manager to enter their PIN, or send for asynchronous review.
          </p>
          <div style={{ background:'var(--bg-sunk)', border:'1px solid var(--rule)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color:'var(--ink-3)', marginBottom: 4 }}>Manager PIN</div>
            <div style={{ display:'flex', gap: 6 }}>
              {[1,2,3,4].map(i => (
                <input key={i} maxLength="1" inputMode="numeric"
                  style={{ width: 48, height: 56, borderRadius: 8, border:'1px solid var(--rule)',
                          background:'var(--bg-elev)', textAlign:'center',
                          fontFamily:'var(--serif)', fontSize: 24, fontWeight: 500, outline:'none' }} />
              ))}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }} onClick={() => setStage('done')}>
            <Icons.Check size={13} /> Approve refund
          </button>
          <button className="btn btn-ghost" style={{ width:'100%', justifyContent:'center', marginTop: 8 }} onClick={() => setStage('done')}>
            Send for async review
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <section style={{ padding:'18px 24px', borderBottom:'1px solid var(--rule)' }}>
        <button className="btn btn-sm btn-ghost" onClick={onBack}><Icons.ChevronLeft size={12} />Back to ticket</button>
      </section>
      <section style={{ padding:'18px 24px', flex: 1, overflow:'auto' }}>
        <div className="kicker" style={{ marginBottom: 6 }}>Select items to return</div>
        {items.map(it => {
          const checked = picked.includes(it.id);
          return (
            <label key={it.id} style={{
              display:'grid', gridTemplateColumns:'auto 1fr auto', gap:12, padding:'10px 0',
              borderBottom:'1px solid var(--rule)', cursor:'pointer', alignItems:'center'
            }}>
              <input type="checkbox" checked={checked}
                onChange={() => setPicked(p => p.includes(it.id) ? p.filter(x => x !== it.id) : [...p, it.id])} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{it.qty}× {it.name}</div>
                <div style={{ fontSize: 11, color:'var(--ink-3)' }}>£{it.price} each</div>
              </div>
              <span className="tnum" style={{ fontWeight: 500 }}>£{it.price * it.qty}</span>
            </label>
          );
        })}

        <div style={{ marginTop: 16 }}>
          <div className="kicker" style={{ marginBottom: 6 }}>Reason</div>
          <select value={reason} onChange={e => setReason(e.target.value)}
            style={{ width:'100%', padding:'10px 12px', borderRadius: 8, border:'1px solid var(--rule)',
                    background:'var(--bg)', fontSize:13, outline:'none' }}>
            <option value="">Select a reason…</option>
            <option>Customer dissatisfied</option>
            <option>Wrong item served</option>
            <option>Quality issue</option>
            <option>Cashier error</option>
            <option>Other</option>
          </select>
        </div>
      </section>

      <footer style={{ padding:'18px 24px', borderTop:'1px solid var(--rule)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 10, fontSize: 13 }}>
          <span style={{ color:'var(--ink-3)' }}>Refund total (incl. tax)</span>
          <span className="serif tnum" style={{ fontSize: 22, fontWeight: 500 }}>£{refundTotal + tax}</span>
        </div>
        <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }}
                disabled={picked.length === 0 || !reason}
                onClick={() => setStage('approval')}>
          Continue · {picked.length} item{picked.length === 1 ? '' : 's'}
        </button>
      </footer>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────
// PURCHASE ORDERS
// ───────────────────────────────────────────────────────────────────
const PO_LIST = [
  { id: 'PO-1042', supplier: 'Sidamo Direct',   total: 18400, items: 3, status: 'awaiting',  due: '2026-05-26', created: '2026-05-08', creator: 'Olivia M.' },
  { id: 'PO-1041', supplier: 'Cairo Dairy Co.', total: 1840,  items: 5, status: 'received',  due: '2026-05-08', created: '2026-05-07', creator: 'Bassem K.' },
  { id: 'PO-1040', supplier: 'Levant Mills',    total: 6200,  items: 8, status: 'in_transit',due: '2026-05-12', created: '2026-05-04', creator: 'Bassem K.' },
  { id: 'PO-1039', supplier: 'Atlas Packaging', total: 11200, items: 6, status: 'awaiting',  due: '2026-05-22', created: '2026-04-28', creator: 'Olivia M.' },
  { id: 'PO-1038', supplier: 'Nile Pastries',   total: 4320,  items: 9, status: 'received',  due: '2026-05-06', created: '2026-05-05', creator: 'Marco S.' },
  { id: 'PO-1037', supplier: 'Brew Hardware',   total: 2840,  items: 2, status: 'draft',     due: '—',          created: '2026-05-03', creator: 'Olivia M.' },
];
const PO_STATUSES = {
  draft:      { label: 'Draft',       color: 'var(--ink-3)', bg: 'var(--bg-sunk)' },
  awaiting:   { label: 'Awaiting',    color: 'var(--amber)', bg: 'var(--amber-soft)' },
  in_transit: { label: 'In transit',  color: 'var(--accent)',bg: 'var(--accent-soft)' },
  received:   { label: 'Received',    color: 'var(--sage)',  bg: 'var(--sage-soft)' },
};

function PurchaseOrders({ lang, onAIToggle }) {
  const [openWizard, setOpenWizard] = useStateE(false);
  const [filter, setFilter] = useStateE('all');
  const rows = PO_LIST.filter(p => filter === 'all' || p.status === filter);
  const totalOpen = PO_LIST.filter(p => p.status !== 'received' && p.status !== 'draft').reduce((s, p) => s + p.total, 0);

  return (
    <div className="content-inner">
      <header style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: 24 }}>
        <div>
          <span className="kicker">Procurement</span>
          <h1 className="serif" style={{ margin:'6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing:'-0.01em' }}>
            Purchase orders
          </h1>
          <p style={{ margin:'4px 0 0', fontSize: 13, color:'var(--ink-3)' }}>
            <strong className="tnum">{PO_LIST.filter(p => p.status !== 'received').length}</strong> open ·
            <strong className="tnum"> £{totalOpen.toLocaleString()}</strong> committed ·
            <strong className="tnum"> 3</strong> AI-suggested
          </p>
        </div>
        <div style={{ display:'flex', gap: 8 }}>
          <button className="btn btn-sm"><Icons.Download size={13} />Export</button>
          <button className="btn btn-sm btn-primary" onClick={() => setOpenWizard(true)}>
            <Icons.Plus size={13} />New purchase order
          </button>
        </div>
      </header>

      <div className="card" style={{ marginBottom: 16, padding:'14px 18px',
        background:'color-mix(in oklab, var(--accent-soft) 30%, var(--bg-elev))',
        borderColor:'color-mix(in oklab, var(--accent) 30%, var(--rule))' }}>
        <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
          <Icons.Sparkles size={16} style={{ color:'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
            Madar suggests bundling <strong>Yirgacheffe (120)</strong> + <strong>Kenya AA (60)</strong> + <strong>Geisha (24)</strong> into a single PO with Sidamo Direct. Saves <strong>£420</strong> in shipping vs separate orders.
          </div>
          <button className="btn btn-sm btn-primary" onClick={() => setOpenWizard(true)}>Build PO</button>
          <button className="btn btn-sm btn-ghost" onClick={onAIToggle}>Why?</button>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 12 }}>
        {[['all','All'],['draft','Draft'],['awaiting','Awaiting'],['in_transit','In transit'],['received','Received']].map(([k,l]) => (
          <button key={k} className="chip" data-active={filter === k} onClick={() => setFilter(k)} style={{ cursor:'pointer' }}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize: 13 }} className="tnum">
          <thead>
            <tr style={{ background:'var(--paper)', borderBottom:'1px solid var(--rule)' }}>
              {['PO #','Supplier','Items','Created','Due','Status','Total',''].map((h, i) => (
                <th key={h} style={{ textAlign: i >= 6 ? 'end' : 'start', padding:'12px 14px',
                                      fontSize: 10.5, fontWeight: 600, letterSpacing:'0.12em',
                                      textTransform:'uppercase', color:'var(--ink-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const s = PO_STATUSES[p.status];
              return (
                <tr key={p.id} className="inv-row" style={{ borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--rule)', cursor:'pointer' }}>
                  <td style={{ padding:'14px', fontWeight: 500, fontFamily:'var(--mono)', fontSize: 12 }}>{p.id}</td>
                  <td style={{ padding:'14px' }}>{p.supplier}</td>
                  <td style={{ padding:'14px', color:'var(--ink-3)' }}>{p.items}</td>
                  <td style={{ padding:'14px', color:'var(--ink-3)' }}>{p.created.slice(5)}</td>
                  <td style={{ padding:'14px' }}>{p.due.slice(5)}</td>
                  <td style={{ padding:'14px' }}>
                    <span className="chip" style={{ background: s.bg, color: s.color, borderColor:'transparent', fontSize: 11 }}>{s.label}</span>
                  </td>
                  <td style={{ padding:'14px', textAlign:'end', fontWeight: 500, fontSize: 14 }}>£{p.total.toLocaleString()}</td>
                  <td style={{ padding:'14px', textAlign:'end', color:'var(--ink-4)' }}><Icons.ChevronRight size={14} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openWizard && <POWizard onClose={() => setOpenWizard(false)} />}
    </div>
  );
}

function POWizard({ onClose }) {
  const D = window.MADAR_DATA;
  const [step, setStep] = useStateE(1);
  const [supplier, setSupplier] = useStateE(D.SUPPLIERS[0].id);
  const [lines, setLines] = useStateE([
    { sku: 'BNS-001', name: 'Yirgacheffe 250g', qty: 120, cost: 96 },
    { sku: 'POV-003', name: 'Kenya AA Chemex',  qty: 60,  cost: 26 },
    { sku: 'POV-004', name: 'Geisha (single)',  qty: 24,  cost: 62 },
  ]);
  const supObj = D.SUPPLIERS.find(s => s.id === supplier);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const shipping = 380;
  const tax = Math.round(subtotal * 0.14);
  const total = subtotal + shipping + tax;

  return (
    <div style={{ position:'fixed', inset: 0, background:'rgba(26,23,20,0.45)', zIndex: 50, display:'grid', placeItems:'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--bg-elev)', borderRadius: 16, width: 720, maxWidth:'calc(100vw - 32px)',
        maxHeight:'calc(100vh - 32px)', boxShadow:'var(--shadow-lg)', overflow:'hidden',
        display:'flex', flexDirection:'column'
      }}>
        <header style={{ padding:'20px 24px 14px', borderBottom:'1px solid var(--rule)' }}>
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
            <div>
              <span className="kicker">New purchase order · step {step} of 3</span>
              <h2 className="serif" style={{ margin:'4px 0 0', fontSize: 22, fontWeight: 500 }}>
                {step === 1 ? 'Choose supplier' : step === 2 ? 'Add items' : 'Review & send'}
              </h2>
            </div>
            <button className="tb-icon-btn" onClick={onClose}><Icons.X size={14} /></button>
          </div>
          <div style={{ display:'flex', gap: 4, marginTop: 14 }}>
            {[1,2,3].map(s => (
              <div key={s} style={{ flex: 1, height: 3, borderRadius: 2,
                background: s <= step ? 'var(--accent)' : 'var(--rule)' }} />
            ))}
          </div>
        </header>

        <div style={{ padding: 24, overflow:'auto', flex: 1 }}>
          {step === 1 && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12 }}>
              {D.SUPPLIERS.map(s => (
                <button key={s.id} onClick={() => setSupplier(s.id)} className="card"
                  style={{ padding: 14, textAlign:'start', cursor:'pointer',
                          borderColor: supplier === s.id ? 'var(--accent)' : 'var(--rule)',
                          background: supplier === s.id ? 'color-mix(in oklab, var(--accent-soft) 40%, var(--bg-elev))' : 'var(--bg-elev)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <strong className="serif" style={{ fontSize: 16 }}>{s.name}</strong>
                    <span style={{ fontSize: 11, color: s.reliability >= 90 ? 'var(--sage)' : 'var(--amber)' }}>{s.reliability}%</span>
                  </div>
                  <div style={{ fontSize: 11.5, color:'var(--ink-3)', marginTop: 2 }}>{s.ctry} · {s.leadDays}d lead</div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ marginBottom: 8, fontSize: 13, color:'var(--ink-3)' }}>
                With <strong style={{ color:'var(--ink)' }}>{supObj.name}</strong> · {supObj.leadDays}-day lead time
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize: 13 }} className="tnum">
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--rule)' }}>
                    {['SKU','Item','Qty','Cost','Subtotal',''].map((h,i) => (
                      <th key={h} style={{ textAlign: i >= 2 && i <= 4 ? 'end' : 'start',
                                            padding:'10px 8px', fontSize: 10.5, fontWeight: 600,
                                            letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid var(--rule)' }}>
                      <td style={{ padding:'10px 8px', fontFamily:'var(--mono)', fontSize: 11.5, color:'var(--ink-3)' }}>{l.sku}</td>
                      <td style={{ padding:'10px 8px' }}>{l.name}</td>
                      <td style={{ padding:'10px 8px', textAlign:'end' }}>
                        <input type="number" value={l.qty} onChange={e => setLines(L => L.map((x, j) => j === i ? { ...x, qty: +e.target.value } : x))}
                          style={{ width: 64, textAlign:'end', padding:'4px 8px', borderRadius: 6, border:'1px solid var(--rule)', background:'var(--bg)', fontSize:13 }}/>
                      </td>
                      <td style={{ padding:'10px 8px', textAlign:'end', color:'var(--ink-3)' }}>£{l.cost}</td>
                      <td style={{ padding:'10px 8px', textAlign:'end', fontWeight: 500 }}>£{(l.qty * l.cost).toLocaleString()}</td>
                      <td style={{ padding:'10px 8px', textAlign:'end' }}>
                        <button className="tb-icon-btn" style={{ width: 24, height: 24 }}
                          onClick={() => setLines(L => L.filter((_, j) => j !== i))}>
                          <Icons.X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-sm btn-ghost" style={{ marginTop: 10 }}><Icons.Plus size={12} />Add line</button>
            </div>
          )}

          {step === 3 && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 240px', gap: 24 }}>
              <div>
                <div className="kicker" style={{ marginBottom: 8 }}>Order summary</div>
                <div style={{ background:'var(--bg-sunk)', border:'1px solid var(--rule)', borderRadius: 10, padding: 14, fontSize: 13 }}>
                  <div><strong>{supObj.name}</strong> · {supObj.ctry}</div>
                  <div style={{ color:'var(--ink-3)', fontSize: 11.5 }}>Expected delivery: {new Date(Date.now() + supObj.leadDays*86400000).toISOString().slice(5, 10)}</div>
                  <hr style={{ border: 0, borderTop:'1px solid var(--rule)', margin:'10px 0' }} />
                  {lines.map((l, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize: 12.5, padding:'4px 0' }}>
                      <span>{l.qty}× {l.name}</span>
                      <span className="tnum">£{(l.qty * l.cost).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div className="kicker" style={{ marginBottom: 6 }}>Internal note</div>
                  <textarea placeholder="Optional note for the supplier or your team…" rows={3}
                    style={{ width:'100%', padding:10, borderRadius: 8, border:'1px solid var(--rule)',
                            background:'var(--bg)', fontFamily:'inherit', fontSize: 13, outline:'none', resize:'vertical' }} />
                </div>
              </div>
              <div>
                <div className="kicker" style={{ marginBottom: 8 }}>Costs</div>
                <div style={{ fontSize: 13 }} className="tnum">
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}>
                    <span style={{ color:'var(--ink-3)' }}>Subtotal</span><span>£{subtotal.toLocaleString()}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}>
                    <span style={{ color:'var(--ink-3)' }}>Shipping</span><span>£{shipping}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}>
                    <span style={{ color:'var(--ink-3)' }}>VAT 14%</span><span>£{tax.toLocaleString()}</span>
                  </div>
                  <hr style={{ border: 0, borderTop:'1px solid var(--rule)', margin:'8px 0' }} />
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                    <span className="kicker">Total</span>
                    <span className="serif" style={{ fontSize: 24, fontWeight: 500 }}>£{total.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer style={{ padding:'14px 24px', borderTop:'1px solid var(--rule)', display:'flex', justifyContent:'space-between' }}>
          <button className="btn" onClick={() => step === 1 ? onClose() : setStep(s => s - 1)}>
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          <button className="btn btn-primary" onClick={() => step === 3 ? onClose() : setStep(s => s + 1)}>
            {step === 3 ? 'Send to supplier' : 'Continue'}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// RECONCILIATION — daily cash count + bank receipts
// ───────────────────────────────────────────────────────────────────
function Reconciliation({ lang }) {
  const D = window.MADAR_DATA;
  const [tab, setTab] = useStateE('cash');

  return (
    <div className="content-inner">
      <header style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: 24 }}>
        <div>
          <span className="kicker">End of day · 8 May 2026</span>
          <h1 className="serif" style={{ margin:'6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing:'-0.01em' }}>
            Reconciliation
          </h1>
          <p style={{ margin:'4px 0 0', fontSize: 13, color:'var(--ink-3)' }}>
            Tie out cash drawers and verify bank receipts before closing the day.
          </p>
        </div>
        <button className="btn btn-sm btn-primary"><Icons.Check size={13} />Close day</button>
      </header>

      <div style={{ display:'flex', gap: 4, marginBottom: 20, borderBottom:'1px solid var(--rule)' }}>
        {[['cash','Cash drawers · 5'],['bank','Bank receipts · 12 pending'],['discr','Discrepancies · 2']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              border: 0, background:'transparent', padding:'10px 14px', fontSize: 13,
              color: tab === k ? 'var(--ink)' : 'var(--ink-3)',
              borderBottom: `2px solid ${tab === k ? 'var(--accent)' : 'transparent'}`,
              fontWeight: tab === k ? 500 : 400,
              marginBottom: -1, cursor:'pointer'
            }}>{l}</button>
        ))}
      </div>

      {tab === 'cash' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 14 }}>
          {D.BRANCHES.map((b, i) => {
            const expected = b.today * 0.42;
            const counted = expected + (i === 1 ? -32 : i === 3 ? 18 : 0);
            const diff = counted - expected;
            const ok = Math.abs(diff) < 1;
            return (
              <div key={b.id} className="card">
                <header style={{ display:'flex', justifyContent:'space-between', marginBottom: 10 }}>
                  <div>
                    <div className="kicker">Drawer · {b.name}</div>
                    <div style={{ fontSize: 12, color:'var(--ink-3)' }}>Cashier · {D.STAFF.find(s => s.branch === b.id)?.name?.split(' ')[0] || '—'}</div>
                  </div>
                  {ok
                    ? <span className="chip" style={{ background:'var(--sage-soft)', color:'var(--sage)', borderColor:'transparent', fontSize: 11 }}>✓ Tied</span>
                    : <span className="chip" style={{ background: diff < 0 ? 'var(--rose-soft)' : 'var(--amber-soft)', color: diff < 0 ? 'var(--rose)' : 'var(--amber)', borderColor:'transparent', fontSize: 11 }}>
                        {diff < 0 ? 'Short' : 'Over'} £{Math.abs(diff).toFixed(0)}
                      </span>}
                </header>
                <div className="tnum" style={{ fontSize: 13 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', color:'var(--ink-3)' }}>
                    <span>Expected (system)</span><span>£{Math.round(expected).toLocaleString()}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0' }}>
                    <span>Counted</span><span>£{Math.round(counted).toLocaleString()}</span>
                  </div>
                  <hr style={{ border: 0, borderTop:'1px solid var(--rule)', margin:'8px 0' }} />
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                    <span className="kicker">Difference</span>
                    <span className="serif" style={{ fontSize: 18, color: ok ? 'var(--sage)' : 'var(--rose)' }}>
                      {diff >= 0 ? '+' : '−'}£{Math.abs(diff).toFixed(0)}
                    </span>
                  </div>
                </div>
                {!ok && (
                  <div style={{ marginTop: 12 }}>
                    <select style={{ width:'100%', padding:8, borderRadius: 6, border:'1px solid var(--rule)', background:'var(--bg)', fontSize: 12 }}>
                      <option>Reason for discrepancy…</option>
                      <option>Short — missing receipt</option>
                      <option>Short — voided sale unrecorded</option>
                      <option>Over — change error</option>
                      <option>Other</option>
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'bank' && <BankReceipts />}
      {tab === 'discr' && <DiscrepancyLog />}
    </div>
  );
}

function BankReceipts() {
  const txs = expandedTx().filter(t => t.method === 'tx').slice(0, 12);
  const [verified, setVerified] = useStateE([]);
  return (
    <>
      <div style={{ display:'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-sm"><Icons.Download size={13} />Upload bank statement</button>
        <button className="btn btn-sm">Auto-match</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm btn-primary" onClick={() => setVerified(txs.map(t => t.id))}>
          <Icons.Check size={13} />Verify all matched
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize: 13 }} className="tnum">
          <thead>
            <tr style={{ background:'var(--paper)', borderBottom:'1px solid var(--rule)' }}>
              {['','Ticket','Reference','Branch','Cashier','Amount','Receipt','Action'].map((h, i) => (
                <th key={h+i} style={{ textAlign: i === 5 ? 'end' : 'start', padding:'12px 14px',
                                        fontSize: 10.5, fontWeight: 600, letterSpacing:'0.12em',
                                        textTransform:'uppercase', color:'var(--ink-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {txs.map((t, i) => {
              const isV = verified.includes(t.id);
              return (
                <tr key={t.id} style={{ borderBottom:'1px solid var(--rule)' }}>
                  <td style={{ padding:'12px 14px' }}>
                    <input type="checkbox" checked={isV} onChange={() => setVerified(v => v.includes(t.id) ? v.filter(x => x !== t.id) : [...v, t.id])} />
                  </td>
                  <td style={{ padding:'12px 14px', fontFamily:'var(--mono)', fontSize: 11.5 }}>{t.id}</td>
                  <td style={{ padding:'12px 14px', fontFamily:'var(--mono)', fontSize: 11.5, color:'var(--ink-3)' }}>
                    CIB-{t.id.slice(-5)}
                  </td>
                  <td style={{ padding:'12px 14px' }}>{window.MADAR_DATA.BRANCHES.find(b => b.id === t.branch)?.name}</td>
                  <td style={{ padding:'12px 14px', color:'var(--ink-3)' }}>{t.cashier}</td>
                  <td style={{ padding:'12px 14px', textAlign:'end', fontWeight: 500 }}>£{t.total}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <button className="btn btn-sm btn-ghost" style={{ padding:'4px 8px' }}><Icons.Eye size={12} />View</button>
                  </td>
                  <td style={{ padding:'12px 14px' }}>
                    {isV
                      ? <span style={{ color:'var(--sage)', fontSize: 11.5 }}>● Verified</span>
                      : <button className="btn btn-sm" onClick={() => setVerified(v => [...v, t.id])}><Icons.Check size={12} />Verify</button>}
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

function DiscrepancyLog() {
  const items = [
    { date: '2026-05-08', branch: 'Zamalek', kind: 'Cash short', amount: -32, reason: 'Missing receipt for £32 sale', user: 'Tamer K.' },
    { date: '2026-05-08', branch: 'New Cairo', kind: 'Cash over', amount: 18, reason: 'Change error — under-tendered', user: 'Yousef E.' },
    { date: '2026-05-07', branch: 'Maadi',   kind: 'Voided sale', amount: -65, reason: 'Wrong item served — not refunded', user: 'Mariam S.' },
  ];
  return (
    <div className="card" style={{ padding: 0, overflow:'hidden' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize: 13 }} className="tnum">
        <thead>
          <tr style={{ background:'var(--paper)', borderBottom:'1px solid var(--rule)' }}>
            {['Date','Branch','Type','Amount','Reason','By'].map((h, i) => (
              <th key={h} style={{ textAlign: i === 3 ? 'end' : 'start', padding:'12px 14px',
                                    fontSize: 10.5, fontWeight: 600, letterSpacing:'0.12em',
                                    textTransform:'uppercase', color:'var(--ink-3)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((d, i) => (
            <tr key={i} style={{ borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--rule)' }}>
              <td style={{ padding:'14px', color:'var(--ink-3)' }}>{d.date.slice(5)}</td>
              <td style={{ padding:'14px' }}>{d.branch}</td>
              <td style={{ padding:'14px' }}>{d.kind}</td>
              <td style={{ padding:'14px', textAlign:'end', color: d.amount < 0 ? 'var(--rose)' : 'var(--sage)', fontWeight: 500 }}>
                {d.amount >= 0 ? '+' : '−'}£{Math.abs(d.amount)}
              </td>
              <td style={{ padding:'14px', color:'var(--ink-2)', fontSize: 12.5 }}>{d.reason}</td>
              <td style={{ padding:'14px', color:'var(--ink-3)' }}>{d.user}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// STOCK TRANSFERS
// ───────────────────────────────────────────────────────────────────
const TRANSFERS = [
  { id: 'TR-2034', from: 'maadi', to: 'newcairo', items: 4, units: 60, status: 'in_transit', sent: '2026-05-08 09:14', by: 'Mariam S.' },
  { id: 'TR-2033', from: 'heliopolis', to: 'sheikhzayed', items: 2, units: 24, status: 'received', sent: '2026-05-07 16:42', by: 'Hala M.' },
  { id: 'TR-2032', from: 'maadi', to: 'zamalek', items: 6, units: 80, status: 'received', sent: '2026-05-07 10:08', by: 'Mariam S.' },
  { id: 'TR-2031', from: 'newcairo', to: 'heliopolis', items: 1, units: 12, status: 'requested', sent: '2026-05-08 07:20', by: 'Yousef E.' },
];

function StockTransfers({ lang }) {
  const D = window.MADAR_DATA;
  const [open, setOpen] = useStateE(false);
  const [from, setFrom] = useStateE('maadi');
  const [to, setTo]     = useStateE('newcairo');
  const [picks, setPicks] = useStateE([]);
  const bn = id => D.BRANCHES.find(b => b.id === id)?.name;
  const stColor = s => s === 'received' ? 'var(--sage)' : s === 'in_transit' ? 'var(--accent)' : 'var(--amber)';
  const stBg    = s => s === 'received' ? 'var(--sage-soft)' : s === 'in_transit' ? 'var(--accent-soft)' : 'var(--amber-soft)';
  const stLabel = s => s === 'received' ? 'Received' : s === 'in_transit' ? 'In transit' : 'Requested';

  return (
    <div className="content-inner">
      <header style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: 24 }}>
        <div>
          <span className="kicker">Inventory · transfers</span>
          <h1 className="serif" style={{ margin:'6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing:'-0.01em' }}>
            Stock transfers
          </h1>
          <p style={{ margin:'4px 0 0', fontSize: 13, color:'var(--ink-3)' }}>
            Move stock between branches. Both sides see the audit trail.
          </p>
        </div>
        <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}><Icons.Plus size={13} />New transfer</button>
      </header>

      <div className="card" style={{ padding: 0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize: 13 }} className="tnum">
          <thead>
            <tr style={{ background:'var(--paper)', borderBottom:'1px solid var(--rule)' }}>
              {['Transfer','From','','To','Items','Units','Sent','By','Status'].map((h, i) => (
                <th key={h+i} style={{ textAlign:'start', padding:'12px 14px', fontSize: 10.5,
                                        fontWeight: 600, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TRANSFERS.map((t, i) => (
              <tr key={t.id} className="inv-row" style={{ borderBottom: i === TRANSFERS.length - 1 ? 'none' : '1px solid var(--rule)' }}>
                <td style={{ padding:'14px', fontFamily:'var(--mono)', fontSize: 11.5, fontWeight: 500 }}>{t.id}</td>
                <td style={{ padding:'14px', fontWeight: 500 }}>{bn(t.from)}</td>
                <td style={{ padding:'14px', color:'var(--ink-4)' }}><Icons.ArrowRight size={14} /></td>
                <td style={{ padding:'14px', fontWeight: 500 }}>{bn(t.to)}</td>
                <td style={{ padding:'14px', color:'var(--ink-3)' }}>{t.items}</td>
                <td style={{ padding:'14px' }}>{t.units}</td>
                <td style={{ padding:'14px', color:'var(--ink-3)' }}>{t.sent.slice(5, 16)}</td>
                <td style={{ padding:'14px', color:'var(--ink-3)' }}>{t.by}</td>
                <td style={{ padding:'14px' }}>
                  <span className="chip" style={{ background: stBg(t.status), color: stColor(t.status), borderColor:'transparent', fontSize: 11 }}>
                    {stLabel(t.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div style={{ position:'fixed', inset: 0, background:'rgba(26,23,20,0.45)', zIndex: 50, display:'grid', placeItems:'center' }} onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'var(--bg-elev)', borderRadius: 16, width: 560, maxWidth:'calc(100vw - 32px)',
            boxShadow:'var(--shadow-lg)', overflow:'hidden'
          }}>
            <header style={{ padding:'20px 24px', borderBottom:'1px solid var(--rule)', display:'flex', alignItems:'center' }}>
              <div style={{ flex: 1 }}>
                <span className="kicker">New transfer</span>
                <h2 className="serif" style={{ margin:'4px 0 0', fontSize: 22, fontWeight: 500 }}>Move stock between branches</h2>
              </div>
              <button className="tb-icon-btn" onClick={() => setOpen(false)}><Icons.X size={14} /></button>
            </header>
            <div style={{ padding: 24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap: 12, alignItems:'end', marginBottom: 18 }}>
                <div>
                  <div className="kicker" style={{ marginBottom: 4 }}>From</div>
                  <select value={from} onChange={e => setFrom(e.target.value)}
                    style={{ width:'100%', padding:10, borderRadius: 8, border:'1px solid var(--rule)', background:'var(--bg)', fontSize: 13 }}>
                    {D.BRANCHES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <Icons.ArrowRight size={16} style={{ color:'var(--ink-3)', marginBottom: 12 }} />
                <div>
                  <div className="kicker" style={{ marginBottom: 4 }}>To</div>
                  <select value={to} onChange={e => setTo(e.target.value)}
                    style={{ width:'100%', padding:10, borderRadius: 8, border:'1px solid var(--rule)', background:'var(--bg)', fontSize: 13 }}>
                    {D.BRANCHES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="kicker" style={{ marginBottom: 6 }}>Pick items</div>
              <div style={{ maxHeight: 240, overflow:'auto', border:'1px solid var(--rule)', borderRadius: 10 }}>
                {D.PRODUCTS.slice(0, 8).map(p => {
                  const checked = picks.includes(p.id);
                  return (
                    <label key={p.id} style={{
                      display:'grid', gridTemplateColumns:'auto 1fr auto', gap: 12,
                      padding:'10px 14px', borderBottom:'1px solid var(--rule)',
                      alignItems:'center', cursor:'pointer', fontSize: 13
                    }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setPicks(P => P.includes(p.id) ? P.filter(x => x !== p.id) : [...P, p.id])} />
                      <div>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color:'var(--ink-3)' }}>{p.sku} · {p.stock} on hand</div>
                      </div>
                      <input type="number" defaultValue="10" disabled={!checked}
                        style={{ width: 64, padding:'4px 8px', borderRadius: 6, border:'1px solid var(--rule)', background:'var(--bg)', fontSize:13, textAlign:'end',
                                opacity: checked ? 1 : 0.4 }} />
                    </label>
                  );
                })}
              </div>
            </div>
            <footer style={{ padding:'14px 24px', borderTop:'1px solid var(--rule)', display:'flex', justifyContent:'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setOpen(false)}>
                Send {picks.length} item{picks.length === 1 ? '' : 's'} to {bn(to)}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// SETTINGS · users & roles
// ───────────────────────────────────────────────────────────────────
const USERS = [
  { name: 'Olivia Mansy',    role: 'Owner',         branch: 'all',         email: 'olivia@bayt.coffee',  mfa: true,  active: 'now' },
  { name: 'Bassem Khoury',   role: 'Admin',         branch: 'all',         email: 'bassem@bayt.coffee',  mfa: true,  active: '2h ago' },
  { name: 'Marco Saleh',     role: 'Branch Manager',branch: 'maadi',       email: 'marco@bayt.coffee',   mfa: true,  active: '12m ago' },
  { name: 'Mariam Saleh',    role: 'Cashier',       branch: 'maadi',       email: 'mariam@bayt.coffee',  mfa: false, active: 'now' },
  { name: 'Hala Mansour',    role: 'Cashier',       branch: 'heliopolis',  email: 'hala@bayt.coffee',    mfa: false, active: 'now' },
  { name: 'Tamer Khaled',    role: 'Cashier',       branch: 'zamalek',     email: 'tamer@bayt.coffee',   mfa: false, active: '4m ago' },
  { name: 'Nadia Halabi',    role: 'Inventory Clerk',branch: 'all',        email: 'nadia@bayt.coffee',   mfa: true,  active: '1d ago' },
  { name: 'Sam Eskander',    role: 'Accountant',    branch: 'all',         email: 'sam@bayt.coffee',     mfa: true,  active: '3d ago' },
];

const ROLE_PERMISSIONS = [
  { role: 'Owner',          checkout: 'full',  inventory: 'full',  reports: 'full',  users: 'full',  refunds: 'full' },
  { role: 'Admin',          checkout: 'full',  inventory: 'full',  reports: 'full',  users: 'full',  refunds: 'full' },
  { role: 'Branch Manager', checkout: 'full',  inventory: 'full',  reports: 'branch',users: 'view',  refunds: 'approve' },
  { role: 'Cashier',        checkout: 'full',  inventory: 'view',  reports: 'none',  users: 'none',  refunds: 'request' },
  { role: 'Inventory Clerk',checkout: 'view',  inventory: 'full',  reports: 'inventory', users: 'none', refunds: 'none' },
  { role: 'Accountant',     checkout: 'view',  inventory: 'view',  reports: 'full',  users: 'none',  refunds: 'view' },
  { role: 'Read-only Auditor', checkout: 'view', inventory: 'view', reports: 'view', users: 'view', refunds: 'view' },
];

function Settings({ lang }) {
  const D = window.MADAR_DATA;
  const [tab, setTab] = useStateE('users');
  const bn = id => id === 'all' ? 'All branches' : D.BRANCHES.find(b => b.id === id)?.name;

  const permColor = (p) => p === 'full' ? 'var(--sage)' : p === 'none' ? 'var(--ink-4)' : 'var(--accent)';
  const permLabel = (p) => p === 'full' ? '● Full' : p === 'none' ? '○ None' : `◐ ${p[0].toUpperCase()}${p.slice(1)}`;

  return (
    <div className="content-inner">
      <header style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom: 24 }}>
        <div>
          <span className="kicker">Workspace settings</span>
          <h1 className="serif" style={{ margin:'6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing:'-0.01em' }}>
            Settings
          </h1>
        </div>
      </header>

      <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap: 32 }}>
        <nav style={{ display:'flex', flexDirection:'column', gap: 2, position:'sticky', top: 80, alignSelf:'flex-start' }}>
          {[
            ['users','Users & roles'],
            ['perms','Permissions matrix'],
            ['tax','Tax & currency'],
            ['hardware','Hardware'],
            ['notif','Notifications'],
            ['data','Data & backups'],
            ['plan','Plan & billing'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{
                textAlign:'start', padding:'8px 12px', borderRadius: 8,
                background: tab === k ? 'var(--bg-elev)' : 'transparent',
                border: 0, fontSize: 13, color: tab === k ? 'var(--ink)' : 'var(--ink-2)',
                fontWeight: tab === k ? 500 : 400, cursor:'pointer',
                boxShadow: tab === k ? 'var(--shadow-sm)' : 'none',
                position:'relative'
              }}>
              {tab === k && <span style={{ position:'absolute', insetInlineStart: -8, top: 8, bottom: 8, width: 2, background:'var(--accent)', borderRadius: 2 }} />}
              {l}
            </button>
          ))}
        </nav>

        <div>
          {tab === 'users' && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 14 }}>
                <h2 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>People with access</h2>
                <button className="btn btn-sm btn-primary"><Icons.Plus size={13} />Invite user</button>
              </div>
              <div className="card" style={{ padding: 0, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background:'var(--paper)', borderBottom:'1px solid var(--rule)' }}>
                      {['Name','Role','Branch','MFA','Last active',''].map((h, i) => (
                        <th key={h} style={{ textAlign:'start', padding:'12px 14px', fontSize: 10.5,
                                              fontWeight: 600, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {USERS.map((u, i) => (
                      <tr key={u.name} className="inv-row" style={{ borderBottom: i === USERS.length - 1 ? 'none' : '1px solid var(--rule)' }}>
                        <td style={{ padding:'12px 14px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 50, background:'var(--accent)', color:'#fff', display:'grid', placeItems:'center', fontSize: 12, fontFamily:'var(--serif)' }}>
                              {u.name[0]}
                            </div>
                            <div>
                              <div style={{ fontWeight: 500 }}>{u.name}</div>
                              <div style={{ fontSize: 11, color:'var(--ink-3)' }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding:'12px 14px' }}>{u.role}</td>
                        <td style={{ padding:'12px 14px', color:'var(--ink-3)' }}>{bn(u.branch)}</td>
                        <td style={{ padding:'12px 14px' }}>
                          {u.mfa
                            ? <span style={{ color:'var(--sage)', fontSize: 11.5 }}>● Enabled</span>
                            : <span style={{ color:'var(--ink-4)', fontSize: 11.5 }}>○ Off</span>}
                        </td>
                        <td style={{ padding:'12px 14px', color:'var(--ink-3)' }}>{u.active}</td>
                        <td style={{ padding:'12px 14px', textAlign:'end' }}>
                          <button className="tb-icon-btn" style={{ width: 26, height: 26 }}><Icons.More size={14} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'perms' && (
            <>
              <h2 className="serif" style={{ margin:'0 0 14px', fontSize: 22, fontWeight: 500 }}>Permissions by role</h2>
              <div className="card" style={{ padding: 0, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background:'var(--paper)', borderBottom:'1px solid var(--rule)' }}>
                      {['Role','Checkout','Inventory','Reports','Users','Refunds'].map(h => (
                        <th key={h} style={{ textAlign:'start', padding:'12px 14px', fontSize: 10.5,
                                              fontWeight: 600, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--ink-3)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROLE_PERMISSIONS.map((r, i) => (
                      <tr key={r.role} style={{ borderBottom: i === ROLE_PERMISSIONS.length - 1 ? 'none' : '1px solid var(--rule)' }}>
                        <td style={{ padding:'14px', fontWeight: 500 }}>{r.role}</td>
                        {['checkout','inventory','reports','users','refunds'].map(k => (
                          <td key={k} style={{ padding:'14px', fontSize: 12, color: permColor(r[k]) }}>{permLabel(r[k])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color:'var(--ink-3)', marginTop: 10, textWrap:'pretty' }}>
                Sensitive actions (refunds, voids, price overrides, role changes) are written to the audit log regardless of role.
              </p>
            </>
          )}

          {tab !== 'users' && tab !== 'perms' && (
            <div style={{ padding: 60, textAlign:'center', color:'var(--ink-3)', border:'1px dashed var(--rule)', borderRadius: 14 }}>
              <Icons.Settings size={28} />
              <p style={{ marginTop: 10 }}>This panel is part of the prototype shell. The other tabs follow the same patterns.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// ONBOARDING WIZARD
// ───────────────────────────────────────────────────────────────────
function OnboardingWizard({ onClose }) {
  const [step, setStep] = useStateE(1);
  const STEPS = [
    { n: 1, t: 'Tell us about your business' },
    { n: 2, t: 'Add your first branch' },
    { n: 3, t: 'Import your products' },
    { n: 4, t: 'Set tax & currency' },
    { n: 5, t: "You're ready" },
  ];

  return (
    <div style={{ position:'fixed', inset: 0, background:'var(--bg)', zIndex: 100, overflow:'auto' }}>
      <header style={{ padding:'20px 32px', borderBottom:'1px solid var(--rule)', display:'flex', alignItems:'center', gap: 14 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <div className="sb-mark">M</div>
          <div className="sb-name">Madar<small>POS · v1</small></div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color:'var(--ink-3)' }}>14-day free trial · no card</span>
        <button className="btn btn-sm" onClick={onClose}>Skip setup →</button>
      </header>

      <div style={{ maxWidth: 720, margin:'0 auto', padding:'40px 24px 80px' }}>
        <div style={{ display:'flex', gap: 6, marginBottom: 32 }}>
          {STEPS.map(s => (
            <div key={s.n} style={{ flex: 1, height: 4, borderRadius: 2,
              background: s.n <= step ? 'var(--accent)' : 'var(--rule)' }} />
          ))}
        </div>

        <span className="kicker">Step {step} of {STEPS.length}</span>
        <h1 className="serif" style={{ margin:'8px 0 24px', fontSize: 34, fontWeight: 400, letterSpacing:'-0.02em', textWrap:'balance' }}>
          {STEPS[step - 1].t}
        </h1>

        {step === 1 && (
          <div style={{ display:'grid', gap: 14 }}>
            <Field label="Business name"><input className="ow-i" defaultValue="Bayt Coffee Co." /></Field>
            <Field label="What do you sell?">
              <div style={{ display:'flex', flexWrap:'wrap', gap: 6 }}>
                {['Café / coffee','Restaurant','Bakery','Retail','Salon','Gym','Other'].map((x, i) => (
                  <button key={x} className="chip" data-active={i === 0} style={{ cursor:'pointer' }}>{x}</button>
                ))}
              </div>
            </Field>
            <Field label="How many locations to start?">
              <div style={{ display:'flex', gap: 8 }}>
                {['1','2-5','6-20','20+'].map((x, i) => (
                  <button key={x} className="chip" data-active={i === 1} style={{ flex: 1, justifyContent:'center', padding:'10px 16px', cursor:'pointer' }}>{x}</button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div style={{ display:'grid', gap: 14 }}>
            <Field label="Branch name"><input className="ow-i" defaultValue="Maadi" /></Field>
            <Field label="Address"><input className="ow-i" defaultValue="9 Road 233, Maadi, Cairo" /></Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14 }}>
              <Field label="Currency">
                <select className="ow-i"><option>EGP — Egyptian Pound</option><option>USD</option><option>EUR</option></select>
              </Field>
              <Field label="Default language">
                <select className="ow-i"><option>English</option><option>العربية</option><option>Français</option></select>
              </Field>
            </div>
            <Field label="Hours">
              <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
                <input className="ow-i" defaultValue="07:30" style={{ width: 110 }} />
                <span style={{ color:'var(--ink-3)' }}>to</span>
                <input className="ow-i" defaultValue="23:00" style={{ width: 110 }} />
                <span style={{ color:'var(--ink-3)' }}>· every day</span>
              </div>
            </Field>
          </div>
        )}

        {step === 3 && (
          <>
            <p style={{ color:'var(--ink-2)', fontSize: 14, lineHeight: 1.6, textWrap:'pretty', marginTop: 0 }}>
              Drop a CSV or Excel — Madar will detect columns automatically. Or skip and add products one at a time.
            </p>
            <div style={{ border:'1.5px dashed var(--rule)', borderRadius: 14, padding: 40, textAlign:'center',
                          background:'var(--bg-sunk)', color:'var(--ink-3)' }}>
              <Icons.Download size={28} />
              <div style={{ marginTop: 8, fontSize: 14, color:'var(--ink-2)' }}>Drop your products.csv here</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>or click to browse · 50MB max</div>
              <button className="btn btn-sm" style={{ marginTop: 14 }}>Browse</button>
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color:'var(--ink-2)', display:'flex', gap: 12 }}>
              <button className="btn btn-sm btn-ghost">Use sample catalog</button>
              <button className="btn btn-sm btn-ghost">Download template</button>
            </div>
          </>
        )}

        {step === 4 && (
          <div style={{ display:'grid', gap: 14 }}>
            <Field label="VAT rate"><input className="ow-i" defaultValue="14%" style={{ width: 120 }} /></Field>
            <Field label="Receipt prefix"><input className="ow-i" defaultValue="BYT-" style={{ width: 160 }} /></Field>
            <Field label="Accept payment via">
              <div style={{ display:'flex', flexWrap:'wrap', gap: 6 }}>
                {['Cash','Card terminal','Bank transfer','Voucher'].map((x, i) => (
                  <button key={x} className="chip" data-active={i < 3} style={{ cursor:'pointer' }}>
                    <Icons.Check size={11} /> {x}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Connect printer & scanner">
              <div style={{ display:'flex', gap: 8 }}>
                <button className="btn btn-sm" style={{ flex: 1, justifyContent:'center' }}><Icons.Receipt size={13} />Detect printer</button>
                <button className="btn btn-sm" style={{ flex: 1, justifyContent:'center' }}><Icons.Hash size={13} />Pair scanner</button>
              </div>
            </Field>
          </div>
        )}

        {step === 5 && (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ width: 72, height: 72, borderRadius: 50, background:'var(--sage-soft)', color:'var(--sage)',
                          display:'grid', placeItems:'center', margin:'0 auto 20px' }}>
              <Icons.Check size={32} />
            </div>
            <p className="serif" style={{ fontSize: 22, lineHeight: 1.4, fontWeight: 400, maxWidth: '32ch', margin:'0 auto', textWrap:'balance' }}>
              Bayt Coffee Co. is set up. Process your first sale, or take a tour.
            </p>
            <p style={{ fontSize: 13, color:'var(--ink-3)', marginTop: 16 }}>
              Average time-to-first-sale across new merchants: <strong className="tnum" style={{ color:'var(--ink)' }}>11 min</strong>.
            </p>
            <div style={{ display:'flex', gap: 8, justifyContent:'center', marginTop: 28 }}>
              <button className="btn">Take a tour</button>
              <button className="btn btn-primary" onClick={onClose}>Open the app →</button>
            </div>
          </div>
        )}

        {step < 5 && (
          <div style={{ display:'flex', justifyContent:'space-between', marginTop: 36 }}>
            <button className="btn" onClick={() => step === 1 ? onClose() : setStep(s => s - 1)}>
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Continue</button>
          </div>
        )}
      </div>

      <style>{`
        .ow-i {
          width: 100%; padding: 12px 14px; border-radius: 10px;
          border: 1px solid var(--rule); background: var(--bg-elev);
          font-size: 14px; outline: none; font-family: inherit;
        }
        .ow-i:focus { border-color: var(--accent); }
      `}</style>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display:'block' }}>
      <div className="kicker" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

// ───────────────────────────────────────────────────────────────────
// NOTIFICATIONS PANEL
// ───────────────────────────────────────────────────────────────────
function NotificationsPanel({ onClose }) {
  const items = [
    { kind:'low',     icon: Icons.Box,      ts:'2m',  title:'Yirgacheffe is low at Maadi & Heliopolis', body:'28 units remaining · 4 days at current pace.' },
    { kind:'pending', icon: Icons.Receipt,  ts:'14m', title:'12 bank receipts awaiting verification',   body:'Reconciliation closes at 22:00 today.' },
    { kind:'transfer',icon: Icons.Truck,    ts:'1h',  title:'Transfer TR-2034 in transit',               body:'4 items · Maadi → New Cairo.' },
    { kind:'staff',   icon: Icons.User,     ts:'2h',  title:'Tamer ended shift at Zamalek',              body:'Cash drawer £32 short. Reason filed.' },
    { kind:'ai',      icon: Icons.Sparkles, ts:'5h',  title:'Madar weekly digest is ready',              body:'Maadi up 12.4% · Zamalek soft on evenings.' },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset: 0, zIndex: 39 }} />
      <aside style={{
        position:'fixed', insetInlineEnd: 16, top: 60, zIndex: 41,
        width: 380, maxHeight: 540, background:'var(--bg-elev)',
        border:'1px solid var(--rule)', borderRadius: 14, boxShadow:'var(--shadow-lg)',
        overflow:'hidden', display:'flex', flexDirection:'column',
        animation:'slideUp .2s ease-out'
      }}>
        <header style={{ padding:'14px 18px', borderBottom:'1px solid var(--rule)', display:'flex', alignItems:'center', gap: 8 }}>
          <span className="kicker">Notifications</span>
          <span style={{ flex: 1 }} />
          <button className="card-link" style={{ fontSize: 12 }}>Mark all read</button>
        </header>
        <div style={{ overflow:'auto' }}>
          {items.map((it, i) => (
            <div key={i} style={{
              display:'grid', gridTemplateColumns:'auto 1fr auto', gap: 10,
              padding:'14px 18px', borderBottom:'1px solid var(--rule)',
              alignItems:'flex-start', cursor:'pointer'
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8,
                background: it.kind === 'ai' ? 'var(--accent)' : 'var(--bg-sunk)',
                color: it.kind === 'ai' ? '#fff' : 'var(--ink-2)',
                display:'grid', placeItems:'center' }}>
                <it.icon size={14} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{it.title}</div>
                <div style={{ fontSize: 12, color:'var(--ink-3)', marginTop: 2, lineHeight: 1.45 }}>{it.body}</div>
              </div>
              <span style={{ fontSize: 11, color:'var(--ink-4)' }}>{it.ts}</span>
            </div>
          ))}
        </div>
        <footer style={{ padding: 10, borderTop:'1px solid var(--rule)', textAlign:'center' }}>
          <button className="btn btn-sm btn-ghost" style={{ width:'100%', justifyContent:'center' }}>View all notifications</button>
        </footer>
      </aside>
    </>
  );
}

window.SalesRecords     = SalesRecords;
window.PurchaseOrders   = PurchaseOrders;
window.Reconciliation   = Reconciliation;
window.StockTransfers   = StockTransfers;
window.Settings         = Settings;
window.OnboardingWizard = OnboardingWizard;
window.NotificationsPanel = NotificationsPanel;
