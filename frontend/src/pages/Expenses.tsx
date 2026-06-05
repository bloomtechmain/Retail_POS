import { useState, useEffect, useCallback } from 'react';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/LoadingSpinner';
import { useToastStore } from '../store/toastStore';
import api from '../services/api';
import { AxiosError } from 'axios';

const fmt = (n: number) => `LKR ${Number(n).toFixed(2)}`;
const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

const CATEGORIES = [
  'Rent', 'Utilities', 'Salaries', 'Supplies', 'Maintenance',
  'Transport', 'Marketing', 'Equipment', 'Printing', 'Other',
];

const CATEGORY_COLORS: Record<string, string> = {
  Rent:        'badge-red',
  Utilities:   'badge-yellow',
  Salaries:    'badge-blue',
  Supplies:    'badge-green',
  Maintenance: 'badge-yellow',
  Transport:   'badge-blue',
  Marketing:   'badge-green',
  Equipment:   'badge-gray',
  Printing:    'badge-blue',
  Other:       'badge-gray',
};

interface Expense {
  id: number;
  reference_number: string;
  category: string;
  description?: string;
  amount: number;
  expense_date: string;
  notes?: string;
  created_by_name: string;
  created_at: string;
}

interface Summary {
  by_category: Array<{ category: string; total: string }>;
  grand_total: number;
}

export default function Expenses() {
  const toast = useToastStore();
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo,   setDateTo]   = useState(today);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [form, setForm] = useState({
    category:     '',
    description:  '',
    amount:       '',
    expense_date: today,
    notes:        '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, sumRes] = await Promise.all([
        api.get('/expenses', { params: { date_from: dateFrom, date_to: dateTo, category: categoryFilter || undefined, limit: 200 } }),
        api.get('/expenses/summary', { params: { date_from: dateFrom, date_to: dateTo } }),
      ]);
      setExpenses(listRes.data.data || []);
      setTotal(listRes.data.total || 0);
      setSummary(sumRes.data.data);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, categoryFilter]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.category)    { toast.error('Category is required'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    if (!form.expense_date) { toast.error('Date is required'); return; }
    setSaving(true);
    try {
      await api.post('/expenses', {
        category:     form.category,
        description:  form.description.trim() || undefined,
        amount:       parseFloat(form.amount),
        expense_date: form.expense_date,
        notes:        form.notes.trim() || undefined,
      });
      toast.success('Expense added');
      setAddModal(false);
      setForm({ category: '', description: '', amount: '', expense_date: today, notes: '' });
      load();
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      toast.error(e.response?.data?.message || 'Failed to add expense');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number, ref: string) => {
    if (!confirm(`Delete expense ${ref}? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Expense deleted');
      load();
    } catch {
      toast.error('Failed to delete expense');
    } finally { setDeleting(null); }
  };

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">Expenses</h1>
        <button onClick={() => setAddModal(true)} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Expense
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="label">From</label>
          <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="pt-5">
          <button onClick={load} className="btn-primary">Load</button>
        </div>
      </div>

      {loading ? <PageLoader /> : (
        <div className="space-y-5">
          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="stat-card col-span-2 lg:col-span-1">
                <p className="stat-label">Total Expenses</p>
                <p className="stat-value text-red-600">{fmt(Number(summary.grand_total))}</p>
                <p className="text-xs text-surface-400 mt-1">{total} records</p>
              </div>
              {summary.by_category.slice(0, 3).map(bc => (
                <div key={bc.category} className="stat-card">
                  <p className="stat-label">{bc.category}</p>
                  <p className="stat-value text-surface-700">{fmt(Number(bc.total))}</p>
                </div>
              ))}
            </div>
          )}

          {/* Category breakdown + table side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            {/* Category breakdown */}
            {summary && summary.by_category.length > 0 && (
              <div className="card p-4 space-y-2 lg:col-span-1">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">By Category</p>
                {summary.by_category.map(bc => {
                  const pct = summary.grand_total > 0
                    ? (Number(bc.total) / Number(summary.grand_total)) * 100
                    : 0;
                  return (
                    <div key={bc.category} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-surface-700">{bc.category}</span>
                        <span className="text-surface-500">{fmt(Number(bc.total))}</span>
                      </div>
                      <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t border-surface-200 flex justify-between font-semibold text-sm">
                  <span>Total</span>
                  <span className="text-red-600">{fmt(Number(summary.grand_total))}</span>
                </div>
              </div>
            )}

            {/* Expenses table */}
            <div className={`card overflow-hidden ${summary && summary.by_category.length > 0 ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th className="text-right">Amount</th>
                      <th>By</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-surface-400">
                          No expenses found for this period
                        </td>
                      </tr>
                    ) : expenses.map(exp => (
                      <tr key={exp.id}>
                        <td className="font-mono text-xs text-primary-600">{exp.reference_number}</td>
                        <td className="text-sm">{new Date(exp.expense_date).toLocaleDateString()}</td>
                        <td>
                          <span className={`badge ${CATEGORY_COLORS[exp.category] || 'badge-gray'}`}>
                            {exp.category}
                          </span>
                        </td>
                        <td>
                          <div className="font-medium">{exp.description || '—'}</div>
                          {exp.notes && <div className="text-xs text-surface-400">{exp.notes}</div>}
                        </td>
                        <td className="text-right font-mono font-semibold text-red-600">
                          {fmt(Number(exp.amount))}
                        </td>
                        <td className="text-sm text-surface-500">{exp.created_by_name}</td>
                        <td>
                          <button
                            onClick={() => handleDelete(exp.id, exp.reference_number)}
                            disabled={deleting === exp.id}
                            className="btn-ghost btn-sm text-red-500 hover:text-red-700 hover:bg-red-50">
                            {deleting === exp.id ? '…' : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      <Modal
        isOpen={addModal}
        onClose={() => setAddModal(false)}
        title="Add Expense"
        size="sm"
        footer={
          <>
            <button onClick={() => setAddModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleAdd} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Add Expense'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Category *</label>
            <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              <option value="">Select category…</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Monthly rent payment" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (LKR) *</label>
              <input type="number" min={0.01} step={0.01} className="input"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00" />
            </div>
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={2} className="input resize-none" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…" />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
