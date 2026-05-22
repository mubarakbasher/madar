// Madar Admin — Verification Queue (A4) — the productivity-critical screen
// Two-pane list + detail. Keyboard: J/K navigate · A approve · R reject · E request info

const { useState: useStateV, useEffect: useEffectV, useMemo: useMemoV, useRef: useRefV } = React;

function VerificationQueue({ onOpenProof }) {
  const D = window.ADMIN_DATA;
  const [proofs, setProofs] = useStateV(D.PROOFS);
  const [selectedId, setSelectedId] = useStateV(D.PROOFS[0].id);
  const [sort, setSort] = useStateV('oldest');
  const [currency, setCurrency] = useStateV('all');
  const [rejectOpen, setRejectOpen] = useStateV(false);
  const [requestOpen, setRequestOpen] = useStateV(false);
  const [toast, setToast] = useStateV(null);

  const rows = useMemoV(() => {
    let r = proofs.filter(p => currency === 'all' || p.currency === currency);
    r = r.slice().sort((a, b) => sort === 'oldest' ? b.daysPending - a.daysPending : a.daysPending - b.daysPending);
    return r;
  }, [proofs, sort, currency]);

  const selected = proofs.find(p => p.id === selectedId);

  // Keyboard nav
  useEffectV(() => {
    const onKey = (e) => {
      if (rejectOpen || requestOpen) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const idx = rows.findIndex(r => r.id === selectedId);
      if (e.key === 'j' || e.key === 'ArrowDown') {
        const next = rows[Math.min(rows.length - 1, idx + 1)];
        if (next) { setSelectedId(next.id); e.preventDefault(); }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        const prev = rows[Math.max(0, idx - 1)];
        if (prev) { setSelectedId(prev.id); e.preventDefault(); }
      } else if (e.key === 'a' && selected) {
        approveCurrent(); e.preventDefault();
      } else if (e.key === 'r' && selected) {
        setRejectOpen(true); e.preventDefault();
      } else if (e.key === 'e' && selected) {
        setRequestOpen(true); e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, selectedId, selected, rejectOpen, requestOpen]);

  const approveCurrent = () => {
    if (!selected) return;
    const idx = rows.findIndex(r => r.id === selected.id);
    setProofs(prev => prev.filter(p => p.id !== selected.id));
    setToast({ kind: 'approve', proof: selected });
    setTimeout(() => setToast(null), 2200);
    const next = rows[idx + 1] || rows[idx - 1];
    if (next) setSelectedId(next.id);
  };

  const rejectCurrent = (reason) => {
    setRejectOpen(false);
    if (!selected) return;
    const idx = rows.findIndex(r => r.id === selected.id);
    setProofs(prev => prev.filter(p => p.id !== selected.id));
    setToast({ kind: 'reject', proof: selected, reason });
    setTimeout(() => setToast(null), 2200);
    const next = rows[idx + 1] || rows[idx - 1];
    if (next) setSelectedId(next.id);
  };

  const tenantOf = (p) => D.TENANTS.find(t => t.id === p.tenantId);

  return (
    <div className="vq">
      {/* Header strip */}
      <header style={{
        padding: '20px 32px 16px',
        borderBottom: '1px solid var(--rule)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <span className="kicker">Finance · oldest first</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Verification queue
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            <strong className="tnum">{rows.length}</strong> receipts awaiting review ·
            avg age <strong className="tnum"> 2.6 days</strong> ·
            today verified <strong className="tnum"> 14</strong> · rejected <strong className="tnum"> 2</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="kicker" style={{ marginInlineEnd: 4 }}>Currency</div>
          {['all', 'EGP', 'AED', 'SAR'].map(c => (
            <button key={c} className="chip" data-active={currency === c} onClick={() => setCurrency(c)} style={{ cursor: 'pointer' }}>{c.toUpperCase()}</button>
          ))}
          <span style={{ width: 1, height: 18, background: 'var(--rule)', margin: '0 4px' }} />
          <button className="chip" data-active={sort === 'oldest'} onClick={() => setSort('oldest')} style={{ cursor: 'pointer' }}>Oldest first</button>
          <button className="chip" data-active={sort === 'newest'} onClick={() => setSort('newest')} style={{ cursor: 'pointer' }}>Newest first</button>
          <span style={{ flex: 1 }} />
          <KbdHints />
        </div>
      </header>

      {/* Two-pane layout */}
      <div className="vq-grid">
        {/* LIST PANE */}
        <aside className="vq-list">
          {rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ width: 56, height: 56, borderRadius: 50, background: 'var(--sage-soft)', color: 'var(--sage)', margin: '0 auto 12px', display: 'grid', placeItems: 'center' }}>
                <Icons.Check size={24} />
              </div>
              <div className="serif" style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 4 }}>Queue is clear</div>
              <div style={{ fontSize: 12 }}>Nice work. Next batch lands when the morning statement imports.</div>
            </div>
          ) : rows.map(p => {
            const t = tenantOf(p);
            const sel = p.id === selectedId;
            const flags = Object.values(p.match).filter(v => !v).length;
            return (
              <button key={p.id} onClick={() => setSelectedId(p.id)}
                className="vq-row" aria-current={sel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, letterSpacing: '-0.005em' }}>
                    {t.flag} {t.name}
                  </div>
                  <div className="serif tnum" style={{ fontSize: 16, fontWeight: 500 }}>
                    {p.symbol}{p.amount.toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink-3)' }}>
                  <span style={{ fontFamily: 'var(--mono)' }}>{p.id}</span>
                  <span style={{ color: p.daysPending > 3 ? 'var(--rose)' : p.daysPending > 1 ? 'var(--amber)' : 'var(--ink-3)', fontWeight: 500 }}>
                    {p.daysPending < 1 ? `${Math.round(p.daysPending * 24)}h pending` : `${p.daysPending.toFixed(1)}d pending`}
                  </span>
                </div>
                {flags > 0 && (
                  <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--amber)' }}>
                    <Icons.Sparkles size={10} />
                    {flags} mismatch{flags === 1 ? '' : 'es'}
                  </div>
                )}
              </button>
            );
          })}
        </aside>

        {/* DETAIL PANE */}
        {selected ? <ProofDetailPane proof={selected} tenant={tenantOf(selected)}
                                    onApprove={approveCurrent}
                                    onReject={() => setRejectOpen(true)}
                                    onRequestInfo={() => setRequestOpen(true)}
                                    onOpenFull={() => onOpenProof(selected.id)} />
                  : <div style={{ padding: 60, color: 'var(--ink-3)', textAlign: 'center' }}>Select a receipt to review</div>}
      </div>

      {rejectOpen && <RejectModal proof={selected} onCancel={() => setRejectOpen(false)} onSubmit={rejectCurrent} />}
      {requestOpen && <RequestInfoModal proof={selected} onClose={() => setRequestOpen(false)}
                                        onSent={() => { setRequestOpen(false); setToast({ kind: 'request', proof: selected }); setTimeout(() => setToast(null), 2200); }} />}
      {toast && <ActionToast toast={toast} />}
    </div>
  );
}

