// Madar Admin — sample data for super-admin app

const TENANTS = [
  { id: 't_bayt',   name: 'Bayt Coffee Co.',     country: 'Egypt',  flag: '🇪🇬', plan: 'Growth',    status: 'active',    branches: 5,  users: 9,  mrr: 1490, signed: '2025-12-04', lastActivity: '2 min ago',  txCount: 28420 },
  { id: 't_mahal',  name: 'Al Mahal Bookstores',  country: 'Egypt',  flag: '🇪🇬', plan: 'Growth',    status: 'grace',     branches: 3,  users: 6,  mrr: 1490, signed: '2025-09-22', lastActivity: '18 min ago', txCount: 14210 },
  { id: 't_dukan',  name: 'Dukan Grocers',        country: 'Egypt',  flag: '🇪🇬', plan: 'Scale',     status: 'active',    branches: 12, users: 31, mrr: 2890, signed: '2024-08-11', lastActivity: '1 hr ago',   txCount: 184200 },
  { id: 't_qahwa',  name: 'Qahwa Speciality',     country: 'UAE',    flag: '🇦🇪', plan: 'Starter',   status: 'trial',     branches: 1,  users: 2,  mrr: 0,    signed: '2026-05-02', lastActivity: '4 hr ago',   txCount: 240 },
  { id: 't_zaman',  name: 'Zaman Pharmacy Group', country: 'Saudi',  flag: '🇸🇦', plan: 'Scale',     status: 'active',    branches: 9,  users: 24, mrr: 2890, signed: '2025-03-18', lastActivity: '32 min ago', txCount: 92100 },
  { id: 't_basta',  name: 'Basta Wholesale',      country: 'Jordan', flag: '🇯🇴', plan: 'Growth',    status: 'suspended', branches: 4,  users: 11, mrr: 0,    signed: '2024-11-04', lastActivity: '6 days ago', txCount: 41200 },
  { id: 't_najma',  name: 'Najma Restaurants',    country: 'Lebanon',flag: '🇱🇧', plan: 'Scale',     status: 'active',    branches: 6,  users: 18, mrr: 2890, signed: '2025-06-29', lastActivity: '12 min ago', txCount: 64800 },
  { id: 't_mizn',   name: 'Mizn Florist',         country: 'Egypt',  flag: '🇪🇬', plan: 'Starter',   status: 'trial',     branches: 1,  users: 1,  mrr: 0,    signed: '2026-05-06', lastActivity: '20 hr ago',  txCount: 14 },
  { id: 't_sharaf', name: 'Sharaf Electronics',   country: 'UAE',    flag: '🇦🇪', plan: 'Enterprise',status: 'active',    branches: 22, users: 84, mrr: 9800, signed: '2024-02-14', lastActivity: '3 min ago',  txCount: 412800 },
  { id: 't_hayy',   name: 'Hayy Bakery',          country: 'Egypt',  flag: '🇪🇬', plan: 'Starter',   status: 'cancelled', branches: 1,  users: 2,  mrr: 0,    signed: '2025-01-20', lastActivity: '42 days ago',txCount: 8600 },
  { id: 't_nawa',   name: 'Nawa Co-working',      country: 'Egypt',  flag: '🇪🇬', plan: 'Growth',    status: 'active',    branches: 2,  users: 5,  mrr: 1490, signed: '2025-10-08', lastActivity: '1 day ago',  txCount: 6200 },
  { id: 't_funun',  name: 'Funun Art Supplies',   country: 'Saudi',  flag: '🇸🇦', plan: 'Growth',    status: 'active',    branches: 3,  users: 8,  mrr: 1490, signed: '2025-07-19', lastActivity: '5 hr ago',   txCount: 28100 },
];

const STATUS_MAP = {
  trial:     { label: 'Trial',     color: 'var(--admin)',      bg: 'var(--admin-soft)' },
  active:    { label: 'Active',    color: 'var(--sage)',       bg: 'var(--sage-soft)' },
  grace:     { label: 'In grace',  color: 'var(--amber)',      bg: 'var(--amber-soft)' },
  suspended: { label: 'Suspended', color: 'var(--rose)',       bg: 'var(--rose-soft)' },
  cancelled: { label: 'Cancelled', color: 'var(--ink-3)',      bg: 'var(--bg-sunk)' },
};

