import { useEffect, useState } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { DashboardStats } from '../types';
import api from '../services/api';
import { useT } from '../i18n/translations';

const fmt    = (n: number) => `LKR ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number) => Number(n).toLocaleString('en-US');

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'blue' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="stat-card">
      <p className="stat-label">{label}</p>
      <p className={`stat-value ${color === 'green' ? 'text-emerald-600' : color === 'red' ? 'text-red-500' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-surface-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Fill missing dates so chart always has 14 points ─────────────────────────
function fillDates<T extends Record<string, unknown>>(
  rows: T[],
  dateKey: string,
  defaults: Omit<T, typeof dateKey>
): T[] {
  const map = new Map(rows.map(r => [String(r[dateKey]).slice(0, 10), r]));
  const result: T[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push((map.get(key) ?? { [dateKey]: key, ...defaults }) as T);
  }
  return result;
}

// ── SVG Line Chart ─────────────────────────────────────────────────────────────
interface ChartPoint { date: string; value: number }

function LineChart({
  data, color, gradientId,
}: { data: ChartPoint[]; color: string; gradientId: string }) {
  if (data.length === 0) return <p className="text-sm text-surface-400 text-center py-8">No data</p>;

  const W = 560, H = 160;
  const PAD = { top: 12, right: 8, bottom: 28, left: 10 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.map(d => d.value), 1);

  const px = (i: number) => PAD.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
  const py = (v: number) => PAD.top + cH - (v / maxVal) * cH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(d.value)}`).join(' ');
  const areaPath = `${linePath} L${px(data.length - 1)},${PAD.top + cH} L${px(0)},${PAD.top + cH}Z`;

  // show every other label, always show first and last
  const showLabel = (i: number) => i === 0 || i === data.length - 1 || i % 2 === 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Horizontal grid lines */}
      {[0, 0.5, 1].map((frac, i) => (
        <line key={i}
          x1={PAD.left} y1={py(frac * maxVal)}
          x2={W - PAD.right} y2={py(frac * maxVal)}
          stroke="#e2e8f0" strokeWidth={0.8} strokeDasharray={i === 0 ? '0' : '3,3'} />
      ))}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" />

      {/* Data dots */}
      {data.map((d, i) => d.value > 0 && (
        <circle key={i} cx={px(i)} cy={py(d.value)} r={3}
          fill="white" stroke={color} strokeWidth={1.8} />
      ))}

      {/* X-axis date labels */}
      {data.map((d, i) => showLabel(i) && (
        <text key={i} x={px(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="#94a3b8">
          {new Date(d.date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
        </text>
      ))}

      {/* Max value label */}
      <text x={PAD.left + 2} y={PAD.top + 9} fontSize={8.5} fill={color} fontWeight="600">
        {maxVal >= 1000 ? `${(maxVal / 1000).toFixed(0)}k` : maxVal.toFixed(0)}
      </text>
    </svg>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const t = useT();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/dashboard')
      .then(r => setStats(r.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;
  if (!stats) return null;

  const salesTrend = fillDates(
    stats.revenue_trend.map(r => ({ date: String(r.date), revenue: Number(r.revenue), profit: Number(r.profit) })),
    'date',
    { revenue: 0, profit: 0 }
  ).map(r => ({ date: r.date, value: r.revenue }));

  const printshopTrend = fillDates(
    (stats.printshop_trend ?? []).map(r => ({
      date: String(r.date),
      total_cost: Number(r.total_cost),
      records: Number(r.records),
    })),
    'date',
    { total_cost: 0, records: 0 }
  ).map(r => ({ date: r.date, value: r.total_cost }));

  const salesTotal    = salesTrend.reduce((s, d) => s + d.value, 0);
  const printshopTotal = printshopTrend.reduce((s, d) => s + d.value, 0);

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">{t.dashboard_title}</h1>
        <div className="flex items-center gap-2">
          {stats.open_shift ? (
            <span className="badge-green">{t.shifts_open_btn}</span>
          ) : (
            <span className="badge-red">{t.dashboard_no_shift}</span>
          )}
          <span className="hidden sm:inline text-sm text-surface-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label={t.dashboard_today_revenue}  value={fmt(stats.today_revenue)}       color="blue"   />
        <StatCard label={t.dashboard_today_profit}   value={fmt(stats.today_profit)}        color="green"  />
        <StatCard label={t.dashboard_today_tx}       value={fmtNum(stats.today_transactions)} color="purple" />
        <StatCard label={t.dashboard_today_items}    value={fmtNum(stats.today_items_sold)} color="amber"  />
      </div>

      {/* Month & low stock */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label={t.dashboard_month_revenue} value={fmt(stats.month_revenue)}  color="blue"  />
        <StatCard label={t.dashboard_month_profit}  value={fmt(stats.month_profit)}   color="green" />
        <StatCard label={t.dashboard_low_stock}     value={fmtNum(stats.low_stock_count)} color="red" />
      </div>

      {/* ── Trend charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* POS Sales trend */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-surface-900">POS Sales — Last 14 Days</h3>
              <p className="text-xs text-surface-400 mt-0.5">Daily revenue trend</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-primary-600">{fmt(salesTotal)}</div>
              <div className="text-xs text-surface-400">14-day total</div>
            </div>
          </div>
          <div className="px-4 pt-3 pb-2">
            <LineChart data={salesTrend} color="#2563eb" gradientId="salesGrad" />
          </div>
          {/* Daily mini-table (last 5) */}
          <div className="px-5 pb-4">
            <div className="space-y-1">
              {salesTrend.slice(-5).map((d, i) => {
                const max = Math.max(...salesTrend.map(x => x.value), 1);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-surface-400 w-16 shrink-0">
                      {new Date(d.date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 bg-surface-100 rounded-full h-1.5">
                      <div className="bg-primary-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${max > 0 ? (d.value / max) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs font-mono text-surface-600 w-24 text-right shrink-0">
                      {fmt(d.value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Print Shop usage trend */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-surface-900">Print Shop Usage — Last 14 Days</h3>
              <p className="text-xs text-surface-400 mt-0.5">Daily stock cost consumed</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-violet-600">{fmt(printshopTotal)}</div>
              <div className="text-xs text-surface-400">14-day total</div>
            </div>
          </div>
          <div className="px-4 pt-3 pb-2">
            <LineChart data={printshopTrend} color="#7c3aed" gradientId="printshopGrad" />
          </div>
          {/* Daily mini-table (last 5) */}
          <div className="px-5 pb-4">
            <div className="space-y-1">
              {printshopTrend.slice(-5).map((d, i) => {
                const max = Math.max(...printshopTrend.map(x => x.value), 1);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-surface-400 w-16 shrink-0">
                      {new Date(d.date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 bg-surface-100 rounded-full h-1.5">
                      <div className="bg-violet-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${max > 0 ? (d.value / max) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs font-mono text-surface-600 w-24 text-right shrink-0">
                      {fmt(d.value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className="card">
        <div className="px-5 py-4 border-b border-surface-200">
          <h3 className="font-semibold text-surface-900">{t.dashboard_top_products}</h3>
        </div>
        <div className="p-2">
          {stats.top_products.length === 0 ? (
            <p className="text-sm text-surface-400 px-3 py-4 text-center">No sales data</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{t.dashboard_col_product}</th>
                  <th className="text-right">{t.dashboard_col_qty}</th>
                  <th className="text-right">{t.dashboard_col_revenue}</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_products.map((p, i) => (
                  <tr key={i}>
                    <td className="font-medium">{p.product_name}</td>
                    <td className="text-right font-mono">{p.qty_sold}</td>
                    <td className="text-right font-mono text-primary-600">{fmt(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
