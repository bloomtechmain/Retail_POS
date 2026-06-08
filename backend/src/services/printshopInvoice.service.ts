import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface PSInvoiceItemPayload {
  description: string;
  qty: number;
  unit_price: number;
  discount: number;
}

export interface CreatePSInvoicePayload {
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_address?: string;
  customer_phone?: string;
  payment_type: 'cash' | 'credit';
  items: PSInvoiceItemPayload[];
  bill_discount: number;
  tax_rate: number;
  notes?: string;
}

export const createInvoice = async (data: CreatePSInvoicePayload, userId: number) => {
  return transaction(async (client: PoolClient) => {
    const subtotal        = r2(data.items.reduce((s, i) => s + i.qty * i.unit_price, 0));
    const itemDiscTotal   = r2(data.items.reduce((s, i) => s + i.discount, 0));
    const billDiscount    = r2(data.bill_discount || 0);
    const afterDiscs      = r2(subtotal - itemDiscTotal - billDiscount);
    const taxAmount       = r2((afterDiscs * (data.tax_rate || 0)) / 100);
    const grandTotal      = r2(afterDiscs + taxAmount);
    const amountPaid      = data.payment_type === 'cash' ? grandTotal : 0;
    const balanceDue      = r2(grandTotal - amountPaid);
    const status          = data.payment_type === 'cash' ? 'paid' : 'pending';

    const result = await client.query(
      `INSERT INTO printshop_invoices (
         invoice_number, invoice_date, customer_name, customer_address, customer_phone,
         payment_type, subtotal, item_discount_total, bill_discount, tax_rate, tax_amount,
         grand_total, amount_paid, balance_due, status, notes, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        data.invoice_number, data.invoice_date, data.customer_name.trim(),
        data.customer_address?.trim() || null, data.customer_phone?.trim() || null,
        data.payment_type, subtotal, itemDiscTotal, billDiscount, data.tax_rate || 0,
        taxAmount, grandTotal, amountPaid, balanceDue, status,
        data.notes?.trim() || null, userId,
      ]
    );
    const invoice = result.rows[0];

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const lineTotal = r2(item.qty * item.unit_price - item.discount);
      await client.query(
        `INSERT INTO printshop_invoice_items (invoice_id, description, qty, unit_price, discount, line_total, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [invoice.id, item.description, item.qty, item.unit_price, item.discount, lineTotal, i]
      );
    }

    return invoice;
  });
};

export const getInvoices = async (params: {
  page?: number;
  limit?: number;
  payment_type?: string;
  customer_name?: string;
  status?: string;
}) => {
  const page   = params.page  || 1;
  const limit  = params.limit || 20;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const values: unknown[]    = [];
  let i = 1;

  if (params.payment_type)  { conditions.push(`pi.payment_type = $${i++}`);          values.push(params.payment_type); }
  if (params.customer_name) { conditions.push(`pi.customer_name ILIKE $${i++}`);     values.push(`%${params.customer_name}%`); }
  if (params.status)        { conditions.push(`pi.status = $${i++}`);                values.push(params.status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM printshop_invoices pi ${where}`, values);
  const dataResult  = await query(
    `SELECT pi.*, u.name as created_by_name
     FROM printshop_invoices pi
     LEFT JOIN users u ON pi.created_by = u.id
     ${where}
     ORDER BY pi.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...values, limit, offset]
  );

  const total = parseInt(countResult.rows[0].count);
  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getInvoiceById = async (id: number) => {
  const result = await query(
    `SELECT pi.*, u.name as created_by_name
     FROM printshop_invoices pi
     LEFT JOIN users u ON pi.created_by = u.id
     WHERE pi.id = $1`,
    [id]
  );
  if (result.rows.length === 0) throw createError('Invoice not found', 404);

  const items = await query(
    `SELECT * FROM printshop_invoice_items WHERE invoice_id = $1 ORDER BY sort_order`,
    [id]
  );
  return { ...result.rows[0], items: items.rows };
};

export const getCustomerCreditSummary = async (customerName?: string) => {
  const conditions = [`payment_type = 'credit'`];
  const values: unknown[] = [];
  if (customerName) {
    conditions.push(`customer_name ILIKE $1`);
    values.push(`%${customerName}%`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const result = await query(
    `SELECT
       customer_name,
       customer_phone,
       COUNT(*)::int           AS invoice_count,
       SUM(grand_total)        AS total_amount,
       SUM(amount_paid)        AS total_paid,
       SUM(balance_due)        AS total_balance_due,
       MAX(created_at)         AS last_invoice_date
     FROM printshop_invoices
     ${where}
     GROUP BY customer_name, customer_phone
     ORDER BY SUM(balance_due) DESC`,
    values
  );
  return result.rows;
};

export const getCustomerInvoices = async (customerName: string) => {
  const result = await query(
    `SELECT pi.*, u.name as created_by_name
     FROM printshop_invoices pi
     LEFT JOIN users u ON pi.created_by = u.id
     WHERE pi.payment_type = 'credit' AND pi.customer_name ILIKE $1
     ORDER BY pi.created_at DESC`,
    [customerName]
  );
  return result.rows;
};

export const recordPayment = async (id: number, amount: number) => {
  const invoiceResult = await query(
    `SELECT * FROM printshop_invoices WHERE id = $1`,
    [id]
  );
  if (invoiceResult.rows.length === 0) throw createError('Invoice not found', 404);

  const invoice   = invoiceResult.rows[0];
  if (invoice.payment_type !== 'credit') throw createError('Can only record payments for credit invoices', 400);
  if (amount <= 0) throw createError('Payment amount must be greater than 0', 400);

  const grandTotal = parseFloat(invoice.grand_total);
  const newPaid    = r2(Math.min(parseFloat(invoice.amount_paid) + amount, grandTotal));
  const newBalance = r2(grandTotal - newPaid);
  const newStatus  = newBalance <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'pending';

  const result = await query(
    `UPDATE printshop_invoices SET amount_paid=$1, balance_due=$2, status=$3, updated_at=NOW()
     WHERE id=$4 RETURNING *`,
    [newPaid, newBalance, newStatus, id]
  );
  return result.rows[0];
};
