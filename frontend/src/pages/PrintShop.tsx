import { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import api from '../services/api';
import { useT } from '../i18n/translations';
import { useToastStore } from '../store/toastStore';
import { PageContainer } from '../components/layout/Layout';
import { Modal } from '../components/ui/Modal';
import kalaniLogo from '../assets/kalani-logo.png';

// ── Shop constants (shared with POS receipt)
const SHOP_NAME    = 'KALANI GRAPHICS AND PRINT SOLUTIONS';
const SHOP_REG      = 'REG:WK17639';
const SHOP_ADDRESS_LINES = ['163/43, 4th Lane,', 'Bangalawattha,', 'Kirillawala,', 'Kadawatha.'];
const SHOP_PHONES   = ['0706812220', '0743317681'];
const SHOP_ADDRESS = SHOP_ADDRESS_LINES.join(' ');
const SHOP_PHONE   = SHOP_PHONES.join(' | ');
const BANK_NAME     = 'BANK OF CEYLON - KADAWATHA';
const BANK_ACCOUNT  = '0090187084';
const LOGO_ASPECT   = 1064 / 1478;

// Cache the logo as a data URL so jsPDF can embed it without a per-invoice fetch
let logoDataUrlPromise: Promise<string> | null = null;
function loadLogoDataUrl(): Promise<string> {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(kalaniLogo)
      .then(res => res.blob())
      .then(blob => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }));
  }
  return logoDataUrlPromise;
}

// ── Colour palette for PDF only
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
  orange:  [200, 100, 20],
};

// ─────────────────────────────────────────────
// Custom Invoice PDF generator
// ─────────────────────────────────────────────
interface CILine {
  id: number;
  description: string;
  qty: number;
  unit_price: number;
  discount: number;
}

interface CIData {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_address: string;
  customer_phone: string;
  items: CILine[];
  notes: string;
  discount_total: number;
  tax_rate: number;
  payment_type: 'cash' | 'credit';
  terms: string;
  due_date: string;
  po_number: string;
  job_title: string;
  advance_label: string;
  advance_amount: number;
  other_label: string;
  other_amount: number;
  prepared_by: string;
}

