import { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import api from '../services/api';
import { useT } from '../i18n/translations';
import { useToastStore } from '../store/toastStore';
import { PageContainer } from '../components/layout/Layout';

// ── Shop constants (shared with POS receipt)
const SHOP_NAME    = 'Kalanai Graphics & Print Solutions';
const SHOP_ADDRESS = '612/2/A, Kandy Road, Eldeniya, Kadawatha';
const SHOP_PHONE   = '0112 927 635 | 0706 812 220';

// ── Colour palette (shared between both PDF generators)
type RGB = [number, number, number];
const C: Record<string, RGB> = {
  navy:    [13,  37,  76],
  blue:    [30,  100, 220],
  rowEven: [244, 247, 252],
  border:  [200, 212, 230],
  text:    [20,  30,  50],
  muted:   [100, 115, 140],
  steel:   [160, 185, 220],
  white:   [255, 255, 255],
  red:     [200, 40,  40],
  green:   [22,  140, 70],
};

// ─────────────────────────────────────────────
// Custom Invoice PDF generator
// ─────────────────────────────────────────────
interface CILine {
  id: number;
  description: string;
  qty: number;
  unit_price: number;
  discount: number;  // per-line LKR discount
}

interface CIData {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  items: CILine[];
  notes: string;
  discount_total: number; // bill-level discount
  tax_rate: number;       // %
}

function downloadCustomInvoicePDF(data: CIData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210, H = 297, ML = 14, MR = 14, CW = W - ML - MR;

  const fill   = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const ink    = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const n      = (v: number | string) => Number(v).toFixed(2);
  const lkr    = (v: number | string) => `LKR ${n(v)}`;
  const bold   = () => doc.setFont('helvetica', 'bold');
  const normal = () => doc.setFont('helvetica', 'normal');
  const sz     = (s: number) => doc.setFontSize(s);
  const hline  = (y: number, x1 = ML, x2 = W - MR, lw = 0.3) => {
    stroke(C.border); doc.setLineWidth(lw); doc.line(x1, y, x2, y);
  };

  // ── 1. HEADER BANNER
  fill(C.navy); doc.rect(0, 0, W, 42, 'F');
  fill(C.blue); doc.rect(W - 6, 0, 6, 42, 'F');
  bold(); sz(17); ink(C.white);
  doc.text(SHOP_NAME, ML, 16);
  normal(); sz(8.5); ink(C.steel);
  doc.text(SHOP_ADDRESS, ML, 24);
  doc.text(SHOP_PHONE, ML, 30.5);
  // INVOICE badge
  fill(C.blue); doc.rect(W - 58, 8, 46, 16, 'F');
  bold(); sz(15); ink(C.white);
  doc.text('INVOICE', W - 35, 19, { align: 'center' });
  // accent line
  fill(C.blue); doc.rect(0, 42, W - 6, 1.5, 'F');

  // ── 2. META
  const metaY = 50;
  // Left: invoice number + date
  bold(); sz(8); ink(C.muted); doc.text('INVOICE NO.', ML, metaY);
  bold(); sz(11); ink(C.navy); doc.text(data.invoice_number, ML, metaY + 6);
  const displayDate = new Date(data.invoice_date).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  normal(); sz(8); ink(C.muted); doc.text(displayDate, ML, metaY + 13);

  // Right: customer info
  const RX = W - MR;
  if (data.customer_name) {
    bold(); sz(8); ink(C.muted); doc.text('BILL TO', RX, metaY, { align: 'right' });
    bold(); sz(10); ink(C.navy); doc.text(data.customer_name, RX, metaY + 6, { align: 'right' });
    normal(); sz(8); ink(C.text);
    if (data.customer_address) { doc.text(data.customer_address, RX, metaY + 12, { align: 'right' }); }
    if (data.customer_phone)   { doc.text(data.customer_phone, RX, metaY + (data.customer_address ? 18 : 12), { align: 'right' }); }
  }
  hline(metaY + 26, ML, W - MR, 0.5);

  // ── 3. ITEMS TABLE
  const TBL_TOP = metaY + 32;
  const ROW_H   = 8.5;
  const hasDisc = data.items.some(i => i.discount > 0);

  const COL = {
    num  : ML,
    desc : ML + 10,
    qty  : ML + 105,
    price: ML + 135,
    disc : ML + 158,
    total: W - MR,
  };

  // Header row
  fill(C.navy); doc.rect(ML, TBL_TOP, CW, 9, 'F');
  bold(); sz(8); ink(C.white);
  doc.text('#',           COL.num   + 1, TBL_TOP + 6);
  doc.text('DESCRIPTION', COL.desc,      TBL_TOP + 6);
  doc.text('QTY',         COL.qty,       TBL_TOP + 6, { align: 'center' });
  doc.text('UNIT PRICE',  COL.price,     TBL_TOP + 6, { align: 'right' });
  if (hasDisc) doc.text('DISC.', COL.disc, TBL_TOP + 6, { align: 'right' });
  doc.text('TOTAL',       COL.total,     TBL_TOP + 6, { align: 'right' });

  let rowY = TBL_TOP + 9;
  normal(); sz(9);

  data.items.forEach((item, idx) => {
    if (idx % 2 === 0) { fill(C.rowEven); doc.rect(ML, rowY, CW, ROW_H, 'F'); }
    ink(C.muted); doc.text(String(idx + 1), COL.num + 1, rowY + 5.5);
    ink(C.text); bold();
    const desc = item.description.length > (hasDisc ? 34 : 42)
      ? item.description.slice(0, hasDisc ? 32 : 40) + '..'
      : item.description;
    doc.text(desc, COL.desc, rowY + 5.5);
    normal(); ink(C.text);
    doc.text(String(item.qty),         COL.qty,   rowY + 5.5, { align: 'center' });
    doc.text(lkr(item.unit_price),     COL.price, rowY + 5.5, { align: 'right' });
    if (hasDisc) {
      ink(item.discount > 0 ? C.red : C.muted);
      doc.text(item.discount > 0 ? `-${lkr(item.discount)}` : '—', COL.disc, rowY + 5.5, { align: 'right' });
    }
    const lineTotal = item.qty * item.unit_price - item.discount;
    ink(C.text); bold();
    doc.text(lkr(lineTotal), COL.total, rowY + 5.5, { align: 'right' });
    rowY += ROW_H;
  });

  hline(rowY, ML, W - MR, 0.4); rowY += 6;

  // ── 4. TOTALS BLOCK
  const itemSubtotal = data.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const itemDiscTotal = data.items.reduce((s, i) => s + i.discount, 0);
  const afterItemDisc = itemSubtotal - itemDiscTotal;
  const afterBillDisc = afterItemDisc - data.discount_total;
  const taxAmount = (afterBillDisc * data.tax_rate) / 100;
  const grandTotal = afterBillDisc + taxAmount;

  const TOT_LEFT = W - MR - 80;
  const addTotRow = (label: string, value: string, color: RGB = C.text, bold_ = false) => {
    bold_ ? bold() : normal(); sz(9);
    ink(C.muted); doc.text(label, TOT_LEFT, rowY);
    bold_ ? bold() : normal(); ink(color);
    doc.text(value, W - MR, rowY, { align: 'right' });
    rowY += 6;
  };

  addTotRow('Subtotal', lkr(itemSubtotal));
  if (itemDiscTotal > 0) addTotRow('Item Discounts', `-${lkr(itemDiscTotal)}`, C.red);
  if (data.discount_total > 0) addTotRow('Bill Discount', `-${lkr(data.discount_total)}`, C.red);
  if (data.tax_rate > 0) addTotRow(`Tax (${data.tax_rate}%)`, lkr(taxAmount));

  rowY += 1;
  fill(C.navy); doc.rect(TOT_LEFT - 4, rowY - 1, W - MR - TOT_LEFT + 4 + MR, 11, 'F');
  bold(); sz(10); ink(C.white); doc.text('TOTAL DUE', TOT_LEFT, rowY + 7);
  sz(12); doc.text(lkr(grandTotal), W - MR, rowY + 7, { align: 'right' });
  rowY += 18;

  // ── 5. NOTES
  if (data.notes.trim()) {
    stroke(C.border); doc.setLineWidth(0.3);
    doc.rect(ML, rowY, CW, 0.3, 'F');
    rowY += 4;
    bold(); sz(8.5); ink(C.navy); doc.text('NOTES / TERMS', ML, rowY); rowY += 6;
    normal(); sz(8.5); ink(C.text);
    const lines = doc.splitTextToSize(data.notes, CW);
    doc.text(lines, ML, rowY);
    rowY += lines.length * 5;
  }

  // ── 6. FOOTER
  const FY = H - 20;
  fill(C.navy); doc.rect(0, FY - 3, W, 23, 'F');
  fill(C.blue); doc.rect(0, FY - 3, W, 1.5, 'F');
  bold(); sz(9.5); ink(C.white);
  doc.text(`Thank you for choosing ${SHOP_NAME}!`, W / 2, FY + 5, { align: 'center' });
  normal(); sz(8); ink(C.steel);
  doc.text(SHOP_ADDRESS, W / 2, FY + 11, { align: 'center' });
  doc.text(SHOP_PHONE,   W / 2, FY + 16, { align: 'center' });

  doc.save(`Invoice-${data.invoice_number}.pdf`);
}

// ── Helpers
function genInvoiceNumber() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `CI-${date}-${rand}`;
}
const today = () => new Date().toISOString().slice(0, 10);

