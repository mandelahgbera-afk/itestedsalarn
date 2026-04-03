import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CheckCircle, XCircle, Search, Key } from 'lucide-react';
import { api } from '@/lib/api';
import { generateOTP, otpExpiresAt } from '@/lib/utils';
import PageHeader from '@/components/ui/PageHeader';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const STATUS_META: Record<string, any> = {
  pending:   { label: 'Pending',   cls: 'text-yellow-400 bg-yellow-400/10' },
  approved:  { label: 'Approved',  cls: 'text-up bg-up' },
  completed: { label: 'Completed', cls: 'text-up bg-up' },
  rejected:  { label: 'Rejected',  cls: 'text-down bg-down' },
};

const TYPE_COLORS: Record<string, string> = {
  deposit:     'text-up bg-up',
  withdrawal:  'text-down bg-down',
  buy:         'text-blue-400 bg-blue-400/10',
  sell:        'text-purple-400 bg-purple-400/10',
  copy_profit: 'text-up bg-up',
};

export default function AdminTransactions() {
  const { user } = useOutletContext<any>();
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [updating, setUpdating] = useState<string | null>(null);

  const load = () =>
    api.transactions.getAll(200)
      .then(t => { setTxns(t); setLoading(false); })
      .catch(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const filtered = txns.filter(t => {
    const q = search.toLowerCase();
    const matchQ = !q || t.user_email?.toLowerCase().includes(q);
    const matchS = statusFilter === 'all' || t.status === statusFilter;
    const matchT = typeFilter === 'all' || t.type === typeFilter;
    return matchQ && matchS && matchT;
  });

  const approve = async (tx: any, action: 'approved' | 'rejected') => {
    setUpdating(tx.id);
    try {
      if (action === 'rejected') {
        // ── REJECT ───────────────────────────────────────────────────────────
        await api.transactions.update(tx.id, { status: 'rejected' });
        toast.success('Transaction rejected');

      } else if (tx.type === 'deposit') {
        // ── DEPOSIT APPROVAL ─────────────────────────────────────────────────
        // Credit balance first, then mark completed. Roll back balance if the
        // transaction record update fails (prevents silent double-credit on retry).
        const current = await api.balances.getByEmail(tx.user_email);
        const currentBal = current?.balance_usd ?? 0;
        await api.balances.update(tx.user_email, { balance_usd: currentBal + tx.amount });
        try {
          await api.transactions.update(tx.id, {
            status: 'completed',
            reviewed_by: user?.email,
            reviewed_at: new Date().toISOString(),
          });
        } catch (e) {
          await api.balances.update(tx.user_email, { balance_usd: currentBal }).catch(() => {});
          throw e;
        }
        toast.success(`Deposit approved — $${tx.amount.toLocaleString()} credited to ${tx.user_email}`);

      } else if (tx.type === 'withdrawal') {
        // ── WITHDRAWAL APPROVAL ──────────────────────────────────────────────
        // Reserve balance → generate OTP → update transaction record.
        // Roll back the balance reservation if the transaction record write fails.
        const current = await api.balances.getByEmail(tx.user_email);
        const currentBal = current?.balance_usd ?? 0;
        if (currentBal < tx.amount) {
          toast.error(`Insufficient balance — user has $${currentBal.toFixed(2)}, needs $${tx.amount.toFixed(2)}`);
          setUpdating(null);
          return;
        }
        const otp = generateOTP(6);
        const expires = otpExpiresAt(15);
        await api.balances.update(tx.user_email, { balance_usd: currentBal - tx.amount });
        try {
          await api.transactions.update(tx.id, {
            status: 'approved',
            otp_code: otp,
            otp_expires_at: expires,
            otp_verified: false,
            reviewed_by: user?.email,
            reviewed_at: new Date().toISOString(),
          });
        } catch (e) {
          await api.balances.update(tx.user_email, { balance_usd: currentBal }).catch(() => {});
          throw e;
        }
        toast.success(
          `Withdrawal approved. OTP: ${otp}`,
          {
            duration: 20000,
            description: `Balance reserved. Share this OTP with ${tx.user_email} via email/phone. Expires in 15 min.`,
          }
        );

      } else if (tx.type === 'buy') {
        // ── BUY ORDER APPROVAL ───────────────────────────────────────────────
        // Verify balance → deduct USD → add crypto to portfolio → mark completed.
        // Roll back the balance deduction if portfolio or record write fails.
        const current = await api.balances.getByEmail(tx.user_email);
        const currentBal = current?.balance_usd ?? 0;
        if (currentBal < tx.amount) {
          toast.error(`Insufficient balance — user has $${currentBal.toFixed(2)}, order is $${tx.amount.toFixed(2)}`);
          setUpdating(null);
          return;
        }
        await api.balances.update(tx.user_email, { balance_usd: currentBal - tx.amount });
        try {
          if (tx.crypto_symbol && tx.crypto_amount && tx.crypto_amount > 0) {
            const avgPrice = tx.amount / tx.crypto_amount;
            await api.portfolio.upsert(tx.user_email, tx.crypto_symbol, tx.crypto_amount, avgPrice);
          }
          await api.transactions.update(tx.id, {
            status: 'completed',
            reviewed_by: user?.email,
            reviewed_at: new Date().toISOString(),
          });
        } catch (e) {
          await api.balances.update(tx.user_email, { balance_usd: currentBal }).catch(() => {});
          throw e;
        }
        toast.success(`Buy approved — $${tx.amount.toFixed(2)} deducted, ${tx.crypto_amount} ${tx.crypto_symbol} added to portfolio`);

      } else if (tx.type === 'sell') {
        // ── SELL ORDER APPROVAL ──────────────────────────────────────────────
        // Remove crypto → credit USD → mark completed.
        // Roll back balance credit if the transaction record write fails.
        if (tx.crypto_symbol && tx.crypto_amount && tx.crypto_amount > 0) {
          await api.portfolio.reduce(tx.user_email, tx.crypto_symbol, tx.crypto_amount);
        }
        const current = await api.balances.getByEmail(tx.user_email);
        const currentBal = current?.balance_usd ?? 0;
        await api.balances.update(tx.user_email, { balance_usd: currentBal + tx.amount });
        try {
          await api.transactions.update(tx.id, {
            status: 'completed',
            reviewed_by: user?.email,
            reviewed_at: new Date().toISOString(),
          });
        } catch (e) {
          await api.balances.update(tx.user_email, { balance_usd: currentBal }).catch(() => {});
          throw e;
        }
        toast.success(`Sell approved — ${tx.crypto_amount} ${tx.crypto_symbol} removed, $${tx.amount.toFixed(2)} credited`);

      } else {
        // ── OTHER TYPES (copy_profit, etc.) ──────────────────────────────────
        await api.transactions.update(tx.id, {
          status: action,
          reviewed_by: user?.email,
          reviewed_at: new Date().toISOString(),
        });
        toast.success(`Transaction ${action}`);
      }

      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update transaction');
    }
    setUpdating(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        user={user}
        title="Transaction Management"
        subtitle={`${txns.filter(t => t.status === 'pending').length} pending approvals`}
      />

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email..."
            className="pl-9 bg-secondary border-border"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'approved', 'completed', 'rejected'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${statusFilter === s ? 'bg-primary/15 text-primary border border-primary/25' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'deposit', 'withdrawal', 'buy', 'sell'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${typeFilter === t ? 'bg-accent text-foreground border border-border' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="hidden sm:grid grid-cols-7 text-xs text-muted-foreground px-5 py-3 border-b border-border/60 font-medium">
          <span className="col-span-2">User</span>
          <span>Type</span>
          <span>Amount</span>
          <span>Status</span>
          <span>OTP</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="space-y-px">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 shimmer" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">No transactions found</div>
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map(tx => (
              <div key={tx.id}
                className="grid grid-cols-1 sm:grid-cols-7 items-center gap-3 px-5 py-4 hover:bg-secondary/30 transition-colors">

                <div className="sm:col-span-2 min-w-0">
                  <p className="text-xs font-semibold text-muted-foreground truncate">{tx.user_email}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(tx.created_at).toLocaleDateString()}</p>
                  {tx.wallet_address && (
                    <p className="text-[10px] text-muted-foreground font-mono truncate" title={tx.wallet_address}>
                      {tx.wallet_address.slice(0, 16)}…
                    </p>
                  )}
                  {tx.crypto_symbol && tx.crypto_amount && (
                    <p className="text-[10px] text-muted-foreground">{tx.crypto_amount} {tx.crypto_symbol}</p>
                  )}
                </div>

                <span className={`w-fit text-xs font-semibold px-2 py-1 rounded-lg capitalize ${TYPE_COLORS[tx.type] || 'bg-secondary text-muted-foreground'}`}>
                  {tx.type.replace('_', ' ')}
                </span>

                <p className="text-sm font-mono font-bold">
                  ${tx.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>

                <span className={`w-fit text-xs font-semibold px-2 py-1 rounded-lg capitalize ${STATUS_META[tx.status]?.cls || ''}`}>
                  {STATUS_META[tx.status]?.label || tx.status}
                </span>

                <div className="text-xs">
                  {tx.type === 'withdrawal' && tx.otp_code ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <Key className="w-3 h-3 text-yellow-400" />
                        <span className="font-mono font-bold text-yellow-300 tracking-widest">{tx.otp_code}</span>
                      </div>
                      <span className={`text-[10px] ${tx.otp_verified ? 'text-up' : 'text-yellow-400'}`}>
                        {tx.otp_verified
                          ? '✓ Verified'
                          : tx.otp_expires_at && new Date(tx.otp_expires_at) < new Date()
                            ? '⚠ Expired'
                            : 'Awaiting user'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>

                <div className="flex gap-1.5">
                  {tx.status === 'pending' ? (
                    <>
                      <button
                        onClick={() => approve(tx, 'approved')}
                        disabled={updating === tx.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-up text-up text-xs font-semibold hover:opacity-80 transition-opacity disabled:opacity-50">
                        <CheckCircle className="w-3.5 h-3.5" />
                        {updating === tx.id ? '...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => approve(tx, 'rejected')}
                        disabled={updating === tx.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-down text-down text-xs font-semibold hover:opacity-80 transition-opacity disabled:opacity-50">
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      {tx.status === 'completed' ? 'Done' : tx.status === 'approved' ? 'OTP sent' : 'Processed'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-secondary/60 border border-border rounded-2xl px-5 py-4 text-xs text-muted-foreground space-y-1.5">
        <p className="font-semibold text-foreground">Approval Logic Reference</p>
        <p><span className="text-up font-semibold">Deposit:</span> Credits user balance immediately → status moves to <em>Completed</em>.</p>
        <p><span className="text-down font-semibold">Withdrawal:</span> Checks &amp; reserves balance → generates OTP shown above → status <em>Approved</em>. Send OTP to user. Moves to <em>Completed</em> after user verifies.</p>
        <p><span className="text-blue-400 font-semibold">Buy:</span> Verifies balance → deducts USD → adds crypto to portfolio → status <em>Completed</em>.</p>
        <p><span className="text-purple-400 font-semibold">Sell:</span> Removes crypto from portfolio → credits USD → status <em>Completed</em>.</p>
      </div>
    </div>
  );
}
