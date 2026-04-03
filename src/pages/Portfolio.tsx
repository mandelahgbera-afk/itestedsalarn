import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { OutletContext } from '@/lib/auth';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import { CoinIcon } from '@/components/ui/CryptoRow';

const PIE_COLORS = ['#10b981', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

export default function Portfolio() {
  const { user } = useOutletContext<OutletContext>();
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [cryptos, setCryptos] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    Promise.all([
      api.portfolio.getByEmail(user.email),
      api.cryptos.active(),
      api.balances.getByEmail(user.email),
    ]).then(([port, cry, bal]) => {
      setPortfolio(port);
      setCryptos(cry);
      setBalance(bal);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user?.email]);

  const enriched = portfolio.map((p, i) => {
    const crypto = cryptos.find(c => c.symbol === p.crypto_symbol);
    const price = crypto?.price || 0;
    const change = crypto?.change_24h || 0;
    const currentValue = price * p.amount;
    const invested = p.avg_buy_price * p.amount;
    const pnl = currentValue - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...p, price, change, currentValue, invested, pnl, pnlPct, color: PIE_COLORS[i % PIE_COLORS.length] };
  });

  const totalValue = enriched.reduce((s, p) => s + p.currentValue, 0);
  const totalInvested = enriched.reduce((s, p) => s + p.invested, 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  const pieData = enriched.map(p => ({ name: p.crypto_symbol, value: p.currentValue }));

  return (
    <div className="space-y-6">
      <PageHeader user={user} title="Portfolio" subtitle="Your crypto holdings" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Value', value: `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: 'Total Invested', value: `$${totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
          { label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : ''}$${Math.abs(totalPnl).toFixed(2)}`, sub: `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`, up: totalPnl >= 0 },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{s.label}</p>
            <p className={`text-2xl font-bold font-mono ${'up' in s && s.up !== undefined ? (s.up ? 'text-up' : 'text-down') : ''}`}>{s.value}</p>
            {s.sub && <p className={`text-xs mt-1 ${'up' in s && s.up !== undefined ? (s.up ? 'text-up' : 'text-down') : 'text-muted-foreground'}`}>{s.sub}</p>}
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-border rounded-2xl p-5">
          <p className="text-sm font-bold mb-4">Allocation</p>
          {loading ? (
            <div className="h-48 shimmer rounded-xl" />
          ) : enriched.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Sparkles className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No holdings yet</p>
            </div>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} strokeWidth={0} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {enriched.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                    <span className="text-xs text-muted-foreground flex-1">{p.crypto_symbol}</span>
                    <span className="text-xs font-mono">{totalValue > 0 ? ((p.currentValue / totalValue) * 100).toFixed(1) : 0}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <p className="text-sm font-bold mb-4">Holdings</p>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-secondary rounded-xl animate-pulse" />)}</div>
          ) : enriched.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No holdings. Start trading to build your portfolio.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left pb-3 font-medium">Asset</th>
                    <th className="text-right pb-3 font-medium">Amount</th>
                    <th className="text-right pb-3 font-medium">Price</th>
                    <th className="text-right pb-3 font-medium">Value</th>
                    <th className="text-right pb-3 font-medium">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {enriched.map(p => (
                    <tr key={p.id} className="hover:bg-secondary/50 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-2.5">
                          <CoinIcon symbol={p.crypto_symbol} size={7} />
                          <div>
                            <p className="font-semibold">{p.crypto_symbol}</p>
                            <p className="text-xs text-muted-foreground">{p.change >= 0 ? '+' : ''}{p.change?.toFixed(2)}% 24h</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-right font-mono text-muted-foreground">{p.amount}</td>
                      <td className="py-3 text-right font-mono">${p.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 text-right font-mono font-semibold">${p.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-3 text-right">
                        <p className={`font-mono font-semibold text-xs ${p.pnl >= 0 ? 'text-up' : 'text-down'}`}>
                          {p.pnl >= 0 ? '+' : ''}${Math.abs(p.pnl).toFixed(2)}
                        </p>
                        <p className={`text-xs ${p.pnlPct >= 0 ? 'text-up' : 'text-down'}`}>
                          {p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(2)}%
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