// ─── Detail pane ────────────────────────────────────────────────────────
function ProofDetailPane({ proof, tenant, onApprove, onReject, onRequestInfo, onOpenFull }) {
  const D = window.ADMIN_DATA;
  const bank = D.PLATFORM_BANKS.find(b => b.id === proof.expectedTo);
  const [zoom, setZoom] = useStateV(1);
  const [rotate, setRotate] = useStateV(0);

  return (
    <main className="vq-detail">
      <div className="vq-detail-inner">
        {/* Receipt viewer — left/start side, takes more room */}
        <section style={{
          background: 'var(--bg-sunk)',
          borderInlineEnd: '1px solid var(--rule)',
          display: 'flex', flexDirection: 'column',
          position: 'relative',
        }}>
          <header style={{
            padding: '12px 16px', borderBottom: '1px solid var(--rule)',
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: 'var(--ink-3)',
          }}>
            <Icons.Receipt size={13} />
            <span style={{ fontFamily: 'var(--mono)' }}>receipt-{proof.id.toLowerCase()}.pdf</span>
            <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 4 }}>
              <button className="tb-icon-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} title="Zoom out"><Icons.Minus size={14} /></button>
              <span style={{ alignSelf: 'center', fontSize: 11, fontFamily: 'var(--mono)' }}>{Math.round(zoom * 100)}%</span>
              <button className="tb-icon-btn" onClick={() => setZoom(z => Math.min(2, z + 0.1))} title="Zoom in"><Icons.Plus size={14} /></button>
              <button className="tb-icon-btn" onClick={() => setRotate(r => (r + 90) % 360)} title="Rotate"><Icons.Refresh size={14} /></button>
              <button className="tb-icon-btn" onClick={onOpenFull} title="Open full page"><Icons.Eye size={14} /></button>
            </span>
          </header>

          <div style={{
            flex: 1, overflow: 'auto', padding: 32,
            display: 'grid', placeItems: 'center',
            background: 'repeating-linear-gradient(45deg, transparent 0 18px, color-mix(in oklab, var(--rule) 50%, transparent) 18px 19px)',
          }}>
            <ReceiptMock proof={proof} tenant={tenant} bank={bank} zoom={zoom} rotate={rotate} />
          </div>

          {/* Match indicators bar */}
          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--rule)',
            background: 'var(--bg-elev)',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <MatchPill ok={proof.match.amount}    label="Amount"     value={`${proof.symbol}${proof.amount.toLocaleString()}`} />
            <MatchPill ok={proof.match.date}      label="Date"       value={proof.transferDate.slice(5)} />
            <MatchPill ok={proof.match.reference} label="Reference"  value={proof.refCode} />
            <MatchPill ok={proof.match.account}   label="Account"    value={bank?.bank.split('(')[0].trim()} />
            {proof.mismatch && (
              <div style={{
                marginInlineStart: 'auto', maxWidth: 280,
                fontSize: 11.5, color: 'var(--amber)',
                background: 'var(--amber-soft)',
                padding: '6px 10px', borderRadius: 6,
                lineHeight: 1.4,
              }}>
                <strong>Flag:</strong> {proof.mismatch}
              </div>
            )}
          </div>
        </section>

        {/* Details + actions — right/end side */}
        <section style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <header style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--rule)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <span className="kicker">Expected · {tenant.country}</span>
                <h2 className="serif tnum" style={{ margin: '4px 0 2px', fontSize: 32, fontWeight: 500, letterSpacing: '-0.015em' }}>
                  {proof.symbol}{proof.amount.toLocaleString()}
                </h2>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {tenant.flag} <strong>{tenant.name}</strong> · <span style={{ fontFamily: 'var(--mono)' }}>{proof.invId}</span>
                </div>
              </div>
              <span className="chip" style={{
                background: proof.daysPending > 3 ? 'var(--rose-soft)' : proof.daysPending > 1 ? 'var(--amber-soft)' : 'var(--sage-soft)',
                color:      proof.daysPending > 3 ? 'var(--rose)' : proof.daysPending > 1 ? 'var(--amber)' : 'var(--sage)',
                borderColor: 'transparent', fontSize: 11,
              }}>
                {proof.daysPending < 1 ? `${Math.round(proof.daysPending * 24)}h pending` : `${proof.daysPending.toFixed(1)} days pending`}
              </span>
            </div>
          </header>

          <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
            {/* Tenant-submitted details */}
            <div className="kicker" style={{ marginBottom: 8 }}>Tenant submitted</div>
            <DetailGrid items={[
              ['Payer name', proof.payerName],
              ['Transfer date', proof.transferDate],
              ['Bank reference', proof.bankRef, true],
              ['Reference code', proof.refCode, true],
              ['Submitted', proof.submitted, true],
            ]} />

            <div className="kicker" style={{ marginTop: 20, marginBottom: 8 }}>Should have arrived in</div>
            <div style={{
              background: 'var(--bg-sunk)', border: '1px solid var(--rule)',
              borderRadius: 10, padding: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: 14 }}>{bank.flag} {bank.bank}</strong>
                <span className="chip" style={{ background: 'var(--admin-soft)', color: 'var(--admin)', borderColor: 'transparent', fontSize: 11 }}>{bank.currency}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 4 }}>{bank.iban}</div>
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
                This month: <strong className="tnum" style={{ color: 'var(--ink)' }}>{bank.txns}</strong> incoming · <strong className="tnum" style={{ color: 'var(--ink)' }}>{bank.symbol || ''}{bank.monthIn.toLocaleString()}</strong>
              </div>
            </div>

            <div className="kicker" style={{ marginTop: 20, marginBottom: 8 }}>Tenant context</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12.5 }}>
              <Stat label="Plan" value={tenant.plan} />
              <Stat label="Branches" value={tenant.branches} />
              <Stat label="MRR" value={`${proof.symbol}${tenant.mrr.toLocaleString()}`} />
              <Stat label="Status" value={tenant.status} chip />
              <Stat label="Signed up" value={tenant.signed.slice(0, 7)} />
              <Stat label="Last active" value={tenant.lastActivity} />
            </div>

            <div style={{ marginTop: 18, padding: 12, borderRadius: 10, background: 'var(--bg)', border: '1px dashed var(--rule)' }}>
              <div className="kicker" style={{ marginBottom: 4 }}>Previous payments from this tenant</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                <strong className="tnum">4 verified</strong> · <strong className="tnum">0 rejected</strong> ·
                avg verification took <strong className="tnum">3.4 hours</strong> ·
                always paid from <strong>{proof.payerName}</strong>.
              </div>
            </div>
          </div>

          {/* Action bar — fixed at bottom */}
          <footer style={{
            padding: '14px 20px', borderTop: '1px solid var(--rule)',
            background: 'var(--bg-elev)',
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <button className="btn" onClick={onRequestInfo}>
              <Icons.Send size={12} />Request info <kbd>E</kbd>
            </button>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={onReject} style={{
              borderColor: 'color-mix(in oklab, var(--rose) 30%, var(--rule))',
              color: 'var(--rose)',
            }}>
              <Icons.X size={13} />Reject <kbd>R</kbd>
            </button>
            <button className="btn btn-primary" onClick={onApprove} style={{
              background: 'var(--sage)', borderColor: 'var(--sage)',
            }}>
              <Icons.Check size={13} />Approve <kbd style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderColor: 'transparent' }}>A</kbd>
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}