const PROOFS = [
  { id: 'PP-04221', tenantId: 't_bayt',   amount: 1490, currency: 'EGP', symbol: '£', daysPending: 0.1, submitted: '2026-05-08 14:22', expectedTo: 'cib',  payerName: 'Bayt Coffee Co.',    transferDate: '2026-05-08', bankRef: 'CIB-TR-988412', refCode: 'MDR-BAYT-0005', invId: 'INV-2026-0005', match: { amount: true,  date: true,  reference: true,  account: true  } },
  { id: 'PP-04220', tenantId: 't_mahal',  amount: 1490, currency: 'EGP', symbol: '£', daysPending: 0.4, submitted: '2026-05-08 09:48', expectedTo: 'nbe',  payerName: 'Mahal Books LLC',     transferDate: '2026-05-07', bankRef: 'NBE-TX-771112', refCode: 'MDR-MAHL-0009', invId: 'INV-2026-0009', match: { amount: true,  date: true,  reference: false, account: true  } },
  { id: 'PP-04218', tenantId: 't_qahwa',  amount: 590,  currency: 'AED', symbol: 'AED', daysPending: 1.2, submitted: '2026-05-07 11:05', expectedTo: 'enbd', payerName: 'Qahwa FZE',          transferDate: '2026-05-07', bankRef: 'ENBD-99820',    refCode: 'MDR-QAHW-0002', invId: 'INV-2026-0002', match: { amount: true,  date: true,  reference: true,  account: true  } },
  { id: 'PP-04216', tenantId: 't_najma',  amount: 2890, currency: 'EGP', symbol: '£', daysPending: 2.0, submitted: '2026-05-06 16:14', expectedTo: 'cib',  payerName: 'Najma F&B Group',     transferDate: '2026-05-06', bankRef: 'CIB-TR-988201', refCode: 'MDR-NAJM-0011', invId: 'INV-2026-0011', match: { amount: false, date: true,  reference: true,  account: true  }, mismatch: 'Transferred £2,790 instead of £2,890' },
  { id: 'PP-04215', tenantId: 't_funun',  amount: 1490, currency: 'SAR', symbol: 'SAR', daysPending: 2.4, submitted: '2026-05-06 09:30', expectedTo: 'enbd', payerName: 'Funun Trading Co.',  transferDate: '2026-05-05', bankRef: '—',             refCode: 'MDR-FUNN-0007', invId: 'INV-2026-0007', match: { amount: true,  date: true,  reference: false, account: false }, mismatch: 'Sent to old EGP account; reference missing' },
  { id: 'PP-04212', tenantId: 't_nawa',   amount: 1490, currency: 'EGP', symbol: '£', daysPending: 3.2, submitted: '2026-05-05 12:08', expectedTo: 'cib',  payerName: 'Nawa Spaces',         transferDate: '2026-05-04', bankRef: 'CIB-TR-987811', refCode: 'MDR-NAWA-0006', invId: 'INV-2026-0006', match: { amount: true,  date: true,  reference: true,  account: true  } },
  { id: 'PP-04210', tenantId: 't_dukan',  amount: 2890, currency: 'EGP', symbol: '£', daysPending: 4.1, submitted: '2026-05-04 08:20', expectedTo: 'nbe',  payerName: 'Dukan Co.',           transferDate: '2026-05-03', bankRef: 'NBE-TX-770844', refCode: 'MDR-DUKN-0014', invId: 'INV-2026-0014', match: { amount: true,  date: true,  reference: true,  account: true  } },
  { id: 'PP-04209', tenantId: 't_mizn',   amount: 590,  currency: 'EGP', symbol: '£', daysPending: 5.0, submitted: '2026-05-03 17:55', expectedTo: 'cib',  payerName: 'M. El-Sayed (personal)', transferDate: '2026-05-03', bankRef: '—',         refCode: 'MDR-MIZN-0001', invId: 'INV-2026-0001', match: { amount: true,  date: true,  reference: false, account: true  }, mismatch: 'Receipt unreadable — image is blurry' },
  { id: 'PP-04207', tenantId: 't_zaman',  amount: 2890, currency: 'SAR', symbol: 'SAR', daysPending: 6.2, submitted: '2026-05-02 09:14', expectedTo: 'enbd', payerName: 'Zaman Pharma',       transferDate: '2026-05-01', bankRef: 'ENBD-99711',    refCode: 'MDR-ZAMN-0019', invId: 'INV-2026-0019', match: { amount: true,  date: true,  reference: true,  account: true  } },
];