// ─────────────────────────────────────────────
// Custom Invoice Tab
// ─────────────────────────────────────────────
function CustomInvoiceTab() {
  const toast = useToastStore();

  const [invoiceNumber, setInvoiceNumber] = useState(genInvoiceNumber);
  const [invoiceDate, setInvoiceDate]     = useState(today);
  const [customerName, setCustomerName]   = useState('');
  const [customerAddr, setCustomerAddr]   = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes]                 = useState('');
  const [billDiscount, setBillDiscount]   = useState(0);
  const [taxRate, setTaxRate]             = useState(0);

  const [lines, setLines] = useState<CILine[]>([
    { id: 1, description: '', qty: 1, unit_price: 0, discount: 0 },
  ]);

  const addLine = () =>
    setLines(prev => [...prev, { id: Date.now(), description: '', qty: 1, unit_price: 0, discount: 0 }]);

  const removeLine = (id: number) =>
    setLines(prev => prev.filter(l => l.id !== id));

  const updateLine = (id: number, field: keyof CILine, value: string | number) =>
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));

  // Live totals
  const itemSubtotal  = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const itemDiscTotal = lines.reduce((s, l) => s + l.discount, 0);
  const afterDiscs    = itemSubtotal - itemDiscTotal - billDiscount;
  const taxAmount     = (afterDiscs * taxRate) / 100;
  const grandTotal    = afterDiscs + taxAmount;

  const handleDownload = () => {
    if (!customerName.trim()) { toast.error('Customer name is required'); return; }
    if (lines.every(l => !l.description.trim())) { toast.error('Add at least one item'); return; }
    const validLines = lines.filter(l => l.description.trim());
    downloadCustomInvoicePDF({
      invoice_number  : invoiceNumber,
      invoice_date    : invoiceDate,
      customer_name   : customerName.trim(),
      customer_address: customerAddr.trim(),
      customer_phone  : customerPhone.trim(),
      items           : validLines,
      notes           : notes.trim(),
      discount_total  : billDiscount,
      tax_rate        : taxRate,
    });
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-sky-500';
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1';
  const numInput = (val: number, onChange: (v: number) => void, cls = '') =>
    <input type="number" min={0} step={0.01} value={val || ''} onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={`${inputCls} ${cls}`} />;

  return (
    <div className="space-y-6">
      {/* Invoice meta + customer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: invoice meta */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoice Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Invoice Number</label>
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Invoice Date</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Bill Discount (LKR)</label>
              {numInput(billDiscount, setBillDiscount)}
            </div>
            <div>
              <label className={labelCls}>Tax Rate (%)</label>
              {numInput(taxRate, setTaxRate)}
            </div>
          </div>
          <div>
            <label className={labelCls}>Notes / Terms (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Payment due within 14 days..."
              className={`${inputCls} resize-none`} />
          </div>
        </div>

        {/* Right: customer */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bill To</p>
          <div>
            <label className={labelCls}>Customer Name *</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)}
              placeholder="e.g. ABC Company" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Address</label>
            <input value={customerAddr} onChange={e => setCustomerAddr(e.target.value)}
              placeholder="Street, City" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
              placeholder="07X XXX XXXX" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Line items table */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Line Items</p>
          <button onClick={addLine}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-400 border border-sky-500/40 hover:bg-sky-500/10 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Line
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-xs text-slate-400 uppercase border-b border-slate-700">
                <th className="text-left px-4 py-2.5 w-5/12">Description</th>
                <th className="text-center px-2 py-2.5 w-1/12">Qty</th>
                <th className="text-right px-3 py-2.5 w-2/12">Unit Price</th>
                <th className="text-right px-3 py-2.5 w-2/12">Discount</th>
                <th className="text-right px-3 py-2.5 w-2/12">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const lineTotal = line.qty * line.unit_price - line.discount;
                return (
                  <tr key={line.id} className="border-b border-slate-700/50 last:border-0 group">
                    <td className="px-4 py-2">
                      <input value={line.description}
                        onChange={e => updateLine(line.id, 'description', e.target.value)}
                        placeholder={`Item ${idx + 1}`}
                        className="w-full bg-transparent text-slate-100 text-sm placeholder-slate-600 focus:outline-none border-b border-transparent focus:border-sky-500 pb-0.5 transition-colors" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min={0.001} step={0.001} value={line.qty || ''}
                        onChange={e => updateLine(line.id, 'qty', parseFloat(e.target.value) || 0)}
                        className="w-full text-center bg-slate-700/60 rounded px-1.5 py-1 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} step={0.01} value={line.unit_price || ''}
                        onChange={e => updateLine(line.id, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-full text-right bg-slate-700/60 rounded px-1.5 py-1 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} step={0.01} value={line.discount || ''}
                        onChange={e => updateLine(line.id, 'discount', parseFloat(e.target.value) || 0)}
                        className="w-full text-right bg-slate-700/60 rounded px-1.5 py-1 text-red-400 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500" />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-200">
                      {lineTotal.toFixed(2)}
                    </td>
                    <td className="pr-2 py-2">
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(line.id)}
                          className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals summary */}
        <div className="border-t border-slate-700 bg-slate-800/60 px-4 py-3">
          <div className="flex justify-end">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span>LKR {itemSubtotal.toFixed(2)}</span>
              </div>
              {itemDiscTotal > 0 && (
                <div className="flex justify-between text-red-400">
                  <span>Item Discounts</span>
                  <span>-LKR {itemDiscTotal.toFixed(2)}</span>
                </div>
              )}
              {billDiscount > 0 && (
                <div className="flex justify-between text-red-400">
                  <span>Bill Discount</span>
                  <span>-LKR {billDiscount.toFixed(2)}</span>
                </div>
              )}
              {taxRate > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Tax ({taxRate}%)</span>
                  <span>LKR {taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-100 text-base pt-1.5 border-t border-slate-600">
                <span>TOTAL</span>
                <span>LKR {grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Download button */}
      <button onClick={handleDownload}
        className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2.5 transition-all hover:opacity-90"
        style={{ background: 'linear-gradient(90deg, #0d254c 0%, #1e64dc 100%)' }}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        Download PDF Invoice
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Internal Use Tab (existing logic, extracted)
// ─────────────────────────────────────────────
interface Product {
  id: number;
  name: string;
  barcode?: string;
  sku: string;
  avg_cost: number;
  current_stock: number;
}
interface CartItem {
  product_id: number;
  product_name: string;
  barcode?: string;
  quantity: number;
  cost_price: number;
  subtotal: number;
}
interface InternalUseRecord {
  id: number;
  reference_number: string;
  purpose?: string;
  notes?: string;
  total_cost: number;
  created_by_name: string;
  created_at: string;
}

function InternalUseTab() {
  const t = useT();
  const toast = useToastStore();

  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchOpen, setSearchOpen]     = useState(false);
  const [cartItems, setCartItems]       = useState<CartItem[]>([]);
  const [purpose, setPurpose]           = useState('');
  const [notes, setNotes]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [history, setHistory]           = useState<InternalUseRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage]   = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewRecord, setViewRecord]     = useState<any>(null);
  const [showView, setShowView]         = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadHistory(1); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearchOpen(false); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/products', { params: { search: searchQuery, limit: 10 } });
        setSearchResults(res.data.data || []);
        setSearchOpen(true);
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const loadHistory = async (page: number) => {
    setLoadingHistory(true);
    try {
      const res = await api.get('/internal-use', { params: { page, limit: 10 } });
      setHistory(res.data.data || []);
      setHistoryTotal(res.data.total || 0);
      setHistoryPage(page);
    } catch { toast.error('Failed to load history'); }
    finally { setLoadingHistory(false); }
  };

  const addToCart = (product: Product) => {
    setSearchQuery(''); setSearchOpen(false);
    const existing = cartItems.find(i => i.product_id === product.id);
    if (existing) { updateQty(product.id, existing.quantity + 1); return; }
    const cost = parseFloat(product.avg_cost as any) || 0;
    setCartItems(prev => [...prev, {
      product_id: product.id, product_name: product.name,
      barcode: product.barcode, quantity: 1, cost_price: cost, subtotal: cost,
    }]);
  };

  const updateQty = (id: number, qty: number) => {
    if (qty <= 0) { removeItem(id); return; }
    setCartItems(prev => prev.map(i =>
      i.product_id === id ? { ...i, quantity: qty, subtotal: parseFloat((i.cost_price * qty).toFixed(2)) } : i
    ));
  };
  const removeItem = (id: number) => setCartItems(prev => prev.filter(i => i.product_id !== id));

  const totalCost = cartItems.reduce((s, i) => s + i.subtotal, 0);

  const handleSubmit = async () => {
    if (!cartItems.length) { toast.error('Add at least one item'); return; }
    setSubmitting(true);
    try {
      await api.post('/internal-use', {
        items: cartItems.map(i => ({ product_id: i.product_id, product_name: i.product_name, barcode: i.barcode, quantity: i.quantity })),
        purpose: purpose.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success('Internal use recorded. Stock updated.');
      setCartItems([]); setPurpose(''); setNotes(''); loadHistory(1);
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to record'); }
    finally { setSubmitting(false); }
  };

  const handleView = async (id: number) => {
    try { const res = await api.get(`/internal-use/${id}`); setViewRecord(res.data.data); setShowView(true); }
    catch { toast.error('Failed to load record'); }
  };

  const fmt = (n: number) => n.toFixed(2);
  const fmtDate = (s: string) => new Date(s).toLocaleString();
  const inputCls = 'w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-sky-500';

  return (
    <div className="space-y-6">
      {/* Notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm">
        <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{t.printshop_stock_note}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: product search + cart */}
        <div className="space-y-4">
          <div ref={searchRef} className="relative">
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.printshop_search_placeholder} className={inputCls} />
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-lg border border-slate-700 bg-slate-800 shadow-xl overflow-hidden max-h-64 overflow-y-auto">
                {searchResults.map(p => (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-700 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">{p.name}</div>
                      <div className="text-xs text-slate-400">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400">Cost: {fmt(parseFloat(p.avg_cost as any) || 0)}</div>
                      <div className="text-xs text-slate-500">Stock: {p.current_stock}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase">
                  <th className="text-left px-3 py-2">{t.printshop_col_product}</th>
                  <th className="text-center px-2 py-2 w-24">{t.printshop_col_qty}</th>
                  <th className="text-right px-3 py-2 w-24">{t.printshop_col_subtotal}</th>
                  <th className="w-8 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {!cartItems.length ? (
                  <tr><td colSpan={4} className="text-center py-8 text-slate-500 text-sm">{t.printshop_empty_items}</td></tr>
                ) : cartItems.map(item => (
                  <tr key={item.product_id} className="border-b border-slate-700/50 last:border-0">
                    <td className="px-3 py-2">
                      <div className="text-slate-200 text-sm truncate max-w-[160px]">{item.product_name}</div>
                      <div className="text-slate-500 text-xs">@ {fmt(item.cost_price)} each</div>
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" min={0.001} step={0.001} value={item.quantity}
                        onChange={e => updateQty(item.product_id, parseFloat(e.target.value) || 0)}
                        className="w-full text-center px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-100 text-sm focus:outline-none focus:border-sky-500" />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-200">{fmt(item.subtotal)}</td>
                    <td className="pr-2 py-2">
                      <button onClick={() => removeItem(item.product_id)} className="text-slate-500 hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cartItems.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-700 bg-slate-800">
                <span className="text-sm text-slate-400">{t.printshop_total_cost}</span>
                <span className="text-base font-bold text-slate-100">LKR {fmt(totalCost)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: purpose / notes / submit */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">{t.printshop_purpose}</label>
            <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)}
              placeholder={t.printshop_purpose_placeholder} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">{t.printshop_notes}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className={`${inputCls} resize-none`} />
          </div>
          <button onClick={handleSubmit} disabled={submitting || !cartItems.length}
            className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(90deg, #0284c7 0%, #0ea5e9 100%)' }}>
            {submitting ? t.printshop_submitting : t.printshop_submit}
          </button>
        </div>
      </div>

      {/* History */}
      <div>
        <h2 className="text-base font-semibold text-slate-200 mb-3">{t.printshop_history_title}</h2>
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400 uppercase">
                <th className="text-left px-4 py-2.5">{t.printshop_col_ref}</th>
                <th className="text-left px-4 py-2.5">{t.printshop_col_purpose}</th>
                <th className="text-right px-4 py-2.5">{t.printshop_col_total}</th>
                <th className="text-left px-4 py-2.5">{t.printshop_col_by}</th>
                <th className="text-left px-4 py-2.5">{t.printshop_col_date}</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">{t.loading}</td></tr>
              ) : !history.length ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">{t.printshop_no_data}</td></tr>
              ) : history.map(rec => (
                <tr key={rec.id} className="border-b border-slate-700/50 last:border-0 hover:bg-slate-700/30">
                  <td className="px-4 py-2.5 text-sky-400 font-mono text-xs">{rec.reference_number}</td>
                  <td className="px-4 py-2.5 text-slate-300">{rec.purpose || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-slate-200">LKR {fmt(parseFloat(rec.total_cost as any) || 0)}</td>
                  <td className="px-4 py-2.5 text-slate-400">{rec.created_by_name}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(rec.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => handleView(rec.id)} className="text-xs text-sky-400 hover:text-sky-300 transition-colors">
                      {t.printshop_view}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {historyTotal > 10 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-700">
              <span className="text-xs text-slate-500">{historyTotal} total</span>
              <div className="flex gap-2">
                <button disabled={historyPage <= 1} onClick={() => loadHistory(historyPage - 1)}
                  className="px-3 py-1 text-xs rounded bg-slate-700 text-slate-300 disabled:opacity-40">Prev</button>
                <button disabled={historyPage * 10 >= historyTotal} onClick={() => loadHistory(historyPage + 1)}
                  className="px-3 py-1 text-xs rounded bg-slate-700 text-slate-300 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View modal */}
      {showView && viewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-lg rounded-xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="font-semibold text-slate-100">{viewRecord.reference_number}</h3>
              <button onClick={() => setShowView(false)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              {[
                [t.printshop_col_purpose, viewRecord.purpose || '—'],
                [t.printshop_col_by, viewRecord.created_by_name],
                [t.printshop_col_date, fmtDate(viewRecord.created_at)],
                ...(viewRecord.notes ? [[t.notes, viewRecord.notes]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-400">
                  <span>{k}:</span><span className="text-slate-200">{v}</span>
                </div>
              ))}
              <div className="mt-3 rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800">
                    <tr className="text-slate-400 uppercase">
                      <th className="text-left px-3 py-2">{t.printshop_col_product}</th>
                      <th className="text-center px-2 py-2">{t.printshop_col_qty}</th>
                      <th className="text-right px-3 py-2">{t.printshop_col_subtotal}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewRecord.items?.map((item: any) => (
                      <tr key={item.id} className="border-t border-slate-700">
                        <td className="px-3 py-2 text-slate-200">{item.product_name}</td>
                        <td className="px-2 py-2 text-center text-slate-300">{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-slate-200">LKR {fmt(parseFloat(item.subtotal) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-600 bg-slate-800">
                      <td colSpan={2} className="px-3 py-2 text-slate-400 text-right font-medium">{t.printshop_total_cost}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-100">
                        LKR {fmt(parseFloat(viewRecord.total_cost) || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main PrintShop page with tabs
// ─────────────────────────────────────────────
type Tab = 'internal-use' | 'custom-invoice';

export default function PrintShop() {
  const [activeTab, setActiveTab] = useState<Tab>('internal-use');

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    {
      id: 'internal-use',
      label: 'Internal Use',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      ),
    },
    {
      id: 'custom-invoice',
      label: 'Custom Invoice',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <PageContainer>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Page header */}
        <h1 className="text-xl font-bold text-slate-100">Print Shop</h1>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl bg-slate-800/60 border border-slate-700 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                activeTab === tab.id
                  ? 'text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={activeTab === tab.id ? {
                background: 'linear-gradient(90deg, rgba(13,37,76,0.9) 0%, rgba(30,100,220,0.8) 100%)',
                boxShadow: '0 2px 8px rgba(30,100,220,0.3)',
              } : {}}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'internal-use'   && <InternalUseTab />}
        {activeTab === 'custom-invoice' && <CustomInvoiceTab />}
      </div>
    </PageContainer>
  );
}