// ─── Receipt mock (a synthetic bank receipt rendered as a card) ─────────
function ReceiptMock({ proof, tenant, bank, zoom, rotate }) {
  return (
    <div style={{
      width: 380,
      transform: `scale(${zoom}) rotate(${rotate}deg)`,
      transformOrigin: 'center',
      transition: 'transform .2s ease',
      background: '#FFFEFA',
      border: '1px solid #E8DFC8',
      borderRadius: 6,
      padding: '22px 22px 28px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 1px 0 rgba(0,0,0,0.03)',
      color: '#2A241B',
      fontFamily: 'var(--sans)',
    }}>
      {/* Bank header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottom: '1px dashed #C8BA9C' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 4,
          background: '#1A4E7A', color: '#FFD200',
          display: 'grid', placeItems: 'center',
          fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 700,
        }}>{bank.bank.slice(0, 3).toUpperCase().includes('CIB') ? 'C' : bank.bank.slice(0, 1)}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{bank.bank}</div>
          <div style={{ fontSize: 10, color: '#6B6353' }}>Bank Transfer Receipt · {bank.country}</div>
        </div>
        <div style={{ marginInlineStart: 'auto', fontSize: 10, fontFamily: 'var(--mono)', color: '#6B6353' }}>
          {proof.transferDate}
        </div>
      </div>

      {/* Amount */}
      <div style={{ padding: '14px 0 12px', textAlign: 'center', borderBottom: '1px dashed #C8BA9C' }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6B6353' }}>Amount transferred</div>
        <div style={{ fontFamily: 'var(--serif)', fontSize: 32, fontWeight: 500, marginTop: 2, letterSpacing: '-0.01em' }}>
          {proof.symbol}{proof.match.amount ? proof.amount.toLocaleString() : (proof.amount - 100).toLocaleString()}
        </div>
        <div style={{ fontSize: 9, color: '#6B6353', marginTop: 2 }}>{proof.currency}</div>
      </div>

      {/* Details */}
      <div style={{ padding: '14px 0', fontSize: 11, lineHeight: 1.6, color: '#3D3528' }}>
        <ReceiptRow label="FROM"          value={proof.payerName} />
        <ReceiptRow label="TO"            value={bank.holder} mono />
        <ReceiptRow label="IBAN"          value={bank.iban} mono />
        <ReceiptRow label="REFERENCE"     value={proof.match.reference ? proof.refCode : '—'} mono dim={!proof.match.reference} />
        <ReceiptRow label="TX. ID"        value={proof.bankRef === '—' ? '(not shown)' : proof.bankRef} mono dim={proof.bankRef === '—'} />
      </div>

      {/* Stamp */}
      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: '1px dashed #C8BA9C',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{
          padding: '5px 9px', border: '2px solid #4A6B45',
          color: '#4A6B45', borderRadius: 3,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
          transform: 'rotate(-2deg)',
        }}>✓ COMPLETED</div>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#6B6353' }}>
          {proof.submitted.slice(11)}
        </div>
      </div>
    </div>
  );
}
function ReceiptRow({ label, value, mono, dim }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8, padding: '2px 0' }}>
      <span style={{ fontSize: 9, letterSpacing: '0.12em', color: '#6B6353', paddingTop: 2 }}>{label}</span>
      <span style={{
        fontFamily: mono ? 'var(--mono)' : 'inherit',
        fontSize: mono ? 11 : 12, fontWeight: 500,
        opacity: dim ? 0.5 : 1,
        wordBreak: 'break-all',
      }}>{value}</span>
    </div>
  );
}

