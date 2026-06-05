import { query } from '../config/database';
import { createError } from '../middleware/error';

const genRef = (): string => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const r = Math.floor(Math.random() * 9000) + 1000;
  return `EXP-${d}-${r}`;
};

export const EXPENSE_CATEGORIES = [
  'Rent',
  'Utilities',
  'Salaries',
  'Supplies',
  'Maintenance',
  'Transport',
  'Marketing',
  'Equipment',
  'Printing',
  'Other',
] as const;

export const createExpense = async (
  data: {
    category: string;
    description?: string;
    amount: number;
    expense_date: string;
    notes?: string;
  },
  userId: number
) => {
  if (!data.category) throw createError('Category is required', 400);
  if (!data.amount || data.amount <= 0) throw createError('Amount must be greater than 0', 400);
  if (!data.expense_date) throw createError('Date is required', 400);

  const ref = genRef();
  const result = await query(
    `INSERT INTO expenses (reference_number, category, description, amount, expense_date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [ref, data.category, data.description || null, data.amount, data.expense_date, data.notes || null, userId]
  );
  return result.rows[0];
};

export const getExpenses = async (params: {
  page?: number;
  limit?: number;
  date_from?: string;
  date_to?: string;
  category?: string;
}) => {
  const page   = params.page  || 1;
  const limit  = params.limit || 50;
  const offset = (page - 1) * limit;
  const conds: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (params.date_from) { conds.push(`e.expense_date >= $${i++}`); vals.push(params.date_from); }
  if (params.date_to)   { conds.push(`e.expense_date <= $${i++}`); vals.push(params.date_to); }
  if (params.category)  { conds.push(`e.category = $${i++}`);      vals.push(params.category); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const countRes = await query(`SELECT COUNT(*) FROM expenses e ${where}`, vals);
  const dataRes  = await query(
    `SELECT e.*, u.name AS created_by_name
     FROM expenses e
     JOIN users u ON e.created_by = u.id
     ${where}
     ORDER BY e.expense_date DESC, e.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...vals, limit, offset]
  );

  const total = parseInt(countRes.rows[0].count);
  return { data: dataRes.rows, total, page, limit };
};

export const getSummary = async (dateFrom: string, dateTo: string) => {
  const result = await query(
    `SELECT category, SUM(amount) AS total
     FROM expenses
     WHERE expense_date >= $1 AND expense_date <= $2
     GROUP BY category
     ORDER BY total DESC`,
    [dateFrom, dateTo]
  );
  const grandTotal = result.rows.reduce((s: number, r: any) => s + Number(r.total), 0);
  return { by_category: result.rows, grand_total: grandTotal };
};

export const deleteExpense = async (id: number) => {
  const result = await query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) throw createError('Expense not found', 404);
};