const PLATFORM_BANKS = [
  { id: 'cib',  bank: 'Commercial International Bank (CIB)', country: 'Egypt',  flag: '🇪🇬', currency: 'EGP', holder: 'Madar Software Technologies LLC',  iban: 'EG38 0010 0001 0000 0001 8420 6712', swift: 'CIBEEGCX', primary: true,  active: true,  monthIn: 18420, txns: 42 },
  { id: 'nbe',  bank: 'National Bank of Egypt',              country: 'Egypt',  flag: '🇪🇬', currency: 'EGP', holder: 'Madar Software Technologies LLC',  iban: 'EG24 0030 0002 0001 1110 2308 5544', swift: 'NBEGEGCX', primary: false, active: true,  monthIn: 8980,  txns: 21 },
  { id: 'enbd', bank: 'Emirates NBD',                        country: 'UAE',    flag: '🇦🇪', currency: 'AED', holder: 'Madar Software Technologies FZE',  iban: 'AE07 0260 0010 1535 1234 902',       swift: 'EBILAEAD', primary: true,  active: true,  monthIn: 12400, txns: 14 },
  { id: 'alra', bank: 'Al Rajhi Bank',                       country: 'Saudi',  flag: '🇸🇦', currency: 'SAR', holder: 'Madar Software Technologies KSA',  iban: 'SA03 8000 0000 6080 1016 7519',       swift: 'RJHISARI', primary: true,  active: true,  monthIn: 9100,  txns: 11 },
  { id: 'misr', bank: 'Banque Misr',                         country: 'Egypt',  flag: '🇪🇬', currency: 'EGP', holder: 'Madar Software Technologies LLC',  iban: 'EG15 0006 0000 0010 0000 4421 1119', swift: 'BMISEGCX', primary: false, active: false, monthIn: 0,    txns: 0 },
];

const ADMIN_TEAM = [
  { id: 'u1', name: 'Layla H.',   email: 'layla@madar.app',   role: 'Platform Owner', mfa: true,  lastLogin: '2 min ago',   status: 'active', avatar: 'L' },
  { id: 'u2', name: 'Karim B.',   email: 'karim@madar.app',   role: 'Finance',        mfa: true,  lastLogin: '14 min ago',  status: 'active', avatar: 'K' },
  { id: 'u3', name: 'Nour M.',    email: 'nour@madar.app',    role: 'Finance',        mfa: true,  lastLogin: '38 min ago',  status: 'active', avatar: 'N' },
  { id: 'u4', name: 'Ziad A.',    email: 'ziad@madar.app',    role: 'Support',        mfa: true,  lastLogin: '1 hr ago',    status: 'active', avatar: 'Z' },
  { id: 'u5', name: 'Hana E.',    email: 'hana@madar.app',    role: 'Support',        mfa: false, lastLogin: '3 hr ago',    status: 'active', avatar: 'H' },
  { id: 'u6', name: 'Rami O.',    email: 'rami@madar.app',    role: 'Developer',      mfa: true,  lastLogin: '2 days ago',  status: 'active', avatar: 'R' },
  { id: 'u7', name: 'Sara Q.',    email: 'sara@madar.app',    role: 'Read-only',      mfa: true,  lastLogin: 'never',       status: 'pending',avatar: 'S' },
];

const ADMIN_ROLES = [
  { id: 'owner',   name: 'Platform Owner', members: 1, perms: 'All',                                      description: 'Full access. Only role that can edit other roles or add owners.' },
  { id: 'finance', name: 'Finance',        members: 2, perms: 'Billing, banking, verification',           description: 'Verify payments, manage invoices, edit bank accounts.' },
  { id: 'support', name: 'Support',        members: 2, perms: 'Tenant read, messages, impersonate (logged)', description: 'Help tenants. All login-as sessions are audited.' },
  { id: 'dev',     name: 'Developer',      members: 1, perms: 'Audit, system health, feature flags',      description: 'Operate the platform infrastructure.' },
  { id: 'readonly',name: 'Read-only',      members: 1, perms: 'Tenant read, audit read',                  description: 'Investor / board access. No actions.' },
];

