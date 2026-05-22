// Madar — Checkout / POS terminal screen.
// Cashier-facing. Speed > beauty. Spec page 7 — the most important screen.
// 60/40 split · slim 48px header · display-serif total · 64px Pay · held-sales tray.

const { useState: useStateCk, useMemo: useMemoCk, useEffect: useEffectCk, useRef: useRefCk } = React;

function Checkout({ branch, lang }) {
  const D = window.MADAR_DATA;
  const branchName = branch === 'all' ? 'Maadi' : (D.BRANCHES.find(b => b.id === branch)?.name || 'Maadi');
  const [cat, setCat] = useStateCk('all');
  const [cart, setCart] = useStateCk([
    { id: 'p04', qty: 2, discount: 0, note: 'oat milk' },
    { id: 'p10', qty: 1, discount: 0, note: '' },
    { id: 'p40', qty: 2, discount: 10, note: '' },
  ]);
  const [customer, setCustomer] = useStateCk(null);
  const [search, setSearch] = useStateCk('');
  const [payOpen, setPayOpen] = useStateCk(false);
  const [held, setHeld] = useStateCk([
    { id: 'h1', items: 3, total: 145, who: 'table 4 · Lina',  time: '4 min ago'  },
    { id: 'h2', items: 1, total: 75,  who: 'walk-in customer', time: '11 min ago' },
  ]);
  const [heldOpen, setHeldOpen] = useStateCk(false);
  const [lineSheet, setLineSheet] = useStateCk(null);
  const [time, setTime] = useStateCk(now());
  const searchRef = useRefCk();

  function now() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }

  useEffectCk(() => {
    // Live clock
    const id = setInterval(() => setTime(now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffectCk(() => {
    // Autofocus search on mount (barcode scanners type into it)
    searchRef.current?.focus();
  }, []);

  // ESC clears search (returns scanner focus); Enter on barcode would auto-add.
  useEffectCk(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setSearch(''); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const products = D.PRODUCTS.filter(p =>
    (cat === 'all' || p.cat === cat) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const cartLines = useMemoCk(() => cart.map(c => {
    const p = D.PRODUCTS.find(pp => pp.id === c.id);
    const price = p.price * c.qty * (1 - c.discount / 100);
    return { ...c, p, price };
  }), [cart]);

  const subtotal = cartLines.reduce((s, l) => s + l.price, 0);
  const totalDiscount = cartLines.reduce((s, l) => s + (l.p.price * l.qty * l.discount / 100), 0);
  const tax = Math.round(subtotal * 0.14);
  const total = subtotal + tax;

  const addToCart = (id) => setCart(c => {
    const ex = c.find(x => x.id === id);
    if (ex) return c.map(x => x.id === id ? { ...x, qty: x.qty + 1 } : x);
    return [...c, { id, qty: 1, discount: 0, note: '' }];
  });
  const adjQty = (id, d) => setCart(c => c.map(x => x.id === id ? { ...x, qty: Math.max(0, x.qty + d) } : x).filter(x => x.qty > 0));
  const removeLine = (id) => setCart(c => c.filter(x => x.id !== id));
  const clearCart = () => setCart([]);
  const updateLine = (id, patch) => setCart(c => c.map(x => x.id === id ? { ...x, ...patch } : x));

  const holdCurrent = () => {
    if (cart.length === 0) return;
    setHeld(h => [{ id: 'h' + Date.now(), items: cart.length, total: Math.round(total), who: 'walk-in customer', time: 'just now' }, ...h]);
    clearCart();
  };

  return (
    <div className="pos">
      {/* ── Slim 48px header (replaces topbar in POS mode) ─────────────────── */}
      <header className="pos-head">
        <div className="pos-head-left">
          <div className="pos-shift-dot" aria-label="Shift open" />
          <div className="pos-meta">
            <strong>{branchName}</strong>
            <span className="pos-sep">·</span>
            <span>Cashier <strong>Mariam S.</strong></span>
            <span className="pos-sep">·</span>
            <span>Shift <strong className="tnum">#247</strong> since 07:30</span>
          </div>
        </div>
        <div className="pos-head-right">
          <button className="pos-pill" onClick={() => setHeldOpen(o => !o)} aria-pressed={heldOpen}>
            <Icons.Pause size={12} />
            Held
            {held.length > 0 && <span className="pos-pill-badge tnum">{held.length}</span>}
          </button>
          <span className="pos-clock tnum">{time}</span>
          <span className="pos-sep">·</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            <strong className="tnum" style={{ color: 'var(--ink-2)' }}>38</strong> tickets · <strong className="tnum" style={{ color: 'var(--ink-2)' }}>£8,420</strong>
          </span>
          <button className="btn btn-sm" style={{ marginInlineStart: 8 }}>End shift</button>
        </div>
      </header>

      {/* ── Body: 60% products / 40% cart ───────────────────────────────────── */}
      <div className="pos-body">
        {/* ── LEFT — products ──────────────────────────────────────────────── */}
        <div className="pos-products">
          <div className="pos-search-row">
            <div className="pos-search">
              <Icons.Search size={18} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={lang === 'ar' ? 'امسح أو اكتب اسم منتج…' : 'Search or scan barcode…'}
                autoFocus
              />
              {search && (
                <button className="pos-search-clear" onClick={() => { setSearch(''); searchRef.current?.focus(); }}>
                  <Icons.X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Category pills */}
          <div className="pos-cats no-scrollbar">
            <button className="pos-cat" data-active={cat === 'all'} onClick={() => setCat('all')}>All</button>
            {D.PRODUCT_CATEGORIES.map(c => (
              <button key={c.id} className="pos-cat" data-active={cat === c.id} onClick={() => setCat(c.id)}>
                {c.name}
                <span className="pos-cat-count tnum">{c.count}</span>
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="pos-grid-wrap">
            {products.length === 0 ? (
              <div className="pos-grid-empty">
                <Icons.Search size={28} />
                <p className="serif">No products match <em>"{search}"</em></p>
                <button className="btn btn-sm btn-ghost" onClick={() => setSearch('')}>Clear search</button>
              </div>
            ) : (
              <div className="pos-grid">
                {products.map(p => (
                  <button key={p.id} className="pos-tile" onClick={() => addToCart(p.id)}>
                    <div className="pos-tile-visual" style={{
                      background: `linear-gradient(135deg, ${p.color}, color-mix(in oklab, ${p.color} 55%, #0E0B08))`,
                    }}>
                      <div className="pos-tile-mark serif">
                        {p.name.split(' ').slice(0, 1)[0].slice(0, 2)}
                      </div>
                    </div>
                    <div className="pos-tile-name">{p.name}</div>
                    <div className="pos-tile-price serif tnum">
                      <span className="cur">£</span>{p.price}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT — cart ─────────────────────────────────────────────────── */}
        <aside className="pos-cart">
          <header className="pos-cart-head">
            <h2 className="serif">Cart</h2>
            <div style={{ flex: 1 }} />
            {cart.length > 0 && (
              <>
                <button className="pos-link" onClick={holdCurrent}>
                  <Icons.Pause size={12} />Hold
                </button>
                <button className="pos-link" onClick={clearCart}>Clear</button>
              </>
            )}
          </header>

          {/* Customer attach */}
          <button className="pos-customer" onClick={() => setCustomer(customer ? null : { name: 'Adam S.', visits: 12, credit: 80 })}>
            {customer ? (
              <>
                <div className="pos-customer-avatar serif">{customer.name.slice(0, 1)}</div>
                <div style={{ flex: 1, textAlign: 'start' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{customer.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{customer.visits} visits · £{customer.credit} store credit</div>
                </div>
                <Icons.X size={14} />
              </>
            ) : (
              <>
                <div className="pos-customer-avatar pos-customer-avatar-empty"><Icons.User size={14} /></div>
                <div style={{ flex: 1, textAlign: 'start', fontSize: 13, color: 'var(--ink-3)' }}>
                  Add customer to this sale
                </div>
                <Icons.Plus size={14} style={{ color: 'var(--ink-3)' }} />
              </>
            )}
          </button>

          {/* Lines */}
          <div className="pos-cart-lines">
            {cart.length === 0 ? (
              <div className="pos-empty">
                <EmptyBasket />
                <p className="serif">Scan or tap a product to start</p>
                <span>Items appear here as you add them. Press <kbd>Esc</kbd> to return focus to the scanner.</span>
              </div>
            ) : cartLines.map(line => (
              <div key={line.id} className="pos-line" onClick={() => setLineSheet(line)}>
                <div className="pos-line-qty">
                  <button onClick={(e) => { e.stopPropagation(); adjQty(line.id, -1); }} aria-label="Decrease">
                    <Icons.Minus size={14} />
                  </button>
                  <span className="tnum">{line.qty}</span>
                  <button onClick={(e) => { e.stopPropagation(); adjQty(line.id, 1); }} aria-label="Increase">
                    <Icons.Plus size={14} />
                  </button>
                </div>
                <div className="pos-line-body">
                  <div className="pos-line-name">{line.p.name}</div>
                  <div className="pos-line-sub">
                    £{line.p.price.toLocaleString()} ea
                    {line.discount > 0 && <span style={{ color: 'var(--accent)' }}> · − {line.discount}%</span>}
                    {line.note && <span style={{ fontStyle: 'italic' }}> · {line.note}</span>}
                  </div>
                </div>
                <div className="pos-line-total serif tnum">
                  £{Math.round(line.price).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="pos-totals">
            <div className="pos-totals-row">
              <span>Subtotal</span>
              <span className="tnum">£{Math.round(subtotal).toLocaleString()}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="pos-totals-row pos-totals-discount">
                <span>Discount</span>
                <span className="tnum">− £{Math.round(totalDiscount).toLocaleString()}</span>
              </div>
            )}
            <div className="pos-totals-row">
              <span>VAT 14%</span>
              <span className="tnum">£{tax.toLocaleString()}</span>
            </div>
          </div>

          {/* Hero total */}
          <div className="pos-hero-total">
            <span className="pos-hero-kicker">Total · EGP</span>
            <div className="pos-hero-amount serif tnum">
              <span className="cur">£</span>{Math.round(total).toLocaleString()}
            </div>
          </div>

          {/* Pay */}
          <button
            className="pos-pay"
            disabled={cart.length === 0}
            onClick={() => setPayOpen(true)}
          >
            <span className="pos-pay-label serif">
              {lang === 'ar' ? 'الدفع' : 'Pay'}
            </span>
            <span className="pos-pay-amount serif tnum">
              £{Math.round(total).toLocaleString()}
            </span>
          </button>
        </aside>
      </div>

      {payOpen && <PaymentSheet total={total} onClose={() => setPayOpen(false)} onConfirm={() => { setPayOpen(false); clearCart(); }} lang={lang} />}
      {lineSheet && <LineEditSheet line={lineSheet} onClose={() => setLineSheet(null)}
                                   onUpdate={patch => { updateLine(lineSheet.id, patch); setLineSheet(null); }}
                                   onRemove={() => { removeLine(lineSheet.id); setLineSheet(null); }} />}
      {heldOpen && (
        <HeldSalesTray held={held} onClose={() => setHeldOpen(false)}
                       onResume={(h) => { setHeld(prev => prev.filter(x => x.id !== h.id)); setHeldOpen(false); }}
                       onDelete={(h) => setHeld(prev => prev.filter(x => x.id !== h.id))} />
      )}

      <style>{POS_CSS}</style>
    </div>
  );
}

// ─── Empty basket illustration ──────────────────────────────────────────
function EmptyBasket() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 26h44l-4 26a4 4 0 0 1-4 3.5H22a4 4 0 0 1-4-3.5L14 26z" />
      <path d="M22 26L30 12M50 26L42 12" />
      <path d="M14 26h44" />
      <path d="M28 38v8M44 38v8M36 38v8" opacity="0.6" />
    </svg>
  );
}

// ─── Line edit sheet — tap a cart line to open ──────────────────────────
function LineEditSheet({ line, onClose, onUpdate, onRemove }) {
  const [qty, setQty] = useStateCk(line.qty);
  const [discount, setDiscount] = useStateCk(line.discount || 0);
  const [note, setNote] = useStateCk(line.note || '');
  const newPrice = line.p.price * qty * (1 - discount / 100);

  return (
    <div className="pos-modal-bg" onClick={onClose}>
      <div className="pos-modal" onClick={e => e.stopPropagation()}>
        <header className="pos-modal-head">
          <div>
            <span className="kicker">Edit line</span>
            <h3 className="serif">{line.p.name}</h3>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              £{line.p.price} each · SKU <span style={{ fontFamily: 'var(--mono)' }}>{line.p.sku}</span>
            </div>
          </div>
          <button className="tb-icon-btn" onClick={onClose}><Icons.X size={14} /></button>
        </header>

        <div style={{ padding: '20px 24px' }}>
          {/* Qty number pad */}
          <div className="kicker" style={{ marginBottom: 8 }}>Quantity</div>
          <div className="pos-numpad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, '−', 0, '⌫'].map(k => (
              <button key={k} onClick={() => {
                if (k === '−') setQty(q => Math.max(1, q - 1));
                else if (k === '⌫') setQty(q => Math.max(1, Math.floor(q / 10) || 1));
                else setQty(q => (q < 10 ? q * 10 + Number(k) : Number(k)));
              }}>{k}</button>
            ))}
          </div>
          <div className="pos-numpad-display">
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Qty</span>
            <span className="serif tnum" style={{ fontSize: 36, fontWeight: 500 }}>{qty}</span>
          </div>

          {/* Discount */}
          <div className="kicker" style={{ marginTop: 18, marginBottom: 8 }}>Line discount</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 5, 10, 15, 20].map(d => (
              <button key={d} className="chip" data-active={discount === d}
                      onClick={() => setDiscount(d)} style={{ cursor: 'pointer', flex: 1, justifyContent: 'center' }}>
                {d === 0 ? 'None' : `${d}%`}
              </button>
            ))}
          </div>

          {/* Note */}
          <div className="kicker" style={{ marginTop: 18, marginBottom: 6 }}>Note for kitchen</div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. oat milk, no sugar"
                 className="madar-input" style={{ width: '100%' }} />
        </div>

        <footer className="pos-modal-foot">
          <button className="btn" style={{ color: 'var(--rose)', borderColor: 'color-mix(in oklab, var(--rose) 30%, var(--rule))' }} onClick={onRemove}>
            <Icons.X size={12} />Remove line
          </button>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: 'end', marginInlineEnd: 12 }}>
            <div className="kicker">New total</div>
            <div className="serif tnum" style={{ fontSize: 22, fontWeight: 500 }}>£{Math.round(newPrice)}</div>
          </div>
          <button className="btn btn-primary" onClick={() => onUpdate({ qty, discount, note })}>
            <Icons.Check size={12} />Update
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Held sales tray ────────────────────────────────────────────────────
function HeldSalesTray({ held, onClose, onResume, onDelete }) {
  return (
    <div className="pos-modal-bg" onClick={onClose}>
      <div className="pos-modal pos-held-tray" onClick={e => e.stopPropagation()}>
        <header className="pos-modal-head">
          <div>
            <span className="kicker">Parked tickets</span>
            <h3 className="serif">Held sales · {held.length}</h3>
          </div>
          <button className="tb-icon-btn" onClick={onClose}><Icons.X size={14} /></button>
        </header>
        <div style={{ padding: '0 8px 8px' }}>
          {held.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              No held sales. Use <strong>Hold</strong> in the cart to park a ticket for later.
            </div>
          ) : held.map(h => (
            <div key={h.id} className="pos-held-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{h.who}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  <strong className="tnum">{h.items}</strong> items · held {h.time}
                </div>
              </div>
              <div className="serif tnum" style={{ fontSize: 22, fontWeight: 500, marginInlineEnd: 12 }}>£{h.total}</div>
              <button className="btn btn-sm btn-primary" onClick={() => onResume(h)}>
                <Icons.ArrowRight size={12} />Resume
              </button>
              <button className="tb-icon-btn" onClick={() => onDelete(h)} title="Discard">
                <Icons.X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CSS — POS-specific styling ─────────────────────────────────────────
const POS_CSS = `
.pos {
  display: flex; flex-direction: column;
  height: 100vh; width: 100%;
  background: var(--bg);
}

/* slim 48px header */
.pos-head {
  height: 48px;
  display: flex; align-items: center;
  padding: 0 20px;
  background: var(--bg);
  border-bottom: 1px solid var(--rule);
  font-size: 12.5px;
  gap: 14px;
  flex-shrink: 0;
}
.pos-head-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.pos-head-right { display: flex; align-items: center; gap: 8px; }
.pos-shift-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--sage);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--sage) 22%, transparent);
  flex-shrink: 0;
}
.pos-meta { display: flex; gap: 8px; align-items: center; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pos-meta strong { font-weight: 500; color: var(--ink); }
.pos-sep { color: var(--ink-4); }
.pos-clock {
  font-size: 13px; font-weight: 500; color: var(--ink);
  font-family: var(--mono);
  padding: 4px 10px; border-radius: 6px;
  background: var(--paper);
}
.pos-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px 5px 10px;
  border-radius: 100px;
  border: 1px solid var(--rule);
  background: var(--bg-elev);
  font-size: 12px; color: var(--ink-2);
  cursor: pointer; position: relative;
  font-family: inherit;
}
.pos-pill:hover { background: var(--paper); border-color: var(--ink-4); }
.pos-pill[aria-pressed="true"] {
  background: var(--accent-soft); color: var(--accent-ink); border-color: var(--accent-soft);
}
.pos-pill-badge {
  background: var(--accent); color: #fff;
  font-size: 10.5px; font-weight: 600;
  padding: 1px 6px; border-radius: 100px;
  min-width: 18px; text-align: center;
}

/* body */
.pos-body {
  flex: 1;
  display: grid;
  grid-template-columns: 60% 40%;
  min-height: 0;
}

/* ── LEFT side — products ── */
.pos-products {
  display: flex; flex-direction: column;
  background: var(--bg);
  min-width: 0;
  min-height: 0;
}

.pos-search-row { padding: 16px 24px 8px; }
.pos-search {
  height: 56px;
  display: flex; align-items: center; gap: 12px;
  background: var(--bg-elev);
  border: 1.5px solid var(--rule);
  border-radius: 12px;
  padding: 0 18px;
  transition: border-color .15s, box-shadow .15s;
  position: relative;
}
.pos-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 18%, transparent);
}
.pos-search svg { color: var(--ink-3); flex-shrink: 0; }
.pos-search input {
  flex: 1; height: 100%;
  border: 0; outline: 0;
  background: transparent;
  font-family: var(--serif);
  font-size: 19px;
  letter-spacing: -0.005em;
  color: var(--ink);
}
.pos-search input::placeholder { color: var(--ink-4); }
.pos-search-clear {
  border: 0; background: var(--bg-sunk);
  width: 28px; height: 28px; border-radius: 50%;
  display: grid; place-items: center;
  color: var(--ink-3); cursor: pointer;
}
.pos-search-clear:hover { background: var(--rule); color: var(--ink); }

.pos-cats {
  display: flex; gap: 6px;
  padding: 8px 24px 14px;
  overflow-x: auto;
  flex-shrink: 0;
}
.pos-cat {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px;
  border-radius: 100px;
  border: 1px solid var(--rule);
  background: var(--bg-elev);
  color: var(--ink-2);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background .12s, color .12s, border-color .12s;
}
.pos-cat:hover { border-color: var(--ink-4); color: var(--ink); }
.pos-cat[data-active="true"] {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.pos-cat-count {
  font-size: 10.5px;
  color: var(--ink-4);
  background: var(--bg-sunk);
  padding: 1px 6px;
  border-radius: 100px;
  font-weight: 500;
}
.pos-cat[data-active="true"] .pos-cat-count {
  color: var(--accent-ink);
  background: color-mix(in oklab, #fff 75%, transparent);
}

/* Grid */
.pos-grid-wrap { flex: 1; overflow-y: auto; padding: 4px 24px 24px; min-height: 0; }
.pos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.pos-tile {
  background: var(--bg-elev);
  border: 1px solid var(--rule);
  border-radius: 12px;
  padding: 10px;
  display: flex; flex-direction: column;
  text-align: start;
  cursor: pointer;
  font-family: inherit; color: inherit;
  transition: transform .08s ease, border-color .12s ease, box-shadow .15s ease;
}
.pos-tile:hover {
  border-color: var(--ink-4);
  box-shadow: var(--shadow-sm);
}
.pos-tile:active {
  transform: scale(0.97);
  border-color: var(--accent);
}
.pos-tile-visual {
  aspect-ratio: 1.15 / 1;
  border-radius: 8px;
  margin-bottom: 10px;
  position: relative; overflow: hidden;
  display: grid; place-items: center;
}
.pos-tile-mark {
  font-size: 28px; font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
  letter-spacing: -0.02em;
  text-transform: capitalize;
}
.pos-tile-name {
  font-size: 13px; font-weight: 500;
  line-height: 1.3;
  color: var(--ink);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 34px;
  margin-bottom: 6px;
}
.pos-tile-price {
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--ink);
  font-feature-settings: "tnum";
}
.pos-tile-price .cur {
  font-size: 0.7em;
  color: var(--ink-3);
  margin-inline-end: 2px;
}

.pos-grid-empty {
  text-align: center; padding: 80px 20px; color: var(--ink-3);
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.pos-grid-empty p { font-size: 17px; color: var(--ink); margin: 0; }

/* ── RIGHT side — cart ── */
.pos-cart {
  background: var(--paper);
  border-inline-start: 1px solid var(--rule);
  display: flex; flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.pos-cart-head {
  padding: 16px 22px 10px;
  display: flex; align-items: baseline; gap: 8px;
}
.pos-cart-head h2 {
  margin: 0;
  font-family: var(--serif);
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -0.015em;
}
.pos-link {
  border: 0; background: transparent;
  font-family: inherit;
  font-size: 12px;
  color: var(--ink-3);
  padding: 4px 8px;
  cursor: pointer;
  border-radius: 6px;
  display: inline-flex; align-items: center; gap: 4px;
}
.pos-link:hover { color: var(--ink); background: var(--bg-elev); }

.pos-customer {
  display: flex; align-items: center; gap: 10px;
  margin: 0 22px 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-elev);
  border: 1px solid var(--rule);
  font-family: inherit; color: inherit;
  cursor: pointer;
  transition: border-color .12s;
}
.pos-customer:hover { border-color: var(--ink-4); }
.pos-customer-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--accent); color: #fff;
  display: grid; place-items: center;
  font-size: 13px; flex-shrink: 0;
}
.pos-customer-avatar-empty {
  background: var(--bg-sunk); color: var(--ink-3);
}

.pos-cart-lines {
  flex: 1; overflow-y: auto;
  padding: 8px 14px;
  min-height: 0;
}

.pos-empty {
  text-align: center;
  padding: 56px 24px;
  color: var(--ink-3);
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.pos-empty svg { color: var(--ink-4); opacity: 0.6; margin-bottom: 6px; }
.pos-empty p {
  font-size: 19px;
  color: var(--ink);
  margin: 0;
  font-weight: 500;
  letter-spacing: -0.01em;
  text-wrap: balance;
}
.pos-empty span {
  font-size: 12.5px;
  color: var(--ink-3);
  max-width: 240px;
  line-height: 1.55;
  text-wrap: pretty;
}
.pos-empty kbd {
  font-family: var(--mono); font-size: 10px;
  background: var(--bg-elev); padding: 1px 5px; border-radius: 3px;
  border: 1px solid var(--rule); color: var(--ink-3);
  margin: 0 2px;
}

.pos-line {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px 8px;
  border-bottom: 1px solid var(--rule-2);
  cursor: pointer;
  border-radius: 8px;
  transition: background .12s;
}
.pos-line:hover { background: var(--bg-elev); }
.pos-line:last-child { border-bottom: 0; }

.pos-line-qty {
  display: flex; align-items: center;
  background: var(--bg-elev);
  border: 1px solid var(--rule);
  border-radius: 10px;
  overflow: hidden;
  height: 36px;
}
.pos-line-qty button {
  border: 0; background: transparent;
  width: 30px; height: 100%;
  display: grid; place-items: center;
  cursor: pointer;
  color: var(--ink-2);
}
.pos-line-qty button:hover { background: var(--paper); color: var(--ink); }
.pos-line-qty span {
  min-width: 28px; text-align: center;
  font-size: 14px; font-weight: 500;
  padding: 0 2px;
}

.pos-line-body { min-width: 0; }
.pos-line-name {
  font-size: 14px; font-weight: 500;
  letter-spacing: -0.005em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pos-line-sub {
  font-size: 11.5px; color: var(--ink-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pos-line-total {
  font-size: 20px; font-weight: 500;
  letter-spacing: -0.005em;
  min-width: 60px; text-align: end;
}

.pos-totals {
  padding: 12px 22px 4px;
  border-top: 1px solid var(--rule);
}
.pos-totals-row {
  display: flex; justify-content: space-between;
  font-size: 13px; color: var(--ink-2);
  padding: 3px 0;
  font-variant-numeric: tabular-nums;
}
.pos-totals-discount { color: var(--accent); }

.pos-hero-total {
  padding: 8px 22px 14px;
  display: flex; align-items: baseline; justify-content: space-between;
}
.pos-hero-kicker {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.pos-hero-amount {
  font-size: 56px;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.pos-hero-amount .cur {
  font-size: 0.45em;
  color: var(--ink-3);
  margin-inline-end: 4px;
  font-weight: 400;
}

.pos-pay {
  margin: 14px 18px 18px;
  height: 64px;
  border: 0; border-radius: 14px;
  background: var(--accent);
  color: #fff;
  font-family: inherit;
  cursor: pointer;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 26px;
  font-size: 24px;
  letter-spacing: -0.01em;
  transition: background .12s, transform .08s;
  box-shadow: 0 1px 0 rgba(26,23,20,0.04), 0 4px 12px color-mix(in oklab, var(--accent) 25%, transparent);
}
.pos-pay:hover { background: var(--accent-ink); }
.pos-pay:active { transform: scale(0.985); }
.pos-pay:disabled {
  opacity: 0.4; cursor: not-allowed;
  background: var(--ink-3); box-shadow: none;
}
.pos-pay-label { font-size: 22px; font-weight: 500; opacity: 0.9; }
.pos-pay-amount { font-size: 28px; font-weight: 500; }

/* Modals/sheets used by POS */
.pos-modal-bg {
  position: fixed; inset: 0;
  background: rgba(26,23,20,0.45);
  z-index: 80;
  display: grid; place-items: center;
}
.pos-modal {
  background: var(--bg-elev);
  border-radius: 16px;
  width: 440px; max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column;
  animation: fadeUp .2s ease-out;
}
.pos-modal-head {
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--rule);
  display: flex; align-items: flex-start; gap: 12px;
}
.pos-modal-head h3 {
  margin: 4px 0 2px;
  font-size: 20px; font-weight: 500; letter-spacing: -0.01em;
}
.pos-modal-foot {
  padding: 14px 18px;
  border-top: 1px solid var(--rule);
  background: var(--paper);
  display: flex; align-items: center; gap: 8px;
}

/* Number pad */
.pos-numpad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.pos-numpad button {
  height: 44px; border: 1px solid var(--rule);
  background: var(--bg);
  border-radius: 10px;
  font-family: var(--serif); font-size: 19px; font-weight: 500;
  cursor: pointer; color: var(--ink);
  transition: background .1s, transform .06s;
}
.pos-numpad button:hover { background: var(--paper); border-color: var(--ink-4); }
.pos-numpad button:active { transform: scale(0.96); }
.pos-numpad-display {
  margin-top: 10px;
  padding: 10px 14px;
  display: flex; align-items: baseline; justify-content: space-between;
  background: var(--bg-sunk);
  border: 1px solid var(--rule);
  border-radius: 10px;
}

/* Held tray */
.pos-held-tray { width: 540px; }
.pos-held-row {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  margin: 4px 0;
}
.pos-held-row:hover { background: var(--paper); }
`;

// ─── Payment sheet — split payment + bank receipt ───────────────────────
function PaymentSheet({ total, onClose, onConfirm, lang }) {
  const [splits, setSplits] = useStateCk([{ method: 'cash', amount: total }]);
  const [receiptRef, setReceiptRef] = useStateCk('');
  const [receiptUploaded, setReceiptUploaded] = useStateCk(false);
  const [stage, setStage] = useStateCk('compose');
  const [cashTendered, setCashTendered] = useStateCk(Math.ceil(total / 100) * 100);

  const paid = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const remaining = total - paid;
  const hasTransfer = splits.some(s => s.method === 'tx');
  const hasCashOnly = splits.length === 1 && splits[0].method === 'cash';
  const change = cashTendered - total;
  const canConfirm = Math.abs(remaining) < 0.5 && (!hasTransfer || (receiptRef && receiptUploaded));

  const setSplitMethod = (i, m) => setSplits(s => s.map((x, j) => j === i ? { ...x, method: m } : x));
  const setSplitAmount = (i, a) => setSplits(s => s.map((x, j) => j === i ? { ...x, amount: Number(a) || 0 } : x));
  const addSplit = () => setSplits(s => [...s, { method: 'card', amount: Math.max(0, total - paid) }]);
  const removeSplit = (i) => setSplits(s => s.filter((_, j) => j !== i));

  return (
    <div className="pos-modal-bg" onClick={onClose}>
      <div className="pos-modal" onClick={e => e.stopPropagation()} style={{ width: 500 }}>
        <header className="pos-modal-head">
          <div style={{ flex: 1 }}>
            <span className="kicker">Payment · Ticket #2848</span>
            <div className="serif tnum" style={{ fontSize: 42, fontWeight: 500, marginTop: 4, letterSpacing: '-0.025em', lineHeight: 1 }}>
              <span style={{ fontSize: '0.5em', color: 'var(--ink-3)', marginInlineEnd: 4 }}>£</span>
              {Math.round(total).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: remaining > 0.5 ? 'var(--rose)' : 'var(--sage)', marginTop: 4 }}>
              {Math.abs(remaining) < 0.5 ? '✓ Fully covered' :
               remaining > 0 ? `£${remaining.toFixed(0)} remaining` : `£${(-remaining).toFixed(0)} change due`}
            </div>
          </div>
          <button className="tb-icon-btn" onClick={onClose}><Icons.X size={14} /></button>
        </header>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          {stage === 'compose' && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="kicker">Split across methods</span>
                <button className="btn btn-sm btn-ghost" onClick={addSplit}><Icons.Plus size={11} />Add split</button>
              </div>
              {splits.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px auto', gap: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 4, background: 'var(--bg-sunk)', padding: 3, borderRadius: 8 }}>
                    {window.MADAR_DATA.PAYMENT_METHODS.map(m => (
                      <button key={m.id} onClick={() => setSplitMethod(i, m.id)}
                        style={{
                          flex: 1, padding: '7px 8px', borderRadius: 6, border: 0,
                          background: s.method === m.id ? 'var(--bg-elev)' : 'transparent',
                          color: s.method === m.id ? 'var(--ink)' : 'var(--ink-3)',
                          fontWeight: s.method === m.id ? 500 : 400,
                          fontSize: 12, cursor: 'pointer',
                          boxShadow: s.method === m.id ? 'var(--shadow-sm)' : 'none',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                          fontFamily: 'inherit',
                        }}>
                        {m.icon === 'cash' && <Icons.Cash size={12} />}
                        {m.icon === 'card' && <Icons.Card size={12} />}
                        {m.icon === 'bank' && <Icons.Bank size={12} />}
                        {m.short}
                      </button>
                    ))}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)',
                                   color: 'var(--ink-3)', fontSize: 13 }}>£</span>
                    <input type="number" value={s.amount} onChange={e => setSplitAmount(i, e.target.value)}
                      className="tnum"
                      style={{ width: '100%', padding: '8px 10px 8px 22px', borderRadius: 8,
                               border: '1px solid var(--rule)', background: 'var(--bg)', fontSize: 14, outline: 'none' }} />
                  </div>
                  {splits.length > 1 && (
                    <button className="tb-icon-btn" onClick={() => removeSplit(i)}><Icons.X size={12} /></button>
                  )}
                </div>
              ))}

              {/* Cash quick-tap chips if only cash */}
              {hasCashOnly && (
                <div style={{ marginTop: 14 }}>
                  <div className="kicker" style={{ marginBottom: 6 }}>Cash tendered — quick amounts</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { v: total, l: 'Exact' },
                      { v: Math.ceil(total / 50) * 50, l: '↑50' },
                      { v: Math.ceil(total / 100) * 100, l: '↑100' },
                      { v: 200, l: '£200' },
                      { v: 500, l: '£500' },
                    ].filter(c => c.v >= total).map((c, i) => (
                      <button key={i} className="chip" data-active={cashTendered === c.v}
                              onClick={() => setCashTendered(c.v)} style={{ cursor: 'pointer' }}>
                        {c.l} {c.l !== 'Exact' ? '' : ''}<span className="tnum" style={{ color: 'var(--ink-3)', marginInlineStart: 4 }}>£{c.v}</span>
                      </button>
                    ))}
                  </div>
                  {change > 0 && (
                    <div style={{
                      marginTop: 10, padding: 12, borderRadius: 8,
                      background: 'var(--sage-soft)', color: 'var(--sage)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    }}>
                      <span className="kicker" style={{ color: 'var(--sage)' }}>Change due</span>
                      <span className="serif tnum" style={{ fontSize: 22, fontWeight: 500 }}>£{change}</span>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" disabled={Math.abs(remaining) > 0.5}
                        onClick={() => hasTransfer ? setStage('receipt') : onConfirm()}
                        style={{ flex: 2, justifyContent: 'center', opacity: Math.abs(remaining) > 0.5 ? 0.4 : 1 }}>
                  {hasTransfer ? 'Continue to receipt' : 'Complete sale'}
                </button>
              </div>
            </>
          )}

          {stage === 'receipt' && (
            <>
              <div className="kicker" style={{ marginBottom: 4 }}>Bank receipt</div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 0, lineHeight: 1.55, textWrap: 'pretty' }}>
                Customer paid by bank transfer. Enter the reference number and capture the receipt — a manager will verify it daily.
              </p>

              <label style={{ fontSize: 11.5, color: 'var(--ink-3)', display: 'block', marginTop: 12, marginBottom: 4, fontWeight: 500 }}>
                Transaction reference
              </label>
              <input value={receiptRef} onChange={e => setReceiptRef(e.target.value)}
                placeholder="e.g. CIB-2026-0508-94821"
                className="tnum"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8,
                         border: '1px solid var(--rule)', background: 'var(--bg)', fontSize: 14, outline: 'none' }} />

              <div style={{ marginTop: 12 }}>
                <button onClick={() => setReceiptUploaded(true)}
                  style={{
                    width: '100%', padding: 16, borderRadius: 10,
                    border: receiptUploaded ? '1.5px solid var(--sage)' : '1.5px dashed var(--rule)',
                    background: receiptUploaded ? 'color-mix(in oklab, var(--sage-soft) 60%, var(--bg))' : 'var(--bg-sunk)',
                    color: receiptUploaded ? 'var(--sage)' : 'var(--ink-3)',
                    fontSize: 13, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontFamily: 'inherit',
                  }}>
                  {receiptUploaded ? (
                    <><Icons.Check size={16} /> Receipt captured · receipt-2848.jpg</>
                  ) : (
                    <><Icons.Camera size={16} /> Capture or upload receipt</>
                  )}
                </button>
              </div>

              <div style={{ background: 'var(--bg-sunk)', border: '1px solid var(--rule)', borderRadius: 10,
                            padding: 12, marginTop: 12, display: 'flex', gap: 10, fontSize: 12, color: 'var(--ink-2)' }}>
                <Icons.Bank size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  This sale will be marked <strong>Pending</strong> until verified. It appears in <strong>Reconciliation</strong>; managers verify daily against the bank statement.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStage('compose')}>Back</button>
                <button className="btn btn-primary" disabled={!canConfirm} onClick={onConfirm}
                        style={{ flex: 2, justifyContent: 'center', opacity: canConfirm ? 1 : 0.4 }}>
                  Save sale · {receiptRef ? 'Pending verification' : 'Confirm'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

window.Checkout = Checkout;
