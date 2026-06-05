-- Migration: Add Expenses table
-- Run this on existing databases that already have the base schema

CREATE TABLE IF NOT EXISTS expenses (
  id              SERIAL PRIMARY KEY,
  reference_number VARCHAR(100) UNIQUE NOT NULL,
  category        VARCHAR(100) NOT NULL,
  description     VARCHAR(255),
  amount          DECIMAL(12,2) NOT NULL,
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
