// Madar — Root App. Routing, tweaks, sidebar/topbar wiring.

const { useState: useStateA, useEffect: useEffectA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "terracotta",
  "dark": false,
  "typeface": "fraunces",
  "lang": "en",
  "dashLayout": "editorial",
  "showTexture": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = useStateA('dashboard');
  const [branch, setBranch] = useStateA('all');
  const [aiOpen, setAiOpen] = useStateA(false);
  const [online, setOnline] = useStateA(true);
  const [syncCount, setSyncCount] = useStateA(0);
  const [notifOpen, setNotifOpen] = useStateA(false);
  const [onboarding, setOnboarding] = useStateA(false);

  // Apply theme/accent/typeface to <html>
  useEffectA(() => {
    const r = document.documentElement;
    r.dataset.theme = t.dark ? 'dark' : 'light';
    r.dataset.accent = t.accent;
    r.dataset.typeface = t.typeface;
    r.dir = t.lang === 'ar' ? 'rtl' : 'ltr';
    r.lang = t.lang;
  }, [t.dark, t.accent, t.typeface, t.lang]);

  // Demo: sync count drift
  useEffectA(() => {
    if (online) {
      if (syncCount > 0) {
        const id = setTimeout(() => setSyncCount(c => Math.max(0, c - 1)), 600);
        return () => clearTimeout(id);
      }
    } else {
      const id = setInterval(() => setSyncCount(c => c + 1), 4500);
      return () => clearInterval(id);
    }
  }, [online, syncCount]);

  const crumbs = {
    dashboard: { c: 'Dashboard',  s: 'Mon · 8 May 2026' },
    checkout:  { c: 'Checkout',   s: 'Live terminal' },
    sales:     { c: 'Sales',      s: 'Records · today' },
    inventory: { c: 'Inventory',  s: 'Catalog & stock' },
    transfers: { c: 'Transfers',  s: 'Between branches' },
    suppliers: { c: 'Suppliers',  s: 'Network · 6' },
    purchases: { c: 'Procurement',s: 'Purchase orders' },
    branches:  { c: 'Branches',   s: '5 locations' },
    reconcile: { c: 'Reconcile',  s: 'End of day' },
    analysis:  { c: 'Income',     s: 'Weekly review' },
    billing:   { c: 'Billing',    s: 'Subscription · plan' },
    settings:  { c: 'Settings',   s: '' },
    help:      { c: 'Help',       s: '' },
  }[screen] || { c: screen, s: '' };

  const screens = {
    dashboard: <Dashboard branch={branch} lang={t.lang} dashLayout={t.dashLayout}
                          onAIToggle={() => setAiOpen(o => !o)} onNav={setScreen} />,
    checkout:  <Checkout  branch={branch} lang={t.lang} />,
    sales:     <SalesRecords lang={t.lang} onAIToggle={() => setAiOpen(o => !o)} />,
    inventory: <Inventory branch={branch} lang={t.lang} onAIToggle={() => setAiOpen(o => !o)} />,
    transfers: <StockTransfers lang={t.lang} />,
    suppliers: <Suppliers lang={t.lang} onAIToggle={() => setAiOpen(o => !o)} />,
    purchases: <PurchaseOrders lang={t.lang} onAIToggle={() => setAiOpen(o => !o)} />,
    branches:  <Branches  lang={t.lang} />,
    reconcile: <Reconciliation lang={t.lang} />,
    analysis:  <Analysis  lang={t.lang} onAIToggle={() => setAiOpen(o => !o)} />,
    billing:   <Billing   lang={t.lang} />,
    settings:  <Settings lang={t.lang} />,
    help:      <Placeholder title="Help & support" icon={Icons.Help} />,
  };

  return (
    <div className={`app ${t.showTexture ? 'paper-tex' : ''}`} data-pos={screen === 'checkout'}>
      <UI.Sidebar active={screen} onNav={setScreen} t={t} />

      <UI.Topbar
        crumb={crumbs.c} sub={crumbs.s}
        onAIToggle={() => setAiOpen(o => !o)}
        online={online}
        syncCount={syncCount}
        branch={branch} onBranchChange={setBranch}
        lang={t.lang}
        onLangToggle={() => setTweak('lang', t.lang === 'ar' ? 'en' : 'ar')}
        onNotifToggle={() => setNotifOpen(o => !o)}
        notifOpen={notifOpen}
      />

      {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
      {onboarding && <OnboardingWizard onClose={() => setOnboarding(false)} />}

      <div className="content">
        {(!online || syncCount > 0) && screen !== 'checkout' && (
          <UI.OfflineBanner online={online} syncing={syncCount > 0} queued={syncCount} />
        )}
        {screens[screen]}
      </div>

      <UI.AIChatPanel open={aiOpen} onClose={() => setAiOpen(false)} lang={t.lang} />

      <TweaksPanel>
        <TweakSection label="Accent" />
        <TweakColor label="Accent color" value={t.accent}
                    options={[
                      ['#C8553D','#FAF7F2','#1A1714'],
                      ['#2D2A26','#FAF7F2','#C8553D'],
                      ['#3F6B4E','#FAF7F2','#1A1714'],
                      ['#2F4D8A','#FAF7F2','#1A1714'],
                    ]}
                    onChange={(v, i) => {
                      const map = ['terracotta', 'ink', 'forest', 'cobalt'];
                      setTweak('accent', map[i] || 'terracotta');
                    }} />

        <TweakSection label="Theme" />
        <TweakToggle label="Dark mode" value={t.dark} onChange={v => setTweak('dark', v)} />
        <TweakToggle label="Paper texture" value={t.showTexture} onChange={v => setTweak('showTexture', v)} />

        <TweakSection label="Typography" />
        <TweakRadio label="Typeface" value={t.typeface}
                    options={['fraunces', 'sectra', 'grotesk']}
                    onChange={v => setTweak('typeface', v)} />

        <TweakSection label="Language" />
        <TweakRadio label="Language" value={t.lang}
                    options={[{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }]}
                    onChange={v => setTweak('lang', v)} />

        <TweakSection label="Dashboard layout" />
        <TweakSelect label="Variant" value={t.dashLayout}
                     options={[
                       { value: 'editorial', label: 'Editorial — AI headline first' },
                       { value: 'kpi',       label: 'KPI-first — exec dashboard' },
                       { value: 'newspaper', label: 'Newspaper — full digest' },
                     ]}
                     onChange={v => setTweak('dashLayout', v)} />

        <TweakSection label="Connection (demo)" />
        <TweakToggle label="Online" value={online} onChange={v => { setOnline(v); if (!v) setSyncCount(3); }} />
        <TweakButton label="Trigger sync" onClick={() => setSyncCount(c => c + 4)} />

        <TweakSection label="Onboarding" />
        <TweakButton label="Replay setup wizard" onClick={() => setOnboarding(true)} />
      </TweaksPanel>
    </div>
  );
}

function Placeholder({ title, icon: Ic }) {
  return (
    <div className="content-inner" style={{ display: 'grid', placeItems: 'center', minHeight: 480 }}>
      <div style={{ textAlign: 'center', color: 'var(--ink-3)' }}>
        <Ic size={32} />
        <h2 className="serif" style={{ fontSize: 22, fontWeight: 500, margin: '12px 0 4px', color: 'var(--ink)' }}>{title}</h2>
        <p style={{ fontSize: 13 }}>Not part of this prototype scope. Try the other sections.</p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