const LOGIN_AS_AUDIT = [
  { id: 'la_188', ts: '2026-05-08 13:08:42', admin: 'Ziad A.',  tenant: 'Al Mahal Bookstores', tenantId: 't_mahal', duration: '14 min', actions: 6, ip: '102.45.88.21', ua: 'Mac · Chrome 124', reason: 'Customer support ticket #1284' },
  { id: 'la_187', ts: '2026-05-08 11:51:09', admin: 'Hana E.',  tenant: 'Mizn Florist',        tenantId: 't_mizn',  duration: '3 min',  actions: 1, ip: '102.45.88.22', ua: 'Mac · Chrome 124', reason: 'Onboarding assistance' },
  { id: 'la_186', ts: '2026-05-08 10:14:00', admin: 'Layla H.', tenant: 'Sharaf Electronics',  tenantId: 't_sharaf',duration: '22 min', actions: 11,ip: '102.45.88.20', ua: 'Mac · Safari 17',  reason: 'Reproduce reported bug' },
  { id: 'la_185', ts: '2026-05-07 16:39:18', admin: 'Ziad A.',  tenant: 'Qahwa Speciality',    tenantId: 't_qahwa', duration: '8 min',  actions: 3, ip: '102.45.88.21', ua: 'Mac · Chrome 124', reason: 'Trial setup help' },
  { id: 'la_184', ts: '2026-05-07 14:02:55', admin: 'Karim B.', tenant: 'Najma Restaurants',   tenantId: 't_najma', duration: '6 min',  actions: 2, ip: '102.45.88.19', ua: 'Mac · Chrome 124', reason: 'Verify payment dispute' },
  { id: 'la_183', ts: '2026-05-07 09:21:11', admin: 'Hana E.',  tenant: 'Dukan Grocers',       tenantId: 't_dukan', duration: '19 min', actions: 8, ip: '102.45.88.22', ua: 'Mac · Chrome 124', reason: 'Inventory import support' },
  { id: 'la_182', ts: '2026-05-06 18:08:12', admin: 'Ziad A.',  tenant: 'Funun Art Supplies',  tenantId: 't_funun', duration: '4 min',  actions: 1, ip: '102.45.88.21', ua: 'Mac · Chrome 124', reason: 'Tax setup question' },
  { id: 'la_181', ts: '2026-05-06 12:44:20', admin: 'Layla H.', tenant: 'Bayt Coffee Co.',     tenantId: 't_bayt',  duration: '11 min', actions: 5, ip: '102.45.88.20', ua: 'Mac · Safari 17',  reason: 'Custom dashboard demo for case study' },
];

const PLATFORM_AUDIT = [
  { ts: '2026-05-08 14:23:12', admin: 'Karim B.', action: 'payment_proof.approved',  target: 'PP-04221 · Bayt Coffee Co.', ip: '102.45.88.19' },
  { ts: '2026-05-08 13:09:01', admin: 'Ziad A.',  action: 'impersonation.start',     target: 'Al Mahal Bookstores',         ip: '102.45.88.21' },
  { ts: '2026-05-08 11:48:55', admin: 'Layla H.', action: 'role.permission_updated', target: 'Role: Finance',               ip: '102.45.88.20' },
  { ts: '2026-05-08 09:50:14', admin: 'Karim B.', action: 'payment_proof.approved',  target: 'PP-04220 · Al Mahal',         ip: '102.45.88.19' },
  { ts: '2026-05-08 09:14:22', admin: 'Karim B.', action: 'bank_account.created',    target: 'Banque Misr · EGP',           ip: '102.45.88.19' },
  { ts: '2026-05-07 22:14:00', admin: 'Layla H.', action: 'tenant.suspended',        target: 'Basta Wholesale',             ip: '102.45.88.20' },
  { ts: '2026-05-07 14:03:11', admin: 'Karim B.', action: 'payment_proof.rejected',  target: 'PP-04214 · Najma',            ip: '102.45.88.19' },
  { ts: '2026-05-07 11:08:42', admin: 'Karim B.', action: 'payment_proof.approved',  target: 'PP-04218 · Qahwa',            ip: '102.45.88.19' },
  { ts: '2026-05-07 10:00:00', admin: 'Rami O.',  action: 'feature_flag.rolled_out', target: 'flag: variants_v2 → 100%',    ip: '102.45.88.18' },
  { ts: '2026-05-06 16:30:42', admin: 'Layla H.', action: 'admin_user.invited',      target: 'sara@madar.app · Read-only',  ip: '102.45.88.20' },
];

