-- Printshop invoice headers
CREATE TABLE IF NOT EXISTS printshop_invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_address VARCHAR(500),
  customer_phone VARCHAR(50),
  payment_type VARCHAR(10) NOT NULL DEFAULT 'cash',   -- 'cash' | 'credit'
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  item_discount_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  bill_discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',      -- 'paid' | 'pending' | 'partial'
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Printshop invoice line items
CREATE TABLE IF NOT EXISTS printshop_invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES printshop_invoices(id) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  qty DECIMAL(12,3) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_printshop_invoices_customer ON printshop_invoices(customer_name);
CREATE INDEX IF NOT EXISTS idx_printshop_invoices_type    ON printshop_invoices(payment_type);
CREATE INDEX IF NOT EXISTS idx_printshop_invoice_items_inv ON printshop_invoice_items(invoice_id);
