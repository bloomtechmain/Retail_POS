import fs from 'fs';
import path from 'path';
import { query } from './database';

export const runMigrations = async (): Promise<void> => {
  // Check whether the schema has been applied yet
  const check = await query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
     )`,
    []
  );

  const schemaExists = check.rows[0].exists;

  if (!schemaExists) {
    console.log('[migrate] Fresh database — applying schema...');
    // From backend/dist/config/ → ../../../database/schema.sql = repo root
    const schemaPath = path.join(__dirname, '..', '..', '..', 'database', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await query(sql, []);
    console.log('[migrate] Schema applied.');
  } else {
    // Safe incremental alterations for databases that already exist
    const alterations = [
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en VARCHAR(255)`,
      `CREATE TABLE IF NOT EXISTS sale_returns (
        id SERIAL PRIMARY KEY,
        return_number VARCHAR(100) UNIQUE NOT NULL,
        sale_id INTEGER NOT NULL REFERENCES sales(id),
        shift_id INTEGER NOT NULL REFERENCES shifts(id),
        processed_by INTEGER NOT NULL REFERENCES users(id),
        return_reason TEXT,
        refund_method VARCHAR(20) NOT NULL DEFAULT 'cash',
        total_refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS sale_return_items (
        id SERIAL PRIMARY KEY,
        return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
        sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        product_name VARCHAR(255) NOT NULL,
        quantity DECIMAL(12,3) NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL,
        cost_price DECIMAL(12,4) NOT NULL,
        refund_subtotal DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON sale_returns(sale_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_returns_shift ON sale_returns(shift_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_return_items_ret ON sale_return_items(return_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_return_items_si ON sale_return_items(sale_item_id)`,
      `CREATE TABLE IF NOT EXISTS grn_returns (
        id SERIAL PRIMARY KEY,
        return_number VARCHAR(100) UNIQUE NOT NULL,
        grn_id INTEGER NOT NULL REFERENCES grn(id),
        notes TEXT,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS grn_return_items (
        id SERIAL PRIMARY KEY,
        grn_return_id INTEGER NOT NULL REFERENCES grn_returns(id) ON DELETE CASCADE,
        grn_item_id INTEGER NOT NULL REFERENCES grn_items(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity DECIMAL(12,3) NOT NULL,
        buying_price DECIMAL(12,4) NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_grn_returns_grn ON grn_returns(grn_id)`,
      `CREATE TABLE IF NOT EXISTS printshop_invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(100) UNIQUE NOT NULL,
        invoice_date DATE NOT NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_address VARCHAR(500),
        customer_phone VARCHAR(50),
        payment_type VARCHAR(10) NOT NULL DEFAULT 'cash',
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        item_discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
        bill_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
        tax_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
        tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        grand_total DECIMAL(12,2) NOT NULL DEFAULT 0,
        amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
        balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS printshop_invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL REFERENCES printshop_invoices(id) ON DELETE CASCADE,
        description VARCHAR(500) NOT NULL,
        qty DECIMAL(12,3) NOT NULL DEFAULT 1,
        unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        discount DECIMAL(12,2) NOT NULL DEFAULT 0,
        line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
        sort_order INTEGER DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_printshop_invoices_customer ON printshop_invoices(customer_name)`,
      `CREATE INDEX IF NOT EXISTS idx_printshop_invoices_type ON printshop_invoices(payment_type)`,
      `CREATE INDEX IF NOT EXISTS idx_printshop_invoice_items_inv ON printshop_invoice_items(invoice_id)`,
      // Allow service line items (no physical product) in sale_items
      `ALTER TABLE sale_items ALTER COLUMN product_id DROP NOT NULL`,
    ];
    for (const sql of alterations) {
      await query(sql, []);
    }
    console.log('[migrate] Incremental migrations done.');
  }
};
