---
type: Data Model
resource: https://github.com/acme/shop/blob/3f2c9a1e8b7d6c5f4a3b2c1d0e9f8a7b6c5d4e3f/src/server/db/schema/orders.ts
title: Orders Table
description: The database table that stores one row per order, with its status and total.
tags: [orders, database]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T03:54:50Z }
sources:
  - id: orders-schema
    resource: https://github.com/acme/shop/blob/3f2c9a1e8b7d6c5f4a3b2c1d0e9f8a7b6c5d4e3f/src/server/db/schema/orders.ts
    title: Orders table schema source
  - id: orders-ddl
    resource: references/orders-schema.sql
    title: Orders table SQL definition
---

# Schema

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid | The order ID. |
| `status` | text | One of `pending`, `paid`, `cancelled`. |
| `total_cents` | integer | The order total in cents. |
| `paid_at` | timestamptz | When payment finished. Empty until then. |

The table is defined in Drizzle.[^orders-schema] A plain SQL copy is in the bundle.[^orders-ddl]

# Used by

- [Checkout Flow](checkout-flow.md) creates rows.
- [Order Cancel Window](order-cancel-window.md) reads `paid_at`.

[^orders-schema]: Orders table schema source
[^orders-ddl]: Orders table SQL definition
