// Madar — Inventory screen.
// Long, dense table — but with character: hover left-border, glanceable bars.

const { useState: useStateInv, useMemo: useMemoInv } = React;

function Inventory({ branch, lang, onAIToggle }) {
  const D = window.MADAR_DATA;
  const [cat, setCat] = useStateInv('all');
  const [stockFilter, setStockFilter] = useStateInv('all'); // all | low | ok
  const [sort, setSort] = useStateInv({ key: 'name', dir: 'asc' });
  const [selected, setSelected] = useStateInv([]);
  const [search, setSearch] = useStateInv('');

  const rows = useMemoInv(() => {
    let r = D.PRODUCTS.filter(p =>
      (cat === 'all' || p.cat === cat) &&
      (stockFilter === 'all' || (stockFilter === 'low' && p.stock < p.low) || (stockFilter === 'ok' && p.stock >= p.low)) &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
    );
    r = [...r].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (typeof av === 'number') return sort.dir === 'asc' ? av - bv : bv - av;
      return sort.dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return r;
  }, [cat, stockFilter, sort, search]);

  const totalValue = D.PRODUCTS.reduce((s, p) => s + p.cost * p.stock, 0);
  const lowCount = D.PRODUCTS.filter(p => p.stock < p.low).length;

  const sortBy = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  const SortIcon = ({ k }) => sort.key !== k ? null : (sort.dir === 'asc' ? <Icons.ArrowUp size={10} /> : <Icons.ArrowDown size={10} />);

  return (
    <div className="content-inner">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <span className="kicker">Inventory</span>
          <h1 className="serif" style={{ margin: '6px 0 0', fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Catalog & stock
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            <strong className="tnum">{D.PRODUCTS.length}</strong> SKUs ·
            <strong className="tnum"> £{totalValue.toLocaleString()}</strong> on-hand value ·
            <strong className="tnum"> {lowCount}</strong> low-stock
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm"><Icons.Download size={13} />Export</button>
          <button className="btn btn-sm"><Icons.Box size={13} />Stock transfer</button>
          <button className="btn btn-sm btn-primary"><Icons.Plus size={13} />New product</button>
        </div>
      </header>

      {/* AI nudge */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px',
        background: 'color-mix(in oklab, var(--accent-soft) 30%, var(--bg-elev))',
        borderColor: 'color-mix(in oklab, var(--accent) 30%, var(--rule))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icons.Sparkles size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5, color: 'var(--ink)' }}>
            <strong>3 SKUs</strong> will run out within 7 days. Madar suggests reordering <strong>Yirgacheffe (120)</strong>,
            <strong> Kenya AA (60)</strong>, and <strong>Geisha (24)</strong> — bundled into one PO with Sidamo Direct.
          </div>
          <button className="btn btn-sm btn-primary">Review reorder</button>
          <button className="btn btn-sm btn-ghost" onClick={onAIToggle}>Why?</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="chip" data-active={cat === 'all'} onClick={() => setCat('all')} style={{ cursor: 'pointer' }}>All categories</button>
        {D.PRODUCT_CATEGORIES.map(c => (
          <button key={c.id} className="chip" data-active={cat === c.id} onClick={() => setCat(c.id)} style={{ cursor: 'pointer' }}>
            {c.name} <span style={{ color: 'var(--ink-4)', marginInlineStart: 4 }}>{c.count}</span>
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: 'var(--rule)', margin: '0 4px' }} />
        <button className="chip" data-active={stockFilter === 'low'} onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')} style={{ cursor: 'pointer' }}>
          <span style={{ width: 6, height: 6, borderRadius: 50, background: 'var(--rose)' }} /> Low stock
        </button>
        <span style={{ flex: 1 }} />
        <div className="tb-search" style={{ width: 280 }}>
          <Icons.Search size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU, name, barcode…" />
        </div>
      </div>

      {selected.length > 0 && (
        <div style={{ marginBottom: 10, padding: '8px 14px', background: 'var(--accent-soft)',
                      border: '1px solid var(--accent)', borderRadius: 10,
                      display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <strong style={{ color: 'var(--accent-ink)' }}>{selected.length} selected</strong>
          <button className="btn btn-sm">Edit price</button>
          <button className="btn btn-sm">Adjust stock</button>
          <button className="btn btn-sm">Print labels</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm btn-ghost" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--rule)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} className="tnum">
          <thead>
            <tr style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)' }}>
              <th style={thStyle('checkbox')}>
                <input type="checkbox" checked={selected.length === rows.length && rows.length > 0}
                       onChange={e => setSelected(e.target.checked ? rows.map(r => r.id) : [])} />
              </th>
              <th style={thStyle()} onClick={() => sortBy('sku')}>SKU <SortIcon k="sku" /></th>
              <th style={{ ...thStyle(), width: '32%' }} onClick={() => sortBy('name')}>Product <SortIcon k="name" /></th>
              <th style={thStyle('right')} onClick={() => sortBy('price')}>Price <SortIcon k="price" /></th>
              <th style={thStyle('right')} onClick={() => sortBy('cost')}>Cost <SortIcon k="cost" /></th>
              <th style={{ ...thStyle('right'), width: 80 }}>Margin</th>
              <th style={{ ...thStyle('left'), width: 200 }} onClick={() => sortBy('stock')}>Stock <SortIcon k="stock" /></th>
              <th style={{ ...thStyle('right'), width: 80 }} onClick={() => sortBy('vel')}>Vel/wk <SortIcon k="vel" /></th>
              <th style={thStyle('right', { width: 56 })}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const isLow = p.stock < p.low;
              const margin = ((p.price - p.cost) / p.price * 100).toFixed(0);
              const stockPct = Math.min(100, (p.stock / Math.max(p.low * 2.5, p.stock)) * 100);
              const isSel = selected.includes(p.id);
              return (
                <tr key={p.id}
                  className="inv-row"
                  data-low={isLow}
                  data-sel={isSel}
                  style={{
                    borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--rule)',
                    background: isSel ? 'color-mix(in oklab, var(--accent-soft) 40%, var(--bg-elev))' : 'transparent'
                  }}>
                  <td style={{ ...tdStyle(), position: 'relative' }}>
                    <input type="checkbox" checked={isSel}
                           onChange={() => setSelected(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])} />
                  </td>
                  <td style={{ ...tdStyle(), color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 11.5 }}>{p.sku}</td>
                  <td style={tdStyle()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        background: `linear-gradient(135deg, ${p.color}, color-mix(in oklab, ${p.color} 55%, #1A1714))`
                      }} />
                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                          {D.PRODUCT_CATEGORIES.find(c => c.id === p.cat)?.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={tdStyle('right')}>£{p.price}</td>
                  <td style={{ ...tdStyle('right'), color: 'var(--ink-3)' }}>£{p.cost}</td>
                  <td style={{ ...tdStyle('right'), color: 'var(--sage)' }}>{margin}%</td>
                  <td style={tdStyle('left')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ minWidth: 36, fontWeight: 500, color: isLow ? 'var(--rose)' : 'var(--ink)' }}>{p.stock}</span>
                      <div style={{ flex: 1, maxWidth: 100, height: 4, background: 'var(--rule)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${stockPct}%`, height: '100%',
                                      background: isLow ? 'var(--rose)' : 'var(--sage)' }} />
                      </div>
                      {isLow && <span style={{ fontSize: 10.5, color: 'var(--rose)', fontWeight: 500 }}>Low</span>}
                    </div>
                  </td>
                  <td style={{ ...tdStyle('right'), color: 'var(--ink-2)' }}>{p.vel}</td>
                  <td style={tdStyle('right')}>
                    <button className="tb-icon-btn" style={{ width: 24, height: 24 }}><Icons.More size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14,
                     fontSize: 12, color: 'var(--ink-3)' }}>
        <span>Showing {rows.length} of {D.PRODUCTS.length}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm btn-ghost"><Icons.ChevronLeft size={12} /></button>
          <button className="chip" data-active>1</button>
          <button className="chip">2</button>
          <button className="chip">3</button>
          <button className="btn btn-sm btn-ghost"><Icons.ChevronRight size={12} /></button>
        </div>
      </div>

      <style>{`
        .inv-row { position: relative; transition: background .12s; }
        .inv-row:hover { background: color-mix(in oklab, var(--accent-soft) 22%, var(--bg-elev)) !important; }
        .inv-row::before {
          content: ""; position: absolute; inset-inline-start: 0; top: 0; bottom: 0;
          width: 0; background: var(--accent); transition: width .12s;
        }
        .inv-row:hover::before { width: 2px; }
        .inv-row[data-low="true"]::before { width: 2px; background: var(--rose); }
        .inv-row[data-sel="true"]::before { width: 2px; background: var(--accent); }
      `}</style>
    </div>
  );
}

const thStyle = (align = 'left', extra = {}) => ({
  textAlign: align === 'right' ? 'end' : 'start',
  padding: '12px 14px',
  fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--ink-3)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  ...extra,
});
const tdStyle = (align = 'left') => ({
  padding: '14px',
  textAlign: align === 'right' ? 'end' : 'start',
  color: 'var(--ink-2)',
  verticalAlign: 'middle',
});

window.Inventory = Inventory;