// ─── Match pill ─────────────────────────────────────────────────────────
function MatchPill({ ok, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
      <div style={{
        width: 16, height: 16, borderRadius: 50,
        background: ok ? 'var(--sage-soft)' : 'var(--rose-soft)',
        color: ok ? 'var(--sage)' : 'var(--rose)',
        display: 'grid', placeItems: 'center',
      }}>{ok ? <Icons.Check size={10} /> : <Icons.X size={10} />}</div>
      <div>
        <div style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontWeight: 500, color: ok ? 'var(--ink)' : 'var(--rose)' }}>{value}</div>
      </div>
    </div>
  );
}

function DetailGrid({ items }) {
  return (
    <div style={{ display: 'grid', gap: 1, background: 'var(--rule)', borderRadius: 10, overflow: 'hidden' }}>
      {items.map(([k, v, mono]) => (
        <div key={k} style={{
          display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12,
          padding: '10px 12px', background: 'var(--bg-elev)', fontSize: 13,
        }}>
          <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{k}</span>
          <span style={{ fontFamily: mono ? 'var(--mono)' : 'inherit', fontWeight: 500, fontSize: mono ? 12.5 : 13 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, chip }) {
  return (
    <div style={{
      background: 'var(--bg-sunk)', border: '1px solid var(--rule)',
      borderRadius: 8, padding: '8px 10px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, textTransform: chip ? 'capitalize' : 'none' }} className="tnum">{value}</div>
    </div>
  );
}

// ─── Kbd hints chip ─────────────────────────────────────────────────────
function KbdHints() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      fontSize: 11, color: 'var(--ink-3)',
      padding: '4px 10px', borderRadius: 100,
      background: 'var(--bg-sunk)', border: '1px solid var(--rule)',
    }}>
      <kbd>J</kbd><kbd>K</kbd> nav · <kbd>A</kbd> approve · <kbd>R</kbd> reject
    </div>
  );
}

// ─── Reject modal ───────────────────────────────────────────────────────
function RejectModal({ proof, onCancel, onSubmit }) {
  const [reason, setReason] = useStateV('');
  const [notes, setNotes] = useStateV('');
  const reasons = [
    { id: 'amount', label: 'Wrong amount transferred' },
    { id: 'unread', label: 'Unreadable / blurry receipt' },
    { id: 'account', label: 'Sent to wrong account' },
    { id: 'dup', label: 'Duplicate of an earlier proof' },
    { id: 'fraud', label: 'Suspected fraud / mismatch' },
    { id: 'other', label: 'Other (explain below)' },
  ];

  return (
    <div className="vq-modal-bg" onClick={onCancel}>
      <div className="vq-modal" onClick={e => e.stopPropagation()}>
        <header style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--rule)' }}>
          <span className="kicker" style={{ color: 'var(--rose)' }}>Reject payment</span>
          <h2 className="serif" style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 500 }}>
            Why are you rejecting <span style={{ fontFamily: 'var(--mono)', fontSize: 16 }}>{proof.id}</span>?
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>
            Tenant will see this reason. Service will not be interrupted; the invoice returns to "awaiting transfer".
          </p>
        </header>

        <div style={{ padding: 20 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Reason</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {reasons.map(r => (
              <label key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid ' + (reason === r.id ? 'var(--rose)' : 'var(--rule)'),
                background: reason === r.id ? 'var(--rose-soft)' : 'var(--bg)',
                fontSize: 13.5,
              }}>
                <input type="radio" name="reject" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                {r.label}
              </label>
            ))}
          </div>

          <div className="kicker" style={{ marginTop: 16, marginBottom: 6 }}>Internal note (visible to other super-admins)</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="Auditable. Helps your teammates if the tenant pushes back."
            className="madar-input" style={{ width: '100%', resize: 'vertical' }} />
        </div>

        <footer style={{ padding: 16, borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" disabled={!reason}
                  onClick={() => onSubmit(reasons.find(r => r.id === reason).label)}
                  style={{
                    background: reason ? 'var(--rose)' : 'var(--bg-sunk)',
                    borderColor: reason ? 'var(--rose)' : 'var(--rule)',
                    color: reason ? '#fff' : 'var(--ink-4)',
                    cursor: reason ? 'pointer' : 'not-allowed',
                  }}>
            <Icons.X size={12} />Reject and notify tenant
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Request info modal ─────────────────────────────────────────────────
function RequestInfoModal({ proof, onClose, onSent }) {
  const [text, setText] = useStateV(`Hi — we received your receipt for ${proof.invId}, but couldn't verify it because the bank reference number is missing. Could you reply with the reference number from your bank confirmation? — Madar Finance`);
  return (
    <div className="vq-modal-bg" onClick={onClose}>
      <div className="vq-modal" onClick={e => e.stopPropagation()}>
        <header style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--rule)' }}>
          <span className="kicker">Send message</span>
          <h2 className="serif" style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 500 }}>
            Ask the tenant for more information
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>
            Sent as in-app notification and email. The proof stays in the queue.
          </p>
        </header>
        <div style={{ padding: 20 }}>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
            className="madar-input" style={{ width: '100%', resize: 'vertical' }} />
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 6 }}>
            {text.length} chars · macro variables not used (this is a one-off)
          </div>
        </div>
        <footer style={{ padding: 16, borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSent}>
            <Icons.Send size={12} />Send to tenant
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────
function ActionToast({ toast }) {
  const verb = toast.kind === 'approve' ? 'approved' : toast.kind === 'reject' ? 'rejected' : 'message sent';
  const bg = toast.kind === 'approve' ? 'var(--sage)' : toast.kind === 'reject' ? 'var(--rose)' : 'var(--admin)';
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: bg, color: '#fff',
      padding: '12px 18px', borderRadius: 100,
      fontSize: 13, fontWeight: 500,
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      zIndex: 200,
      animation: 'slideUp .25s ease-out',
    }}>
      <Icons.Check size={14} />
      <span>{toast.proof.id} {verb} · {toast.proof.symbol}{toast.proof.amount.toLocaleString()}</span>
      {toast.reason && <span style={{ opacity: 0.8, fontSize: 11.5 }}>· {toast.reason}</span>}
    </div>
  );
}

