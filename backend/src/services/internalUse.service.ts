import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { generateInternalUseNumber, round2 } from '../utils/helpers';

interface InternalUseItem {
  product_id: number;
  product_name: string;
  barcode?: string;
  quantity: number;
}

interface CreateInternalUsePayload {
  items: InternalUseItem[];
  purpose?: string;
  notes?: string;
}

export const createInternalUse = async (
  data: CreateInternalUsePayload,
  userId: number
) => {
  return transaction(async (client: PoolClient) => {
    if (!data.items || data.items.length === 0) {
      throw createError('At least one item is required', 400);
    }

    let totalCost = 0;
    const processedItems: any[] = [];

    for (const item of data.items) {
      const productResult = await client.query(
        'SELECT id, name, barcode, avg_cost, current_stock, allow_negative_stock FROM products WHERE id = $1 AND deleted_at IS NULL',
        [item.product_id]
      );
      if (productResult.rows.length === 0) {
        throw createError(`Product ${item.product_id} not found`, 404);
      }
      const product = productResult.rows[0];

      if (!product.allow_negative_stock && parseFloat(product.current_stock) < item.quantity) {
        throw createError(
          `Insufficient stock for "${product.name}". Available: ${product.current_stock}`,
          400
        );
      }

      const costPrice = parseFloat(product.avg_cost) || 0;
      const subtotal = round2(costPrice * item.quantity);
      totalCost += subtotal;

      processedItems.push({
        product_id: product.id,
        product_name: item.product_name || product.name,
        barcode: item.barcode || product.barcode || null,
        quantity: item.quantity,
        cost_price: costPrice,
        subtotal,
      });
    }

    const referenceNumber = generateInternalUseNumber();

    const recordResult = await client.query(
      `INSERT INTO internal_use (reference_number, purpose, notes, total_cost, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [referenceNumber, data.purpose || null, data.notes || null, round2(totalCost), userId]
    );
    const record = recordResult.rows[0];

    for (const item of processedItems) {
      await client.query(
        `INSERT INTO internal_use_items
           (internal_use_id, product_id, product_name, barcode, quantity, cost_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [record.id, item.product_id, item.product_name, item.barcode, item.quantity, item.cost_price, item.subtotal]
      );

      const stockResult = await client.query(
        'SELECT current_stock FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      const balanceBefore = parseFloat(stockResult.rows[0].current_stock);
      const balanceAfter = round2(balanceBefore - item.quantity);

      await client.query(
        'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2',
        [balanceAfter, item.product_id]
      );

      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, balance_before, balance_after, unit_cost, reference_type, reference_id, notes, created_by)
         VALUES ($1, 'internal_use_out', $2, $3, $4, $5, 'internal_use', $6, $7, $8)`,
        [
          item.product_id, item.quantity, balanceBefore, balanceAfter,
          item.cost_price, record.id, data.purpose || null, userId,
        ]
      );
    }

    return { ...record, items: processedItems };
  });
};

export const getInternalUses = async (params: {
  page?: number;
  limit?: number;
  date_from?: string;
  date_to?: string;
}) => {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.date_from) {
    conditions.push(`iu.created_at >= $${i++}`);
    values.push(params.date_from);
  }
  if (params.date_to) {
    conditions.push(`iu.created_at <= $${i++}`);
    values.push(params.date_to + ' 23:59:59');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM internal_use iu ${where}`, values);
  const dataResult = await query(
    `SELECT iu.*, u.name as created_by_name
     FROM internal_use iu
     JOIN users u ON iu.created_by = u.id
     ${where}
     ORDER BY iu.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...values, limit, offset]
  );

  const total = parseInt(countResult.rows[0].count);
  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getInternalUseById = async (id: number) => {
  const result = await query(
    `SELECT iu.*, u.name as created_by_name
     FROM internal_use iu
     JOIN users u ON iu.created_by = u.id
     WHERE iu.id = $1`,
    [id]
  );
  if (result.rows.length === 0) throw createError('Record not found', 404);

  const itemsResult = await query(
    'SELECT * FROM internal_use_items WHERE internal_use_id = $1 ORDER BY id',
    [id]
  );

  return { ...result.rows[0], items: itemsResult.rows };
};