// Admin-level invoices (across all tenants)
const ADMIN_INVOICES = [
  { id: 'INV-2026-0019', tenantId: 't_zaman', amount: 2890, currency: 'SAR', symbol: 'SAR', issued: '2026-05-01', due: '2026-05-15', status: 'submitted', daysOverdue: 0 },
  { id: 'INV-2026-0014', tenantId: 't_dukan', amount: 2890, currency: 'EGP', symbol: '£', issued: '2026-05-01', due: '2026-05-15', status: 'submitted', daysOverdue: 0 },
  { id: 'INV-2026-0011', tenantId: 't_najma', amount: 2890, currency: 'EGP', symbol: '£', issued: '2026-05-01', due: '2026-05-15', status: 'submitted', daysOverdue: 0 },
  { id: 'INV-2026-0009', tenantId: 't_mahal', amount: 1490, currency: 'EGP', symbol: '£', issued: '2026-05-01', due: '2026-05-15', status: 'submitted', daysOverdue: 0 },
  { id: 'INV-2026-0007', tenantId: 't_funun', amount: 1490, currency: 'SAR', symbol: 'SAR', issued: '2026-05-01', due: '2026-05-15', status: 'submitted', daysOverdue: 0 },
  { id: 'INV-2026-0006', tenantId: 't_nawa',  amount: 1490, currency: 'EGP', symbol: '£', issued: '2026-05-01', due: '2026-05-15', status: 'submitted', daysOverdue: 0 },
  { id: 'INV-2026-0005', tenantId: 't_bayt',  amount: 1490, currency: 'EGP', symbol: '£', issued: '2026-05-01', due: '2026-05-15', status: 'submitted', daysOverdue: 0 },
  { id: 'INV-2026-0023', tenantId: 't_sharaf',amount: 9800, currency: 'AED', symbol: 'AED', issued: '2026-05-01', due: '2026-05-15', status: 'paid',      daysOverdue: 0 },
  { id: 'INV-2026-0017', tenantId: 't_basta', amount: 1490, currency: 'EGP', symbol: '£', issued: '2026-04-01', due: '2026-04-15', status: 'overdue',  daysOverdue: 23 },
  { id: 'INV-2026-0015', tenantId: 't_hayy',  amount: 590,  currency: 'EGP', symbol: '£', issued: '2026-01-01', due: '2026-01-15', status: 'overdue',  daysOverdue: 112 },
  { id: 'INV-2026-0002', tenantId: 't_qahwa', amount: 590,  currency: 'AED', symbol: 'AED', issued: '2026-05-01', due: '2026-05-15', status: 'paid',     daysOverdue: 0 },
  { id: 'INV-2026-0001', tenantId: 't_mizn',  amount: 590,  currency: 'EGP', symbol: '£', issued: '2026-05-01', due: '2026-05-15', status: 'submitted', daysOverdue: 0 },
];

const RECENT_ACTIVITY = [
  { kind: 'signup',   ts: '4 min ago',   text: 'New trial: Mizn Florist · Egypt · Starter plan', tenantId: 't_mizn' },
  { kind: 'verified', ts: '8 min ago',   text: 'Payment verified · Bayt Coffee Co. · £1,490', tenantId: 't_bayt' },
  { kind: 'verified', ts: '14 min ago',  text: 'Payment verified · Al Mahal Bookstores · £1,490', tenantId: 't_mahal' },
  { kind: 'submit',   ts: '38 min ago',  text: 'Receipt submitted · Najma Restaurants · £2,890 (amount mismatch)', tenantId: 't_najma' },
  { kind: 'upgrade',  ts: '2 hr ago',    text: 'Zaman Pharmacy Group upgraded from Growth → Scale', tenantId: 't_zaman' },
  { kind: 'suspend',  ts: 'yesterday',   text: 'Basta Wholesale suspended · invoice 23 days overdue', tenantId: 't_basta' },
  { kind: 'cancel',   ts: '3 days ago',  text: 'Hayy Bakery cancelled subscription · reason: closed shop', tenantId: 't_hayy' },
  { kind: 'signup',   ts: '6 days ago',  text: 'New trial: Qahwa Speciality · UAE · Starter plan', tenantId: 't_qahwa' },
];

window.ADMIN_DATA = {
  TENANTS, STATUS_MAP, PROOFS, PLATFORM_BANKS,
  ADMIN_TEAM, ADMIN_ROLES, LOGIN_AS_AUDIT, PLATFORM_AUDIT,
  ADMIN_INVOICES, RECENT_ACTIVITY,
};