// ─── Full-page proof detail (A5) ────────────────────────────────────────
function ProofDetailFull({ proofId, onClose }) {
  const D = window.ADMIN_DATA;
  const proof = D.PROOFS.find(p => p.id === proofId);
  const tenant = D.TENANTS.find(t => t.id === proof.tenantId);
  const bank = D.PLATFORM_BANKS.find(b => b.id === proof.expectedTo);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 80, display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '14px 28px', borderBottom: '1px solid var(--rule)',
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--bg-elev)',
      }}>
        <button className="btn btn-sm" onClick={onClose}><Icons.ChevronLeft size={12} />Back to queue</button>
        <div className="kicker">Proof detail · sharable link</div>
        <code style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }}>
          admin.madar.app/billing/verification/{proofId}
        </code>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm"><Icons.Send size={12} />Share with teammate</button>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: 32 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <header style={{ marginBottom: 24, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div>
              <span className="kicker">Payment proof</span>
              <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 36, fontWeight: 500, letterSpacing: '-0.015em', fontFamily: 'var(--mono)' }}>
                {proofId}
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--ink-2)' }}>
                {tenant.flag} <strong>{tenant.name}</strong> ·
                <span className="tnum"> {proof.symbol}{proof.amount.toLocaleString()}</span> ·
                submitted {proof.submitted}
              </p>
            </div>
            <span className="chip" style={{ background: 'var(--admin-soft)', color: 'var(--admin)', borderColor: 'transparent' }}>● Pending review</span>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <ReceiptMock proof={proof} tenant={tenant} bank={bank} zoom={1} rotate={0} />
            <div className="card" style={{ padding: 20 }}>
              <div className="kicker" style={{ marginBottom: 8 }}>Match summary</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <MatchPill ok={proof.match.amount} label="Amount" value={`${proof.symbol}${proof.amount.toLocaleString()}`} />
                <MatchPill ok={proof.match.date} label="Date" value={proof.transferDate} />
                <MatchPill ok={proof.match.reference} label="Reference code" value={proof.refCode} />
                <MatchPill ok={proof.match.account} label="Account" value={bank.bank} />
              </div>
              {proof.mismatch && (
                <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'var(--amber-soft)', color: 'var(--amber)', fontSize: 12.5 }}>
                  <strong>Auto-flag:</strong> {proof.mismatch}
                </div>
              )}
            </div>
          </div>

          <div className="hr-label" style={{ marginTop: 32 }}><h2>Audit trail</h2></div>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, background: 'var(--bg-elev)', border: '1px solid var(--rule)', borderRadius: 12 }}>
            {[
              ['Receipt submitted',   proof.submitted, 'Tenant uploaded the receipt and details'],
              ['Auto-scan complete',  proof.submitted, proof.mismatch ? `Flagged: ${proof.mismatch}` : 'All 4 checks passed'],
              ['Awaiting reviewer',   'Now',           'Will be picked up in the next finance shift'],
            ].map(([t, ts, d], i, arr) => (
              <li key={i} style={{
                display: 'grid', gridTemplateColumns: '120px 1fr',
                gap: 14, padding: '14px 18px',
                borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--rule)',
                alignItems: 'baseline',
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-3)' }}>{ts}</span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{t}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

window.VerificationQueue = VerificationQueue;
window.ProofDetailFull = ProofDetailFull;
window.MatchPill = MatchPill;
window.DetailGrid = DetailGrid;
window.Stat = Stat;