async function downloadCustomInvoicePDF(data: CIData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210, H = 297, ML = 14, MR = 14, CW = W - ML - MR, RX = W - MR;
  const isCredit = data.payment_type === 'credit';
  const black: RGB = [20, 20, 20];
  const pink: RGB  = [250, 205, 205];

  const fill   = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const ink    = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const n      = (v: number | string) => Number(v).toFixed(2);
  const lkr    = (v: number | string) => `LKR ${n(v)}`;
  const bold   = () => doc.setFont('helvetica', 'bold');
  const italic = () => doc.setFont('helvetica', 'italic');
  const normal = () => doc.setFont('helvetica', 'normal');
  const sz     = (s: number) => doc.setFontSize(s);
  const hline  = (y: number, x1 = ML, x2 = W - MR, lw = 0.3) => {
    stroke(C.border); doc.setLineWidth(lw); doc.line(x1, y, x2, y);
  };
  const dline  = (x1: number, x2: number, y: number) => {
    stroke(C.muted); doc.setLineWidth(0.2); doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(x1, y, x2, y); doc.setLineDashPattern([], 0);
  };
  const displayDate = (s: string) => s
    ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  let logoData: string | null = null;
  try { logoData = await loadLogoDataUrl(); } catch { /* logo optional */ }

  // 1. LETTERHEAD
  bold(); sz(15); ink(black);
  const kg = 'KALANI GRAPHICS '; const and = 'AND'; const ps = ' PRINT SOLUTIONS';
  doc.text(kg, ML, 16);
  const kgW = doc.getTextWidth(kg);
  ink(C.red); doc.text(and, ML + kgW, 16);
  const andW = doc.getTextWidth(and);
  ink(black); doc.text(ps, ML + kgW + andW, 16);

  bold(); sz(8); ink(black); doc.text(SHOP_REG, ML, 22);
  normal(); sz(8); ink(C.muted);
  let leftY = 27;
  SHOP_ADDRESS_LINES.forEach(line => { doc.text(line, ML, leftY); leftY += 4.2; });
  SHOP_PHONES.forEach(p => { doc.text(p, ML, leftY); leftY += 4.2; });

  if (logoData) {
    const logoW = 42, logoH = logoW * LOGO_ASPECT;
    try { doc.addImage(logoData, 'PNG', RX - logoW, 8, logoW, logoH); } catch { /* ignore bad image */ }
  }

  // 2. META (right-aligned, below logo)
  const metaLine = (label: string, value: string, y: number, valSz = 9) => {
    if (!value) return;
    bold(); sz(valSz); ink(C.navy);
    const vW = doc.getTextWidth(value);
    doc.text(value, RX, y, { align: 'right' });
    normal(); sz(8); ink(C.muted);
    doc.text(`${label}  `, RX - vW, y, { align: 'right' });
  };
  let metaY = 44;
  metaLine('Invoice #', data.invoice_number, metaY, 11); metaY += 6.5;
  metaLine('Date :', displayDate(data.invoice_date), metaY); metaY += 5.5;
  if (data.terms)     { metaLine('Terms :', data.terms, metaY); metaY += 5.5; }
  if (data.due_date)  { metaLine('Due Date :', displayDate(data.due_date), metaY); metaY += 5.5; }
  if (data.po_number) { metaLine('PO NO:', data.po_number, metaY); metaY += 5.5; }

  let rowY = Math.max(leftY, metaY) + 4;

  // 3. INVOICE / BILL TO
  bold(); sz(13); ink(C.red); doc.text('INVOICE', ML, rowY); rowY += 6;
  bold(); sz(9); ink(black); doc.text('BILL TO', ML, rowY); rowY += 5;
  normal(); sz(9); ink(black);
  if (data.customer_name)   { bold(); doc.text(data.customer_name, ML, rowY); rowY += 4.5; normal(); }
  if (data.customer_address) { doc.text(data.customer_address, ML, rowY); rowY += 4.5; }
  if (data.customer_phone)   { doc.text(data.customer_phone, ML, rowY); rowY += 4.5; }
  rowY += 2;

  // Payment type badge (kept from prior design — quick cash/credit indicator)
  fill(isCredit ? C.orange : [34, 139, 34]);
  doc.rect(ML, rowY, isCredit ? 30 : 24, 6.5, 'F');
  bold(); sz(7); ink(C.white);
  doc.text(isCredit ? 'CREDIT SALE' : 'CASH PAID', ML + (isCredit ? 15 : 12), rowY + 4.5, { align: 'center' });
  rowY += 11;

  // 4. COMMENTS / SPECIAL INSTRUCTIONS
  if (data.job_title || data.notes.trim()) {
    bold(); sz(8.5); ink(C.navy); doc.text('COMMENTS OR SPECIAL INSTRUCTIONS', ML, rowY); rowY += 5;
    normal(); sz(9); ink(black);
    if (data.job_title) { bold(); doc.text(data.job_title, ML, rowY); rowY += 5; normal(); }
  }
  rowY += 2;

  // 5. ITEMS TABLE
  const COL = { date: ML, desc: ML + 22, qty: ML + 104, price: ML + 144, total: W - MR };

  fill(C.navy); doc.rect(ML, rowY, CW, 8, 'F');
  bold(); sz(8); ink(C.white);
  doc.text('DATE',        COL.date + 1, rowY + 5.5);
  doc.text('DESCRIPTION', COL.desc,     rowY + 5.5);
  doc.text('QTY',         COL.qty,      rowY + 5.5, { align: 'center' });
  doc.text('UNIT RATE',   COL.price,    rowY + 5.5, { align: 'right' });
  doc.text('AMOUNT',      COL.total,    rowY + 5.5, { align: 'right' });
  rowY += 8;

  const descW = COL.qty - COL.desc - 6;
  // Shading must be painted before the row's text, otherwise the fill covers it.
  let zebraToggle = false;
  const startRow = (h: number) => {
    if (zebraToggle) { fill(C.rowEven); doc.rect(ML, rowY, CW, h, 'F'); }
    zebraToggle = !zebraToggle;
  };

  if (data.job_title) {
    startRow(8);
    normal(); sz(8); ink(C.muted); doc.text(displayDate(data.invoice_date), COL.date + 1, rowY + 5.5);
    bold(); sz(9); ink(black); doc.text(data.job_title, COL.desc, rowY + 5.5);
    rowY += 8;
  }
  if (data.notes.trim()) {
    const noteLines = doc.splitTextToSize(data.notes.trim(), descW);
    const h = noteLines.length * 4.2 + 3;
    startRow(h);
    italic(); sz(8); ink(C.muted);
    doc.text(noteLines, COL.desc, rowY + 5);
    rowY += h;
  }

  normal(); sz(9);
  data.items.forEach(item => {
    const lineLines = doc.splitTextToSize(item.description, descW);
    const rowH = Math.max(8, lineLines.length * 4.2 + 3);
    startRow(rowH);
    ink(black); normal();
    doc.text(lineLines, COL.desc, rowY + 5);
    doc.text(String(item.qty), COL.qty, rowY + 5, { align: 'center' });
    doc.text(lkr(item.unit_price), COL.price, rowY + 5, { align: 'right' });
    const lineTotal = item.qty * item.unit_price - item.discount;
    doc.text(lkr(lineTotal), COL.total, rowY + 5, { align: 'right' });
    rowY += rowH;
  });
  hline(rowY, ML, W - MR, 0.5); rowY += 6;

  // 6. TOTALS + CONTACT BOX (side by side)
  const itemSubtotal  = data.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const itemDiscTotal = data.items.reduce((s, i) => s + i.discount, 0);
  const afterItemDisc = itemSubtotal - itemDiscTotal;
  const afterBillDisc = afterItemDisc - data.discount_total;
  const taxAmount     = (afterBillDisc * data.tax_rate) / 100;
  const grandTotal    = afterBillDisc + taxAmount;
  const balanceDue    = grandTotal - (data.advance_amount || 0) - (data.other_amount || 0);
  const TOT_LEFT      = W - MR - 78;
  const totTop        = rowY;

  bold(); sz(8.5); ink(C.muted); doc.text('BALANCE DUE', ML, rowY);

  const addTotRow = (label: string, value: string, color: RGB = black, bold_ = false) => {
    bold_ ? bold() : normal(); sz(9);
    ink(C.muted); doc.text(label, TOT_LEFT, rowY);
    bold_ ? bold() : normal(); ink(color);
    doc.text(value, W - MR, rowY, { align: 'right' });
    rowY += 5.5;
  };
  addTotRow('Subtotal', lkr(itemSubtotal));
  if (itemDiscTotal > 0)       addTotRow('Item Discounts', `-${lkr(itemDiscTotal)}`, C.red);
  if (data.discount_total > 0) addTotRow('Bill Discount', `-${lkr(data.discount_total)}`, C.red);
  addTotRow('Tax Rate', `${n(data.tax_rate)}%`);
  if (data.advance_amount > 0) addTotRow(data.advance_label || 'Advance', `-${lkr(data.advance_amount)}`, C.red);
  if (data.other_amount !== 0) addTotRow(data.other_label || 'Other', lkr(data.other_amount));

  rowY += 0.5;
  fill(isCredit ? C.orange : C.navy);
  doc.rect(TOT_LEFT - 4, rowY - 1, W - MR - TOT_LEFT + 4 + MR, 9, 'F');
  bold(); sz(10); ink(C.white);
  doc.text('BALANCE DUE', TOT_LEFT, rowY + 6);
  doc.text(lkr(balanceDue), W - MR, rowY + 6, { align: 'right' });
  rowY += 9;

  // Contact box (left column, aligned with totals block)
  normal(); sz(8); ink(black);
  const contactLines = doc.splitTextToSize('If you have any questions concerning this Invoice, please contact', TOT_LEFT - ML - 6);
  doc.text(contactLines, ML, totTop + 6);
  if (data.prepared_by || SHOP_PHONE) {
    doc.text(`${data.prepared_by ? data.prepared_by + ' - ' : ''}${SHOP_PHONE}`, ML, totTop + 6 + contactLines.length * 4);
  }

  rowY += 6;

  // 7. BANK TRANSFER NOTICE
  fill(pink);
  const bankLines = [
    'Transfer the amount to the business account below.',
    `NOTE - CHEQUE SHOULD BE DRAWN IN FAVOUR OF - ${SHOP_NAME}`,
    `ACCOUNT NUMBER - ${BANK_ACCOUNT} - ${BANK_NAME}`,
    'THANK YOU FOR YOUR BUSINESS',
  ];
  const bankBoxH = bankLines.length * 4.6 + 6;
  doc.rect(ML, rowY, CW, bankBoxH, 'F');
  bold(); sz(8); ink(C.red);
  let by = rowY + 5.5;
  bankLines.forEach(l => { doc.text(l, ML + 3, by); by += 4.6; });
  rowY += bankBoxH + 10;

  // 8. SIGNATURES
  const sigColW = CW / 2 - 6;
  if (data.prepared_by) { italic(); sz(9); ink(black); doc.text(data.prepared_by, ML, rowY - 2); }
  normal(); sz(8); ink(black); doc.text(displayDate(data.invoice_date), ML + sigColW + 12, rowY - 2);
  dline(ML, ML + sigColW, rowY);
  dline(ML + sigColW + 12, W - MR, rowY);
  bold(); sz(7.5); ink(C.muted);
  doc.text('PREPARED BY', ML, rowY + 4.5);
  doc.text('DATE', ML + sigColW + 12, rowY + 4.5);
  rowY += 14;

  bold(); sz(8.5); ink(black); doc.text('Goods received by', ML, rowY); rowY += 8;
  dline(ML, ML + sigColW, rowY);
  dline(ML + sigColW + 12, W - MR, rowY);
  bold(); sz(7.5); ink(C.muted);
  doc.text('CUSTOMER SIGNATURE', ML, rowY + 4.5);
  doc.text('DATE/TIME', ML + sigColW + 12, rowY + 4.5);
  rowY += 4.5;

  // 9. FOOTER — pinned near the bottom, but pushed down further if content ran long
  const FY = Math.max(H - 16, rowY + 10);
  hline(FY - 6, ML, W - MR, 0.3);
  bold(); sz(8); ink(black);
  if (data.job_title) doc.text(data.job_title, W / 2, FY - 1, { align: 'center' });
  sz(7.5); ink(C.muted);
  doc.text(SHOP_NAME, W / 2, FY + 4, { align: 'center' });
  doc.text(SHOP_REG, W / 2, FY + 8.5, { align: 'center' });

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
const fmt   = (n: number | string) => Number(n).toFixed(2);
const fmtDate = (s: string) => new Date(s).toLocaleString();
const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// ─────────────────────────────────────────────
// Custom Invoice Tab
// ─────────────────────────────────────────────
interface CustomerSuggestion { customer_name: string; customer_phone: string; customer_address: string; }
interface CreditHistory {
  summary: { invoice_count: number; total_amount: string; total_paid: string; total_balance_due: string };
  invoices: Array<{ id: number; invoice_number: string; invoice_date: string; grand_total: string; amount_paid: string; balance_due: string; status: string }>;
}

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
  const [paymentType, setPaymentType]     = useState<'cash' | 'credit'>('cash');
  const [saving, setSaving]               = useState(false);

  // PDF-only fields (not persisted to the backend invoice record)
  const [jobTitle, setJobTitle]           = useState('');
  const [terms, setTerms]                 = useState('7 DAYS');
  const [dueDate, setDueDate]             = useState(() => addDays(today(), 7));
  const [poNumber, setPoNumber]           = useState('');
  const [advanceLabel, setAdvanceLabel]   = useState('Advance');
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [otherLabel, setOtherLabel]       = useState('Other');
  const [otherAmount, setOtherAmount]     = useState(0);
  const [preparedBy, setPreparedBy]       = useState('');

  // Autocomplete state
  const [suggestions, setSuggestions]       = useState<CustomerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestDebounce = useRef<ReturnType<typeof setTimeout>>();
  const nameWrapRef = useRef<HTMLDivElement>(null);

  // Credit history state
  const [creditHistory, setCreditHistory]   = useState<CreditHistory | null>(null);
  const [loadingCredit, setLoadingCredit]   = useState(false);
  const creditDebounce = useRef<ReturnType<typeof setTimeout>>();

  const [lines, setLines] = useState<CILine[]>([
    { id: 1, description: '', qty: 1, unit_price: 0, discount: 0 },
  ]);

  // ── Autocomplete: fetch suggestions as user types ──────────────────────
  const fetchSuggestions = (q: string) => {
    clearTimeout(suggestDebounce.current);
    if (!q.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestDebounce.current = setTimeout(async () => {
      try {
        const res = await api.get('/printshop-invoices/customers/suggest', { params: { q } });
        setSuggestions(res.data.data || []);
        setShowSuggestions((res.data.data || []).length > 0);
      } catch { /* ignore */ }
    }, 220);
  };

  // ── Credit history: fetch when customer name is confirmed ──────────────
  const fetchCreditHistory = (name: string) => {
    clearTimeout(creditDebounce.current);
    setCreditHistory(null);
    if (!name.trim()) return;
    creditDebounce.current = setTimeout(async () => {
      setLoadingCredit(true);
      try {
        const res = await api.get(`/printshop-invoices/credits/full/${encodeURIComponent(name.trim())}`);
        const d = res.data.data;
        if (d && parseInt(d.summary?.invoice_count) > 0) setCreditHistory(d);
        else setCreditHistory(null);
      } catch { /* ignore */ }
      finally { setLoadingCredit(false); }
    }, 400);
  };

  // Close suggestions on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!nameWrapRef.current?.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const pickSuggestion = (s: CustomerSuggestion) => {
    setCustomerName(s.customer_name);
    setCustomerPhone(s.customer_phone || '');
    setCustomerAddr(s.customer_address || '');
    setShowSuggestions(false);
    fetchCreditHistory(s.customer_name);
  };

  const addLine = () =>
    setLines(prev => [...prev, { id: Date.now(), description: '', qty: 1, unit_price: 0, discount: 0 }]);
  const removeLine = (id: number) => setLines(prev => prev.filter(l => l.id !== id));
  const updateLine = (id: number, field: keyof CILine, value: string | number) =>
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));

  const itemSubtotal  = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const itemDiscTotal = lines.reduce((s, l) => s + l.discount, 0);
  const afterDiscs    = itemSubtotal - itemDiscTotal - billDiscount;
  const taxAmount     = (afterDiscs * taxRate) / 100;
  const grandTotal    = afterDiscs + taxAmount;

  const handleDownload = async () => {
    if (!customerName.trim())               { toast.error('Customer name is required'); return; }
    if (lines.every(l => !l.description.trim())) { toast.error('Add at least one item'); return; }

    const ciData: CIData = {
      invoice_number  : invoiceNumber,
      invoice_date    : invoiceDate,
      customer_name   : customerName.trim(),
      customer_address: customerAddr.trim(),
      customer_phone  : customerPhone.trim(),
      items           : lines.filter(l => l.description.trim()),
      notes           : notes.trim(),
      discount_total  : billDiscount,
      tax_rate        : taxRate,
      payment_type    : paymentType,
      terms           : terms.trim(),
      due_date        : dueDate,
      po_number       : poNumber.trim(),
      job_title       : jobTitle.trim(),
      advance_label   : advanceLabel.trim(),
      advance_amount  : advanceAmount,
      other_label     : otherLabel.trim(),
      other_amount    : otherAmount,
      prepared_by     : preparedBy.trim(),
    };

    setSaving(true);
    try {
      await api.post('/printshop-invoices', {
        invoice_number  : ciData.invoice_number,
        invoice_date    : ciData.invoice_date,
        customer_name   : ciData.customer_name,
        customer_address: ciData.customer_address,
        customer_phone  : ciData.customer_phone,
        payment_type    : ciData.payment_type,
        items           : ciData.items.map(i => ({
          description: i.description, qty: i.qty, unit_price: i.unit_price, discount: i.discount,
        })),
        bill_discount   : ciData.discount_total,
        tax_rate        : ciData.tax_rate,
        notes           : ciData.notes,
      });
      await downloadCustomInvoicePDF(ciData);
      toast.success(paymentType === 'credit' ? 'Credit invoice saved & PDF downloaded' : 'Invoice saved & PDF downloaded');
      setInvoiceNumber(genInvoiceNumber());
      setCustomerName(''); setCustomerAddr(''); setCustomerPhone('');
      setNotes(''); setBillDiscount(0); setTaxRate(0);
      setPaymentType('cash'); setCreditHistory(null);
      setLines([{ id: Date.now(), description: '', qty: 1, unit_price: 0, discount: 0 }]);
      setJobTitle(''); setTerms('7 DAYS'); setDueDate(addDays(today(), 7));
      setPoNumber(''); setAdvanceLabel('Advance'); setAdvanceAmount(0);
      setOtherLabel('Other'); setOtherAmount(0); setPreparedBy('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Payment type toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setPaymentType('cash')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
            paymentType === 'cash'
              ? 'bg-green-600 border-green-600 text-white'
              : 'border-surface-300 text-surface-600 hover:border-green-400'
          }`}>
          Cash Sale
        </button>
        <button
          onClick={() => setPaymentType('credit')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors ${
            paymentType === 'credit'
              ? 'bg-orange-500 border-orange-500 text-white'
              : 'border-surface-300 text-surface-600 hover:border-orange-400'
          }`}>
          Credit Sale
        </button>
      </div>

      {paymentType === 'credit' && !creditHistory && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-orange-200 bg-orange-50 text-orange-800 text-sm">
          <svg className="w-5 h-5 mt-0.5 shrink-0 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Credit sale — the full balance will be recorded as outstanding. Track and settle it in the <strong>Credit Ledger</strong> tab.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Invoice details */}
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Invoice Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Invoice Number</label>
              <input className="input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <label className="label">Invoice Date</label>
              <input type="date" className="input" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bill Discount (LKR)</label>
              <input type="number" min={0} step={0.01} className="input"
                value={billDiscount || ''} onChange={e => setBillDiscount(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label">Tax Rate (%)</label>
              <input type="number" min={0} step={0.1} className="input"
                value={taxRate || ''} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <label className="label">Notes / Terms</label>
            <textarea rows={3} className="input resize-none" value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Payment due within 14 days…" />
          </div>
        </div>

        {/* Bill To */}
        <div className="card p-5 space-y-4">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Bill To</p>

          {/* Customer name with autocomplete */}
          <div>
            <label className="label">Customer Name *</label>
            <div className="relative" ref={nameWrapRef}>
              <input
                className="input"
                value={customerName}
                onChange={e => {
                  setCustomerName(e.target.value);
                  fetchSuggestions(e.target.value);
                  fetchCreditHistory(e.target.value);
                }}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="e.g. ABC Company"
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-surface-200 shadow-xl z-50 overflow-hidden">
                  {suggestions.map(s => (
                    <button
                      key={s.customer_name}
                      onMouseDown={() => pickSuggestion(s)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-primary-50 transition-colors border-b border-surface-100 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-surface-900">{s.customer_name}</p>
                        {(s.customer_phone || s.customer_address) && (
                          <p className="text-xs text-surface-400">
                            {[s.customer_phone, s.customer_address].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-surface-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="label">Address</label>
            <input className="input" value={customerAddr}
              onChange={e => setCustomerAddr(e.target.value)} placeholder="Street, City" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)} placeholder="07X XXX XXXX" />
          </div>
        </div>
      </div>

      {/* Job & payment terms (printed on the invoice PDF) */}
      <div className="card p-5 space-y-4">
        <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Job &amp; Payment Terms</p>
        <div>
          <label className="label">Job Title</label>
          <input className="input" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
            placeholder="e.g. Ground Floor Stickering" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Terms</label>
            <input className="input" value={terms} onChange={e => setTerms(e.target.value)} placeholder="7 DAYS" />
          </div>
          <div>
            <label className="label">Due Date</label>
            <input type="date" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className="label">PO No.</label>
            <input className="input" value={poNumber} onChange={e => setPoNumber(e.target.value)} />
          </div>
          <div>
            <label className="label">Prepared By</label>
            <input className="input" value={preparedBy} onChange={e => setPreparedBy(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Advance Label</label>
            <input className="input" value={advanceLabel} onChange={e => setAdvanceLabel(e.target.value)} placeholder="50% Advance" />
          </div>
          <div>
            <label className="label">Advance Amount (LKR)</label>
            <input type="number" min={0} step={0.01} className="input"
              value={advanceAmount || ''} onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="label">Other Label</label>
            <input className="input" value={otherLabel} onChange={e => setOtherLabel(e.target.value)} />
          </div>
          <div>
            <label className="label">Other Amount (LKR)</label>
            <input type="number" step={0.01} className="input"
              value={otherAmount || ''} onChange={e => setOtherAmount(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
      </div>

      {/* ── Credit history panel ─────────────────────────────────────────── */}
      {loadingCredit && (
        <div className="text-sm text-surface-400 px-1">Checking credit history…</div>
      )}
      {creditHistory && (
        <div className="card overflow-hidden border-orange-200">
          {/* Summary bar */}
          <div className="px-5 py-4 bg-orange-50 border-b border-orange-200 flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Credit History — {customerName}</p>
              <p className="text-xs text-surface-500 mt-0.5">{creditHistory.summary.invoice_count} credit invoice{creditHistory.summary.invoice_count !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-6 ml-auto text-sm">
              <div className="text-right">
                <p className="text-xs text-surface-500">Total Invoiced</p>
                <p className="font-semibold text-surface-800">LKR {fmt(parseFloat(creditHistory.summary.total_amount))}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-surface-500">Paid</p>
                <p className="font-semibold text-green-700">LKR {fmt(parseFloat(creditHistory.summary.total_paid))}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-orange-600 font-semibold">Outstanding</p>
                <p className="text-lg font-bold text-orange-600">LKR {fmt(parseFloat(creditHistory.summary.total_balance_due))}</p>
              </div>
            </div>
          </div>

          {/* Invoice rows */}
          <div className="table-wrapper">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {creditHistory.invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="font-mono text-xs text-primary-600">{inv.invoice_number}</td>
                    <td className="text-xs text-surface-500">
                      {new Date(inv.invoice_date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="text-right font-medium">LKR {fmt(parseFloat(inv.grand_total))}</td>
                    <td className="text-right text-green-700">LKR {fmt(parseFloat(inv.amount_paid))}</td>
                    <td className="text-right">
                      <span className={`font-semibold ${parseFloat(inv.balance_due) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        LKR {fmt(parseFloat(inv.balance_due))}
                      </span>
                    </td>
                    <td>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        inv.status === 'paid'    ? 'bg-green-100 text-green-700' :
                        inv.status === 'partial' ? 'bg-blue-100 text-blue-700' :
                                                   'bg-orange-100 text-orange-700'
                      }`}>{inv.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {parseFloat(creditHistory.summary.total_balance_due) > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-orange-300 bg-orange-50">
                    <td colSpan={4} className="px-4 py-2.5 text-right font-bold text-orange-700 text-sm">
                      Total Outstanding (before this invoice)
                    </td>
                    <td className="px-4 py-2.5 text-right font-black text-orange-700 text-base">
                      LKR {fmt(parseFloat(creditHistory.summary.total_balance_due))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
      {/* ───────────────────────────────────────────────────────────────── */}

      {/* Line items */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Line Items</p>
          <button onClick={addLine} className="btn-ghost btn-sm">+ Add Line</button>
        </div>
        <div className="table-wrapper">
          <table className="table min-w-[600px]">
            <thead>
              <tr>
                <th className="w-5/12">Description</th>
                <th className="text-center w-1/12">Qty</th>
                <th className="text-right w-2/12">Unit Price</th>
                <th className="text-right w-2/12">Discount</th>
                <th className="text-right w-2/12">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const lineTotal = line.qty * line.unit_price - line.discount;
                return (
                  <tr key={line.id}>
                    <td>
                      <input value={line.description}
                        onChange={e => updateLine(line.id, 'description', e.target.value)}
                        placeholder={`Item ${idx + 1}`}
                        className="w-full bg-transparent text-surface-900 text-sm focus:outline-none border-b border-transparent focus:border-primary-400 pb-0.5 transition-colors placeholder-surface-300" />
                    </td>
                    <td className="text-center">
                      <input type="number" min={0.001} step={0.001} value={line.qty || ''}
                        onChange={e => updateLine(line.id, 'qty', parseFloat(e.target.value) || 0)}
                        className="w-16 text-center input py-1 text-sm" />
                    </td>
                    <td className="text-right">
                      <input type="number" min={0} step={0.01} value={line.unit_price || ''}
                        onChange={e => updateLine(line.id, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-24 text-right input py-1 text-sm" />
                    </td>
                    <td className="text-right">
                      <input type="number" min={0} step={0.01} value={line.discount || ''}
                        onChange={e => updateLine(line.id, 'discount', parseFloat(e.target.value) || 0)}
                        className="w-24 text-right input py-1 text-sm text-red-600" />
                    </td>
                    <td className="text-right font-medium">{lineTotal.toFixed(2)}</td>
                    <td className="pr-2">
                      {lines.length > 1 && (
                        <button onClick={() => removeLine(line.id)}
                          className="text-surface-300 hover:text-red-500 transition-colors">
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
        <div className="border-t border-surface-200 bg-surface-50 px-5 py-4">
          <div className="flex justify-end">
            <div className="w-60 space-y-1.5 text-sm">
              <div className="flex justify-between text-surface-600">
                <span>Subtotal</span><span>LKR {itemSubtotal.toFixed(2)}</span>
              </div>
              {itemDiscTotal > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Item Discounts</span><span>-LKR {itemDiscTotal.toFixed(2)}</span>
                </div>
              )}
              {billDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Bill Discount</span><span>-LKR {billDiscount.toFixed(2)}</span>
                </div>
              )}
              {taxRate > 0 && (
                <div className="flex justify-between text-surface-600">
                  <span>Tax ({taxRate}%)</span><span>LKR {taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className={`flex justify-between font-bold text-base pt-2 border-t border-surface-200 ${
                paymentType === 'credit' ? 'text-orange-600' : 'text-surface-900'
              }`}>
                <span>{paymentType === 'credit' ? 'BALANCE DUE' : 'TOTAL'}</span>
                <span>LKR {grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button onClick={handleDownload} disabled={saving}
        className={`w-full py-3 text-base flex items-center justify-center gap-2 font-semibold rounded-lg transition-colors ${
          paymentType === 'credit'
            ? 'bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60'
            : 'btn-primary'
        }`}>
        {saving ? (
          <span>Saving…</span>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            {paymentType === 'credit' ? 'Save Credit Invoice & Download PDF' : 'Save Invoice & Download PDF'}
          </>
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Credit Ledger Tab
// ─────────────────────────────────────────────
interface CustomerSummary {
  customer_name: string;
  customer_phone: string;
  invoice_count: number;
  total_amount: string;
  total_paid: string;
  total_balance_due: string;
  last_invoice_date: string;
}

interface PSInvoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  grand_total: string;
  amount_paid: string;
  balance_due: string;
  status: 'paid' | 'pending' | 'partial';
  notes?: string;
  created_at: string;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid:    'bg-green-100 text-green-700',
    pending: 'bg-orange-100 text-orange-700',
    partial: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] || 'bg-surface-100 text-surface-600'}`}>
      {status}
    </span>
  );
}

function CreditLedgerTab() {
  const toast = useToastStore();

  const [search, setSearch]               = useState('');
  const [summary, setSummary]             = useState<CustomerSummary[]>([]);
  const [loading, setLoading]             = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<PSInvoice[]>([]);
  const [showInvoices, setShowInvoices]         = useState(false);
  const [loadingInv, setLoadingInv]             = useState(false);

  const [payInvoice, setPayInvoice]   = useState<PSInvoice | null>(null);
  const [showPay, setShowPay]         = useState(false);
  const [payAmount, setPayAmount]     = useState('');
  const [paying, setPaying]           = useState(false);

  const loadSummary = async (q?: string) => {
    setLoading(true);
    try {
      const res = await api.get('/printshop-invoices/credits/summary', {
        params: q ? { customer_name: q } : undefined,
      });
      setSummary(res.data.data || []);
    } catch { toast.error('Failed to load credit summary'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadSummary(); }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadSummary(search.trim() || undefined);
  };

  const openCustomer = async (c: CustomerSummary) => {
    setSelectedCustomer(c);
    setShowInvoices(true);
    setLoadingInv(true);
    try {
      const res = await api.get(`/printshop-invoices/credits/customer/${encodeURIComponent(c.customer_name)}`);
      setCustomerInvoices(res.data.data || []);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoadingInv(false); }
  };

  const openPayment = (inv: PSInvoice) => {
    setPayInvoice(inv);
    setPayAmount('');
    setShowPay(true);
  };

  const handlePay = async () => {
    if (!payInvoice) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    const max = parseFloat(payInvoice.balance_due);
    if (amount > max) { toast.error(`Maximum payable is LKR ${fmt(max)}`); return; }
    setPaying(true);
    try {
      await api.patch(`/printshop-invoices/${payInvoice.id}/payment`, { amount });
      toast.success('Payment recorded');
      setShowPay(false);
      // Refresh
      if (selectedCustomer) {
        const res = await api.get(`/printshop-invoices/credits/customer/${encodeURIComponent(selectedCustomer.customer_name)}`);
        setCustomerInvoices(res.data.data || []);
      }
      loadSummary(search.trim() || undefined);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  const totalOutstanding = summary.reduce((s, c) => s + parseFloat(c.total_balance_due), 0);

  return (
    <div className="space-y-5">
      {/* Overall outstanding banner */}
      {summary.length > 0 && (
        <div className="flex items-center gap-4 px-5 py-4 rounded-xl bg-orange-50 border border-orange-200">
          <div className="flex-1">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Total Outstanding Credit</p>
            <p className="text-2xl font-bold text-orange-700 mt-0.5">LKR {totalOutstanding.toFixed(2)}</p>
          </div>
          <div className="text-right text-sm text-orange-600">
            <p>{summary.length} customer{summary.length !== 1 ? 's' : ''}</p>
            <p>{summary.reduce((s, c) => s + c.invoice_count, 0)} invoice{summary.reduce((s, c) => s + c.invoice_count, 0) !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer name…"
          className="input flex-1" />
        <button type="submit" className="btn-primary px-5">Search</button>
        {search && (
          <button type="button" onClick={() => { setSearch(''); loadSummary(); }} className="btn-secondary px-4">
            Clear
          </button>
        )}
      </form>

      {/* Customer summary table */}
      <div className="card overflow-hidden">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th className="text-center"># Invoices</th>
                <th className="text-right">Total Invoiced</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Outstanding</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-surface-400">Loading…</td></tr>
              ) : !summary.length ? (
                <tr><td colSpan={7} className="text-center py-8 text-surface-400">No credit records found</td></tr>
              ) : summary.map(c => (
                <tr key={c.customer_name}>
                  <td className="font-medium">{c.customer_name}</td>
                  <td className="text-surface-500 text-sm">{c.customer_phone || '—'}</td>
                  <td className="text-center text-surface-600">{c.invoice_count}</td>
                  <td className="text-right font-medium">LKR {fmt(parseFloat(c.total_amount))}</td>
                  <td className="text-right text-green-700">LKR {fmt(parseFloat(c.total_paid))}</td>
                  <td className="text-right">
                    <span className={`font-bold ${parseFloat(c.total_balance_due) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      LKR {fmt(parseFloat(c.total_balance_due))}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => openCustomer(c)} className="btn-ghost btn-sm">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer invoices modal */}
      <Modal
        isOpen={showInvoices}
        onClose={() => setShowInvoices(false)}
        title={selectedCustomer ? `Credit Invoices — ${selectedCustomer.customer_name}` : ''}
        size="lg"
        footer={<button onClick={() => setShowInvoices(false)} className="btn-secondary">Close</button>}>
        {selectedCustomer && (
          <div className="space-y-4">
            {/* Customer credit summary */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                ['Total Invoiced', `LKR ${fmt(parseFloat(selectedCustomer.total_amount))}`, 'text-surface-900'],
                ['Total Paid',     `LKR ${fmt(parseFloat(selectedCustomer.total_paid))}`,   'text-green-700'],
                ['Outstanding',    `LKR ${fmt(parseFloat(selectedCustomer.total_balance_due))}`, 'text-orange-600 font-bold'],
              ].map(([k, v, cls]) => (
                <div key={k} className="card p-3">
                  <p className="text-xs text-surface-500">{k}</p>
                  <p className={`text-base font-semibold mt-0.5 ${cls}`}>{v}</p>
                </div>
              ))}
            </div>

            {/* Invoices list */}
            <div className="card overflow-hidden">
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Paid</th>
                      <th className="text-right">Balance</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingInv ? (
                      <tr><td colSpan={7} className="text-center py-6 text-surface-400">Loading…</td></tr>
                    ) : !customerInvoices.length ? (
                      <tr><td colSpan={7} className="text-center py-6 text-surface-400">No invoices</td></tr>
                    ) : customerInvoices.map(inv => (
                      <tr key={inv.id}>
                        <td className="font-mono text-xs text-primary-600">{inv.invoice_number}</td>
                        <td className="text-xs text-surface-500">
                          {new Date(inv.invoice_date).toLocaleDateString('en-GB')}
                        </td>
                        <td className="text-right font-medium">LKR {fmt(parseFloat(inv.grand_total))}</td>
                        <td className="text-right text-green-700">LKR {fmt(parseFloat(inv.amount_paid))}</td>
                        <td className="text-right">
                          <span className={`font-semibold ${parseFloat(inv.balance_due) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            LKR {fmt(parseFloat(inv.balance_due))}
                          </span>
                        </td>
                        <td><StatusBadge status={inv.status} /></td>
                        <td>
                          {inv.status !== 'paid' && (
                            <button onClick={() => openPayment(inv)} className="btn-ghost btn-sm text-orange-600 hover:text-orange-700">
                              Pay
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Record payment modal */}
      <Modal
        isOpen={showPay}
        onClose={() => setShowPay(false)}
        title="Record Payment"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowPay(false)} className="btn-secondary">Cancel</button>
            <button onClick={handlePay} disabled={paying} className="btn-primary">
              {paying ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        }>
        {payInvoice && (
          <div className="space-y-4">
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-surface-500">Invoice</span>
                <span className="font-mono text-primary-600">{payInvoice.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-surface-500">Balance Due</span>
                <span className="font-bold text-orange-600">LKR {fmt(parseFloat(payInvoice.balance_due))}</span>
              </div>
            </div>
            <div>
              <label className="label">Payment Amount (LKR)</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                max={parseFloat(payInvoice.balance_due)}
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                className="input"
                placeholder={`Max: ${fmt(parseFloat(payInvoice.balance_due))}`}
                autoFocus />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// Internal Use Tab
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

  const [searchQuery, setSearchQuery]       = useState('');
  const [allProducts, setAllProducts]       = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [cartItems, setCartItems]           = useState<CartItem[]>([]);
  const [purpose, setPurpose]               = useState('');
  const [notes, setNotes]                   = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [history, setHistory]               = useState<InternalUseRecord[]>([]);
  const [historyTotal, setHistoryTotal]     = useState(0);
  const [historyPage, setHistoryPage]       = useState(1);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewRecord, setViewRecord]         = useState<any>(null);
  const [showView, setShowView]             = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadHistory(1);
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await api.get('/products', { params: { limit: 500 } });
      setAllProducts(res.data.data || []);
    } catch { /* silently ignore */ }
    finally { setLoadingProducts(false); }
  };

  const filteredProducts = searchQuery.trim()
    ? allProducts.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.barcode && p.barcode.includes(searchQuery))
      )
    : allProducts;

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

  return (
    <div className="space-y-6">
      {/* Notice */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
        <svg className="w-5 h-5 mt-0.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{t.printshop_stock_note}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: product browser + cart */}
        <div className="space-y-4">
          <div ref={searchRef}>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.printshop_search_placeholder} className="input" />
          </div>

          {/* Product list */}
          <div className="card overflow-hidden">
            <div className="px-4 py-2 border-b border-surface-200 bg-surface-50 text-xs font-semibold text-surface-500 uppercase tracking-wider">
              {loadingProducts
                ? 'Loading products…'
                : `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''}`}
            </div>
            <div className="overflow-y-auto max-h-48">
              {loadingProducts ? (
                <div className="py-6 text-center text-surface-400 text-sm">{t.loading}</div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-6 text-center text-surface-400 text-sm">No products found</div>
              ) : filteredProducts.map(p => (
                <button key={p.id} onClick={() => addToCart(p)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-primary-50/60 transition-colors border-b border-surface-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-surface-900 truncate">{p.name}</div>
                    <div className="text-xs text-surface-400 font-mono">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-surface-600">LKR {fmt(parseFloat(p.avg_cost as any) || 0)}</div>
                    <div className={`text-xs ${Number(p.current_stock) <= 0 ? 'text-red-500' : 'text-surface-400'}`}>
                      Stock: {Number(p.current_stock).toFixed(2)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Cart */}
          <div className="card overflow-hidden">
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t.printshop_col_product}</th>
                    <th className="text-center w-24">{t.printshop_col_qty}</th>
                    <th className="text-right w-24">{t.printshop_col_subtotal}</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {!cartItems.length ? (
                    <tr><td colSpan={4} className="text-center py-8 text-surface-400">{t.printshop_empty_items}</td></tr>
                  ) : cartItems.map(item => (
                    <tr key={item.product_id}>
                      <td>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="text-xs text-surface-400">@ LKR {fmt(item.cost_price)} each</div>
                      </td>
                      <td className="text-center">
                        <input type="number" min={0.001} step={0.001} value={item.quantity}
                          onChange={e => updateQty(item.product_id, parseFloat(e.target.value) || 0)}
                          className="w-20 text-center input py-1 text-sm" />
                      </td>
                      <td className="text-right font-medium">LKR {fmt(item.subtotal)}</td>
                      <td className="pr-2">
                        <button onClick={() => removeItem(item.product_id)}
                          className="text-surface-300 hover:text-red-500 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cartItems.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200 bg-surface-50">
                <span className="text-sm text-surface-600">{t.printshop_total_cost}</span>
                <span className="text-base font-bold text-surface-900">LKR {fmt(totalCost)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: purpose / notes / submit */}
        <div className="space-y-4">
          <div>
            <label className="label">{t.printshop_purpose}</label>
            <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)}
              placeholder={t.printshop_purpose_placeholder} className="input" />
          </div>
          <div>
            <label className="label">{t.printshop_notes}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="input resize-none" />
          </div>
          <button onClick={handleSubmit} disabled={submitting || !cartItems.length} className="btn-primary w-full py-3">
            {submitting ? t.printshop_submitting : t.printshop_submit}
          </button>
        </div>
      </div>

      {/* History */}
      <div>
        <h2 className="text-base font-semibold text-surface-900 mb-3">{t.printshop_history_title}</h2>
        <div className="card overflow-hidden">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.printshop_col_ref}</th>
                  <th>{t.printshop_col_purpose}</th>
                  <th className="text-right">{t.printshop_col_total}</th>
                  <th>{t.printshop_col_by}</th>
                  <th>{t.printshop_col_date}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr><td colSpan={6} className="text-center py-8 text-surface-400">{t.loading}</td></tr>
                ) : !history.length ? (
                  <tr><td colSpan={6} className="text-center py-8 text-surface-400">{t.printshop_no_data}</td></tr>
                ) : history.map(rec => (
                  <tr key={rec.id}>
                    <td className="text-primary-600 font-mono text-xs">{rec.reference_number}</td>
                    <td>{rec.purpose || '—'}</td>
                    <td className="text-right font-medium">LKR {fmt(parseFloat(rec.total_cost as any) || 0)}</td>
                    <td className="text-surface-500">{rec.created_by_name}</td>
                    <td className="text-xs text-surface-400">{fmtDate(rec.created_at)}</td>
                    <td>
                      <button onClick={() => handleView(rec.id)} className="btn-ghost btn-sm">
                        {t.printshop_view}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {historyTotal > 10 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200">
              <span className="text-xs text-surface-500">{historyTotal} total</span>
              <div className="flex gap-2">
                <button disabled={historyPage <= 1} onClick={() => loadHistory(historyPage - 1)}
                  className="btn-secondary btn-sm">Prev</button>
                <button disabled={historyPage * 10 >= historyTotal} onClick={() => loadHistory(historyPage + 1)}
                  className="btn-secondary btn-sm">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View modal */}
      <Modal isOpen={showView} onClose={() => setShowView(false)}
        title={viewRecord?.reference_number}
        size="lg"
        footer={<button onClick={() => setShowView(false)} className="btn-secondary">Close</button>}>
        {viewRecord && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                [t.printshop_col_purpose, viewRecord.purpose || '—'],
                [t.printshop_col_by, viewRecord.created_by_name],
                [t.printshop_col_date, fmtDate(viewRecord.created_at)],
                ...(viewRecord.notes ? [[t.notes, viewRecord.notes]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <span className="text-surface-500">{k}: </span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t.printshop_col_product}</th>
                      <th className="text-center">{t.printshop_col_qty}</th>
                      <th className="text-right">{t.printshop_col_subtotal}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewRecord.items?.map((item: any) => (
                      <tr key={item.id}>
                        <td>{item.product_name}</td>
                        <td className="text-center">{item.quantity}</td>
                        <td className="text-right font-medium">LKR {fmt(parseFloat(item.subtotal) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-surface-200 bg-surface-50">
                      <td colSpan={2} className="px-4 py-2.5 text-right font-semibold text-surface-700">
                        {t.printshop_total_cost}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-primary-700">
                        LKR {fmt(parseFloat(viewRecord.total_cost) || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main PrintShop page
// ─────────────────────────────────────────────
type Tab = 'internal-use' | 'custom-invoice' | 'credit-ledger';

export default function PrintShop() {
  const [activeTab, setActiveTab] = useState<Tab>('internal-use');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'internal-use',   label: 'Internal Use' },
    { id: 'custom-invoice', label: 'Custom Invoice' },
    { id: 'credit-ledger',  label: 'Credit Ledger' },
  ];

  return (
    <PageContainer>
      <div className="page-header">
        <h1 className="page-title">Print Shop</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-surface-200 mb-6">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'internal-use'   && <InternalUseTab />}
      {activeTab === 'custom-invoice' && <CustomInvoiceTab />}
      {activeTab === 'credit-ledger'  && <CreditLedgerTab />}
    </PageContainer>
  );
}
