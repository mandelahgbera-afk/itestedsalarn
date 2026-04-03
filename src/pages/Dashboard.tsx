import { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import type { OutletContext } from '@/lib/auth';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import {
  Wallet, TrendingUp, TrendingDown, ArrowDownLeft,
  ArrowUpRight, ArrowLeftRight, Copy, Eye, EyeOff,
  Sparkles, ChevronRight, BarChart2
} from 'lucide-react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import { CoinIcon } from '@/components/ui/CryptoRow';

const QUICK_ACTIONS = [
  { label: 'Deposit',  icon: ArrowDownLeft, path: '/transactions', gradient: 'from-emerald-500/20 to-teal-500/10',  border: 'border-emerald-500/20', iconColor: 'text-emerald-400' },
  { label: 'Withdraw', icon: ArrowUpRight,  path: '/transactions', gradient: 'from-blue-500/20 to-cyan-500/10',     border: 'border-blue-500/20',    iconColor: 'text-blue-400' },
  { label: 'Trade',    icon: ArrowLeftRight, path: '/trade',       gradient: 'from-purple-500/20 to-pink-500/10',   border: 'border-purple-500/20',  iconColor: 'text-purple-400' },
  { label: 'Copy',     icon: Copy,           path: '/copy-trading', gradient: 'from-yellow-500/20 to-orange-500/10', border: 'border-yellow-500/20',  iconColor: 'text-yellow-400' },
];

const PIE_COLORS = ['#10b981', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4'];

const PERIODS = [
  { label: '7D',  days: 7 },
  { label: '30D', days: 30 },
  { label: '3M',  days: 90 },
  { label: 'All', days: 0 },
];

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-dark rounded-xl px-3 py-2 text-xs border border-white/10 bg-card shadow-xl">
      <p className="text-muted-foreground">{payload[0].payload.t}</p>
      <p className="font-mono font-bold text-primary">
        ${payload[0].value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

function buildChartData(txns: any[], currentBalance: number, days: number) {
  if (!txns.length) return [];
  const cutoff = days > 0 ? new Date(Date.now() - days * 86400000) : new Date(0);
  const all = [...txns].filter(tx => days === 0 || new Date(tx.created_at) >= cutoff);
  const sorted = all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let running = 0;
  const points: { t: string; v: number }[] = [];

  for (const tx of sorted) {
    if (tx.status === 'rejected') continue;
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'deposit'     && (tx.status === 'approved' || tx.status === 'completed')) running += amt;
    else if (tx.type === 'withdrawal' && tx.status === 'completed')                          running -= amt;
    else if (tx.type === 'buy'    && (tx.status === 'approved' || tx.status === 'completed')) running -= amt;
    else if (tx.type === 'sell'   && (tx.status === 'approved' || tx.status === 'completed')) running += amt;
    else if (tx.type === 'copy_profit' && (tx.status === 'approved' || tx.status === 'completed')) running += amt;

    const d = new Date(tx.created_at);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    points.push({ t: label, v: Math.max(0, running) });
  }

  if (points.length > 0 && currentBalance > 0) {
    points[points.length - 1].v = currentBalance;
  }
  if (points.length === 1) {
    points.unshift({ t: 'Start', v: 0 });
  }

  return points;
}

export default function Dashboard() {
  const { user } = useOutletContext<OutletContext>();
  const [balance, setBalance] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [cryptos, setCryptos] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [allTxns, setAllTxns] = useState<any[]>([]);
  const [hideBalance, setHideBalance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(3);

  const loadAll = useCallback(async () => {
    if (!user?.email) return;
    try {
      // 4 parallel queries instead of 5 — transactions fetched once (500),
      // sliced to 5 in JS for "recent", eliminating a redundant DB round trip.
      const [bal, port, cry, allTx] = await Promise.all([
        api.balances.getByEmail(user.email),
        api.portfolio.getByEmail(user.email),
        api.cryptos.active(),
        api.transactions.getByEmail(user.email, 500),
      ]);
      setBalance(bal || { balance_usd: 0, total_invested: 0, total_profit_loss: 0 });
      setPortfolio(port);
      setCryptos(cry);
      setTxns(allTx.slice(0, 5));
      setAllTxns(allTx);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!user?.email) return;
    const channel = supabase
      .channel(`user-dashboard-${user.email}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'user_balances', filter: `user_email=eq.${user.email}` },
        () => { loadAll(); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_email=eq.${user.email}` },
        () => { loadAll(); }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'portfolio', filter: `user_email=eq.${user.email}` },
        () => { loadAll(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.email, loadAll]);

  const totalBalance = balance?.balance_usd || 0;
  const pl = balance?.total_profit_loss || 0;
  const plPct = balance?.total_invested > 0 ? ((pl / balance.total_invested) * 100).toFixed(2) : '0.00';
  const isUp = pl >= 0;
  const isNewUser = !loading && totalBalance === 0 && txns.length === 0 && portfolio.length === 0;

  const chartColor = isUp ? 'hsl(160,84%,42%)' : 'hsl(0,72%,54%)';

  const portfolioWithPrices = portfolio.map((p, i) => {
    const crypto = cryptos.find(c => c.symbol === p.crypto_symbol);
    const currentValue = (crypto?.price || 0) * p.amount;
    return { ...p, currentValue, price: crypto?.price || 0, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  const pieData = portfolioWithPrices.map(p => ({ name: p.crypto_symbol, value: p.currentValue }));

  const selectedDays = PERIODS[period]?.days ?? 0;
  const chartData = useMemo(
    () => buildChartData(allTxns, totalBalance, selectedDays),
    [allTxns, totalBalance, selectedDays]
  );

  return (
    <div className="space-y-6">
      <PageHeader user={user} title="Dashboard" subtitle={`Welcome back, ${user?.full_name?.split(' ')[0] || 'Trader'}`} />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="relative bg-card border border-border rounded-3xl p-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground font-medium">Total Balance</span>
            </div>
            <button onClick={() => setHideBalance(!hideBalance)} className="text-muted-foreground hover:text-foreground transition-colors">
              {hideBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-end gap-4 mb-4">
            <h2 className="text-4xl font-black font-mono tabular-nums">
              {loading
                ? <span className="text-muted-foreground/40">Loading...</span>
                : hideBalance
                ? '••••••'
                : `$${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </h2>
            {!loading && !isNewUser && (
              <div className={`flex items-center gap-1 text-sm font-bold mb-1 ${isUp ? 'text-up' : 'text-down'}`}>
                {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isUp ? '+' : ''}{plPct}%
              </div>
            )}
          </div>
          {!loading && !isNewUser && (
            <p className={`text-sm font-mono ${isUp ? 'text-up' : 'text-down'}`}>
              {isUp ? '+' : ''}${Math.abs(pl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total P&L
            </p>
          )}
          {!loading && isNewUser && (
            <p className="text-sm text-muted-foreground">Make your first deposit to start trading</p>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-4 gap-3">
        {QUICK_ACTIONS.map(({ label, icon: Icon, path, gradient, border, iconColor }) => (
          <Link key={label} to={path}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl bg-gradient-to-br ${gradient} border ${border} hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer`}>
            <div className="w-9 h-9 rounded-xl bg-background/40 flex items-center justify-center">
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
            <span className="text-xs font-semibold">{label}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-card border border-border rounded-3xl p-5">
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm font-bold">Portfolio Performance</p>
            {!loading && chartData.length >= 2 && (
              <div className="flex items-center gap-1 bg-secondary rounded-xl p-1">
                {PERIODS.map(({ label }, i) => (
                  <button key={label} onClick={() => setPeriod(i)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${i === period ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {loading ? (
            <div className="h-48 shimmer rounded-xl" />
          ) : isNewUser || chartData.length < 2 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <BarChart2 className="w-7 h-7 text-primary/60" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground/80 mb-1">No performance data yet</p>
                <p className="text-xs text-muted-foreground max-w-[200px]">Your portfolio chart will appear here after your first deposit and trade</p>
              </div>
              <Link to="/transactions" className="text-xs font-semibold text-primary hover:underline">Make a deposit →</Link>
            </div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: 'hsl(215,14%,46%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(215,14%,46%)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="v" stroke={chartColor} strokeWidth={2}
                    fill="url(#chartGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card border border-border rounded-3xl p-5">
          <p className="text-sm font-bold mb-4">Allocation</p>
          {loading ? (
            <div className="h-40 shimmer rounded-xl" />
          ) : portfolioWithPrices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <Sparkles className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground text-center">No holdings yet.<br />Start trading to build your portfolio!</p>
              <Link to="/trade" className="text-xs font-semibold text-primary hover:underline">Trade now →</Link>
            </div>
          ) : (
            <>
              <div className="h-36 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={64} strokeWidth={0} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5">
                {portfolioWithPrices.slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                    <span className="text-xs text-muted-foreground flex-1">{p.crypto_symbol}</span>
                    <span className="text-xs font-mono font-semibold">${p.currentValue.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {!loading && cryptos.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          className="bg-card border border-border rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold">Market Snapshot</p>
            <Link to="/trade" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              Trade <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {cryptos.slice(0, 5).map(c => (
              <div key={c.id} className="flex flex-col gap-1 px-3 py-3 rounded-2xl bg-secondary hover:bg-secondary/80 transition-colors">
                <div className="flex items-center gap-2">
                  <CoinIcon symbol={c.symbol} size={6} />
                  <span className="text-xs font-bold">{c.symbol}</span>
                </div>
                <p className="text-sm font-mono font-bold tabular-nums">
                  ${c.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <span className={`text-xs font-semibold ${c.change_24h >= 0 ? 'text-up' : 'text-down'}`}>
                  {c.change_24h >= 0 ? '+' : ''}{c.change_24h?.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-3xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold">Recent Transactions</p>
          <Link to="/transactions" className="text-xs text-primary hover:underline flex items-center gap-0.5">
            All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-14 shimmer rounded-xl mb-2" />)
        ) : txns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-muted-foreground/40" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground/80">No transactions yet</p>
              <p className="text-xs text-muted-foreground mt-1">Deposit funds to get started</p>
            </div>
            <Link to="/transactions"
              className="text-xs font-semibold text-primary hover:underline px-4 py-2 rounded-xl bg-primary/10 border border-primary/20">
              Make your first deposit
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {txns.map(tx => {
              const isIn = ['deposit', 'sell', 'copy_profit'].includes(tx.type);
              return (
                <div key={tx.id} className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-secondary transition-colors">
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${isIn ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                    {isIn ? <ArrowDownLeft className="w-4 h-4 text-up" /> : <ArrowUpRight className="w-4 h-4 text-down" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold capitalize">{tx.type.replace('_', ' ')}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(tx.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-mono font-bold tabular-nums ${isIn ? 'text-up' : 'text-down'}`}>
                      {isIn ? '+' : '-'}${Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className={`text-[10px] font-semibold capitalize ${
                      tx.status === 'completed' || tx.status === 'approved' ? 'text-up'
                      : tx.status === 'rejected' ? 'text-down' : 'text-yellow-400'
                    }`}>{tx.status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
