---
type: Feature
title: Checkout Flow
description: The steps a shopper takes from the cart to a paid order.
tags: [checkout, orders]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-22T03:54:50Z }
sources:
  - id: checkout-action
    resource: https://github.com/acme/shop/blob/3f2c9a1e8b7d6c5f4a3b2c1d0e9f8a7b6c5d4e3f/src/server/actions/checkout.ts
    title: Checkout server action source
---

# Overview

Checkout turns a cart into an order. It has three steps.

1. The shopper checks the cart and presses **Pay**.
2. The server creates a row in the [Orders Table](orders-table.md) with status `pending`.[^checkout-action]
3. The payment provider calls back. The order status becomes `paid`.

# Rules

A shopper can cancel a paid order for a short time. See [Order Cancel Window](order-cancel-window.md).

[^checkout-action]: Checkout server action source
