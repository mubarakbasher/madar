// Shared UI components for Madar — Sidebar, Topbar, KPI, Sparkline, AI bits.
// Loaded as <script type="text/babel">. Globals exposed at bottom.

const { useState: useStateC, useEffect: useEffectC, useRef: useRefC, useMemo: useMemoC } = React;

// ─── Sidebar ───────────────────────────────────────────────────────────
function Sidebar({ active, onNav, t }) {
  const sections = [
    { title: 'Operations', items: [
      { id: 'dashboard', label: 'Dashboard',     Icon: Icons.Dashboard },
      { id: 'checkout',  label: 'Checkout',      Icon: Icons.Cart, badge: 'Live' },
      { id: 'sales',     label: 'Sales records', Icon: Icons.Receipt },
      { id: 'inventory', label: 'Inventory',     Icon: Icons.Box },
      { id: 'transfers', label: 'Stock transfers', Icon: Icons.Refresh },
    ]},
    { title: 'Network', items: [
      { id: 'suppliers', label: 'Suppliers',       Icon: Icons.Truck },
      { id: 'purchases', label: 'Purchase orders', Icon: Icons.Send },
      { id: 'branches',  label: 'Branches',        Icon: Icons.MapPin },
    ]},
    { title: 'Money', items: [
      { id: 'reconcile', label: 'Reconciliation', Icon: Icons.Cash, badge: '12' },
      { id: 'analysis',  label: 'Income & analysis', Icon: Icons.Chart },
      { id: 'billing',   label: 'Billing',         Icon: Icons.Bank },
    ]},
  ];
  const foot = [
    { id: 'settings', label: 'Settings', Icon: Icons.Settings },
    { id: 'help',     label: 'Help',     Icon: Icons.Help },
  ];
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-mark">M</div>
        <div className="sb-name">Madar<small>POS · v1</small></div>
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
        <div className="sb-merchant-avatar">B</div>
        <div className="sb-merchant-meta">
          <b>Bayt Coffee Co.</b>
          <small>5 branches · Cairo</small>
        </div>
      </div>

      <div className="sb-foot">
        {foot.map(({ id, label, Icon }) => (
          <button key={id} className="sb-item" onClick={() => onNav(id)}>
            <Icon className="sb-ico" />
            <span className="sb-foot-label sb-item-label">{label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

// ─── Topbar ─────────────────────────────────────────────────────────────
function Topbar({ crumb, sub, onAIToggle, online, syncCount, branch, onBranchChange, lang, onLangToggle, onNotifToggle, notifOpen }) {
  return (
    <div className="topbar">
      <div className="tb-crumb">
        <span className="serif">{crumb}</span>
        {sub && <span className="tb-crumb-sub"> · {sub}</span>}
      </div>
      <div className="tb-spacer" />

      <div className="tb-search">
        <Icons.Search size={14} />
        <input placeholder={lang === 'ar' ? 'ابحث عن منتج، طلب، أو فرع…' : 'Search products, orders, branches…'} />
        <kbd>⌘K</kbd>
      </div>

      <BranchSwitcher value={branch} onChange={onBranchChange} />

      <div className="tb-pill" data-state={online ? (syncCount > 0 ? 'syncing' : 'online') : 'offline'}>
        <span className="dot" />
        {online ? (syncCount > 0 ? `Syncing ${syncCount}` : 'Live') : `Offline · ${syncCount} queued`}
      </div>

      <button className="tb-icon-btn" onClick={onLangToggle} title={lang === 'ar' ? 'English' : 'العربية'}>
        <Icons.Globe size={16} />
      </button>
      <button className="tb-icon-btn" title="Notifications" onClick={onNotifToggle} aria-pressed={notifOpen}>
        <Icons.Bell size={16} />
        <span className="badge" />
      </button>
      <button className="tb-icon-btn" onClick={onAIToggle} title="Ask Madar">
        <Icons.Sparkles size={16} />
      </button>
      <div className="tb-avatar">O</div>
    </div>
  );
}

function BranchSwitcher({ value, onChange }) {
  const [open, setOpen] = useStateC(false);
  const branches = window.MADAR_DATA.BRANCHES;
  const cur = value === 'all' ? { name: 'All branches', name_ar: 'كل الفروع' } : branches.find(b => b.id === value);
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-sm" style={{ background: 'var(--bg-elev)' }} onClick={() => setOpen(o => !o)}>
        <Icons.MapPin size={13} />
        {cur?.name}
        <Icons.ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{
            position: 'absolute', insetInlineEnd: 0, top: 'calc(100% + 6px)', zIndex: 31,
            background: 'var(--bg-elev)', border: '1px solid var(--rule)',
            borderRadius: 10, minWidth: 220, padding: 6, boxShadow: 'var(--shadow-lg)'
          }}>
            <button className="sb-item" style={{ width: '100%' }} aria-current={value === 'all'}
                    onClick={() => { onChange('all'); setOpen(false); }}>
              <Icons.Globe size={14} /> <span>All branches</span>
            </button>
            <div style={{ height: 1, background: 'var(--rule)', margin: '4px 0' }} />
            {branches.map(b => (
              <button key={b.id} className="sb-item" style={{ width: '100%' }} aria-current={value === b.id}
                      onClick={() => { onChange(b.id); setOpen(false); }}>
                <Icons.MapPin size={14} />
                <span style={{ flex: 1 }}>{b.name}</span>
                <span className="tnum" style={{ fontSize: 11, color: 'var(--ink-3)' }}>£{(b.today/1000).toFixed(1)}k</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sparkline ─────────────────────────────────────────────────────────
function Sparkline({ data, w = 160, h = 36, fill = true, color }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - ((v - min) / range) * (h - 4) - 2]);
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;
  const c = color || 'var(--accent)';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
      {fill && (<path d={area} fill={c} opacity="0.08" />)}
      <path d={path} stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={c} />
    </svg>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────────────
function KPICard({ label, value, unit, delta, deltaLabel = 'vs last week', spark, big = false }) {
  const up = delta >= 0;
  return (
    <div className="card" style={{ padding: big ? '24px 24px 20px' : '20px' }}>
      <div className="kicker">{label}</div>
      <div className="serif tnum" style={{
        fontSize: big ? 56 : 44, fontWeight: 400, lineHeight: 1.0,
        marginTop: 8, letterSpacing: '-0.02em',
        color: 'var(--ink)'
      }}>
        {unit && <span style={{ fontSize: '0.45em', color: 'var(--ink-3)', marginInlineEnd: 6, fontFamily: 'var(--sans)' }}>{unit}</span>}
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <span className={`delta ${up ? 'up' : 'dn'}`}>
          {up ? <Icons.ArrowUp /> : <Icons.ArrowDown />}
          {Math.abs(delta).toFixed(1)}%
          <span style={{ color: 'var(--ink-3)', marginInlineStart: 4 }}>{deltaLabel}</span>
        </span>
        {spark && <Sparkline data={spark} w={86} h={28} />}
      </div>
    </div>
  );
}

// ─── AI Insight Card ────────────────────────────────────────────────────
function AIInsightCard({ insight, onAction, dense = false, idx = 0 }) {
  const kindMeta = {
    reorder:  { label: 'Reorder', color: 'var(--accent)' },
    anomaly:  { label: 'Anomaly', color: 'var(--rose)' },
    pricing:  { label: 'Pricing', color: 'var(--amber)' },
    staff:    { label: 'Staff',   color: 'var(--sage)' },
    supplier: { label: 'Supplier',color: 'var(--ink-2)' },
  }[insight.kind] || { label: 'Insight', color: 'var(--ink-2)' };
  return (
    <article style={{
      borderTop: '1px solid var(--rule)',
      padding: dense ? '14px 0' : '18px 0',
      animation: `fadeUp .4s ease ${idx * 0.04}s both`
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: 50,
          background: kindMeta.color, flexShrink: 0
        }} />
        <span className="kicker" style={{ color: 'var(--ink-3)' }}>{kindMeta.label}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--ink-4)' }} className="tnum">
          {Math.round(insight.confidence * 100)}% confidence
        </span>
      </header>
      <h4 className="serif" style={{ margin: 0, fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
        {insight.headline}
      </h4>
      {!dense && (
        <p style={{ margin: '6px 0 12px', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)', textWrap: 'pretty' }}>
          {insight.body}
        </p>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: dense ? 8 : 0 }}>
        {insight.actions.map((a, i) => (
          <button key={a} className={i === 0 ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
                  onClick={() => onAction && onAction(insight.id, a)}>
            {a}
          </button>
        ))}
      </div>
    </article>
  );
}

// ─── AI Chat Panel ───────────────────────────────────────────────────────
function AIChatPanel({ open, onClose, lang }) {
  const suggested = lang === 'ar' ? [
    'لماذا تراجع المعادي الأسبوع الماضي؟',
    'أي منتجات يجب التوقف عن بيعها؟',
    'قارن هوامش الأسبوع مقابل عطلة الأسبوع.',
    'من هو أفضل كاشير ولماذا؟',
  ] : [
    'Why did Maadi underperform last week?',
    'Which products should I stop carrying?',
    'Compare weekend vs weekday margins by branch.',
    "Who's my best cashier and why?",
  ];

  const [messages, setMessages] = useStateC([
    { role: 'ai', text: lang === 'ar'
      ? 'صباح الخير. الإيرادات هذا الأسبوع 181,300 جنيه — بزيادة 8.4% عن الأسبوع الماضي. ماذا تريد أن تعرف؟'
      : 'Good morning. Revenue this week is £181,300 — up 8.4% on last week. What would you like to know?' }
  ]);
  const [input, setInput] = useStateC('');
  const [busy, setBusy] = useStateC(false);
  const scrollRef = useRefC(null);

  useEffectC(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy, open]);

  const ask = (q) => {
    if (!q || busy) return;
    setMessages(m => [...m, { role: 'me', text: q }]);
    setInput('');
    setBusy(true);
    setTimeout(() => {
      const reply = generateAIReply(q, lang);
      setMessages(m => [...m, { role: 'ai', text: reply.text, fig: reply.fig }]);
      setBusy(false);
    }, 900);
  };

  if (!open) return null;
  return (
    <aside style={{
      position: 'fixed', insetInlineEnd: 24, bottom: 24,
      width: 380, maxWidth: 'calc(100vw - 48px)',
      height: 540, maxHeight: 'calc(100vh - 100px)',
      background: 'var(--bg-elev)',
      border: '1px solid var(--rule)',
      borderRadius: 14, boxShadow: 'var(--shadow-lg)',
      display: 'flex', flexDirection: 'column',
      zIndex: 40, overflow: 'hidden',
      animation: 'slideUp .25s ease-out'
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center' }}>
          <Icons.Sparkles size={14} />
        </div>
        <div>
          <div className="serif" style={{ fontSize: 15, fontWeight: 500 }}>Ask Madar</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>AI assistant · always observing</div>
        </div>
        <span style={{ flex: 1 }} />
        <button className="tb-icon-btn" onClick={onClose}><Icons.X size={14} /></button>
      </header>

      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m, i) => (
          <ChatBubble key={i} m={m} />
        ))}
        {busy && (
          <div style={{ display: 'flex', gap: 6, padding: '8px 4px' }}>
            <span className="dot-anim" /><span className="dot-anim" /><span className="dot-anim" />
          </div>
        )}
      </div>

      {messages.length <= 2 && (
        <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggested.map(s => (
            <button key={s} className="chip" onClick={() => ask(s)} style={{ fontSize: 11.5, cursor: 'pointer' }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form style={{ display: 'flex', gap: 6, padding: 12, borderTop: '1px solid var(--rule)' }}
            onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
               placeholder={lang === 'ar' ? 'اسأل ما تريد…' : 'Ask anything…'}
               style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--rule)',
                        background: 'var(--bg)', fontSize: 13, outline: 'none' }} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!input.trim()}>
          <Icons.Send size={13} />
        </button>
      </form>
    </aside>
  );
}

function ChatBubble({ m }) {
  if (m.role === 'me') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%',
        background: 'var(--accent)', color: '#fff',
        padding: '8px 12px', borderRadius: '14px 14px 4px 14px',
        fontSize: 13, lineHeight: 1.45 }}>
        {m.text}
      </div>
    );
  }
  return (
    <div style={{ maxWidth: '92%' }}>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)', textWrap: 'pretty' }}
           dangerouslySetInnerHTML={{ __html: m.text }} />
      {m.fig && (
        <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-sunk)', borderRadius: 8,
                      border: '1px solid var(--rule)', fontSize: 12 }}>
          {m.fig}
        </div>
      )}
    </div>
  );
}

// Quick canned-but-context-aware AI response generator.
function generateAIReply(q, lang) {
  const ql = q.toLowerCase();
  if (ql.includes('maadi') || ql.includes('المعادي')) {
    return {
      text: 'Maadi was up <em>12.4%</em> this week, not down. Driver: Saturday afternoon traffic — basket size rose from <em class="serif">£128</em> to <em class="serif">£164</em>. The croissant pairing experiment seems to be working.',
      fig: 'Maadi · weekly revenue: £47,800 (+12.4%) · avg basket: £164 (+28%)'
    };
  }
  if (ql.includes('stop') || ql.includes('drop')) {
    return {
      text: 'Three candidates: <strong>Geisha single-origin</strong> (4 units/wk, 92% margin but slow, ties up cash), <strong>Affogato</strong> (12/wk but heavy refund rate at Zamalek), and the <strong>1kg Espresso Blend</strong> (4 retail units/wk — better as wholesale only).',
    };
  }
  if (ql.includes('cashier') || ql.includes('best')) {
    return {
      text: '<strong>Hala Mansour</strong> at Heliopolis. 47s avg checkout vs the chain average of 1m12s. Upsell rate 28% vs 14%. Refund rate the lowest in the chain at 1.2%.',
    };
  }
  if (ql.includes('weekend') || ql.includes('compare')) {
    return {
      text: 'Weekends drive <em class="serif">42%</em> of weekly revenue across the chain. Margins are <em class="serif">3.8 points</em> higher on weekends — heavier pour-over and pastry mix. Maadi leads at +5.1pts, Sheikh Zayed lowest at +1.9pts.',
    };
  }
  return {
    text: "I'd want to look more closely at that. Try one of the suggestions below, or be specific about a branch, product, or time range."
  };
}

// ─── Offline Banner ─────────────────────────────────────────────────────
function OfflineBanner({ online, syncing, queued }) {
  if (online && !syncing) return null;
  return (
    <div style={{
      background: online ? 'color-mix(in oklab, var(--accent-soft) 60%, var(--bg))' : 'color-mix(in oklab, var(--amber-soft) 70%, var(--bg))',
      borderBottom: '1px solid var(--rule)',
      padding: '8px 24px',
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 12.5,
      color: 'var(--ink-2)'
    }}>
      {online ? <Icons.Refresh size={14} /> : <Icons.WifiOff size={14} />}
      <span>
        {online
          ? <>Reconnected. <strong>{queued} transaction{queued === 1 ? '' : 's'}</strong> syncing in the background.</>
          : <>Working offline. <strong>{queued} transaction{queued === 1 ? '' : 's'} queued.</strong> Sales continue — they'll sync when you're back.</>
        }
      </span>
      <span style={{ flex: 1 }} />
      <button className="btn btn-sm btn-ghost">View queue</button>
    </div>
  );
}

// ─── Branch dot mini-map ────────────────────────────────────────────────
function BranchPin({ branch, active, onClick, scale = 1 }) {
  return (
    <button onClick={onClick} aria-label={branch.name}
      style={{
        position: 'absolute',
        insetInlineStart: `${branch.lng}%`, top: `${branch.lat}%`,
        transform: 'translate(-50%, -100%)',
        background: 'transparent', border: 0, padding: 0,
        zIndex: active ? 5 : 2,
      }}>
      <div style={{
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
        transform: `scale(${active ? 1.1 : 1})`, transition: 'transform .2s'
      }}>
        <div style={{
          background: active ? 'var(--accent)' : 'var(--bg-elev)',
          color: active ? '#fff' : 'var(--ink)',
          border: `1.5px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
          boxShadow: active ? 'var(--shadow)' : 'var(--shadow-sm)',
        }}>
          {branch.name} · <span className="tnum">£{(branch.today/1000).toFixed(1)}k</span>
        </div>
        <svg width="12" height="6" style={{ marginTop: -1 }}>
          <path d="M0 0L6 6L12 0" fill={active ? 'var(--accent)' : 'var(--bg-elev)'}
                stroke={active ? 'var(--accent)' : 'var(--rule)'} strokeWidth="1.5" />
        </svg>
        <div style={{ width: 8, height: 8, borderRadius: 50,
          background: active ? 'var(--accent)' : 'var(--ink-3)',
          marginTop: 1,
          boxShadow: active ? `0 0 0 4px color-mix(in oklab, var(--accent) 24%, transparent)` : 'none',
        }} />
      </div>
    </button>
  );
}

window.UI = { Sidebar, Topbar, Sparkline, KPICard, AIInsightCard, AIChatPanel, OfflineBanner, BranchPin };
