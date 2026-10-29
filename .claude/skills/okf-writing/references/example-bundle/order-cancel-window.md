---
type: Business Rule
title: Order Cancel Window
description: A shopper can cancel a paid order only in the first 30 minutes after payment.
tags: [orders, cancellation]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T03:54:50Z }
sources:
  - id: cancel-logic
    resource: https://github.com/acme/shop/blob/3f2c9a1e8b7d6c5f4a3b2c1d0e9f8a7b6c5d4e3f/src/server/logic/cancel-window.ts
    title: Cancel window logic source
---

# Rule

The cancel button shows only while `now - paid_at` is 30 minutes or less.[^cancel-logic]
After that, staff must make a refund by hand.

# Examples

| Paid at | Now | Can cancel? |
|---|---|---|
| 10:00 | 10:20 | Yes |
| 10:00 | 10:31 | No |

The time comes from `paid_at` in the [Orders Table](orders-table.md).

[^cancel-logic]: Cancel window logic source
