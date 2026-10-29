-- Plain SQL copy of the orders table, kept for readers without Drizzle.
CREATE TABLE orders (
  id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  total_cents integer NOT NULL,
  paid_at timestamptz
);
