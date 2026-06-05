-- Migration: Add Internal Use (Print Shop Consumption) tables
-- Run this on existing databases that already have the base schema

CREATE TABLE IF NOT EXISTS internal_use (
  id SERIAL PRIMARY KEY,
  reference_number VARCHAR(100) UNIQUE NOT NULL,
  purpose VARCHAR(255),
  notes TEXT,
  total_cost DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'completed',
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internal_use_items (
  id SERIAL PRIMARY KEY,
  internal_use_id INTEGER NOT NULL REFERENCES internal_use(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name VARCHAR(255) NOT NULL,
  barcode VARCHAR(100),
  quantity DECIMAL(12,3) NOT NULL,
  cost_price DECIMAL(12,4) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_use_date ON internal_use(created_at);
CREATE INDEX IF NOT EXISTS idx_internal_use_items_ref ON internal_use_items(internal_use_id);
CREATE INDEX IF NOT EXISTS idx_internal_use_items_product ON internal_use_items(product_id);
