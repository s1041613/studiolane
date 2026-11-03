# Update Log

## 2026-11-03

* **Update**: [Bookings List](bookings-list.md) now documents the five row
  actions (確認, 標記已付款, 標記完成, 延期, 取消), which statuses show
  which buttons, the refund note on a paid postpone/cancel, and the
  re-read-before-write guard that refuses a lost race instead of
  corrupting the row.

## 2026-11-01

* **Update**: [Bookings List](bookings-list.md) now documents the `?q=`
  search box (renter name or rental ID), its 清除 link, and the 找不到符合的預約 empty
  state; moved "Filters" out of Out of scope to call out that date, status,
  and payment filters are still missing.
* **Update**: [Creating a Booking](booking.md) now says `前往預約追蹤`
  filters the bookings list to that renter, since `/bookings?q=` now
  implements the filter it used to note as missing.

## 2026-10-31

* **Creation**: Added [Bookings List](bookings-list.md) from the read-only
  bookings page, its view and table components, and the newest-first sort.
* **Creation**: Added [Creating a Booking](booking.md) from the booking
  types, validation and conflict logic, the booking sheet and conflict
  dialog components, the submit action, the rental repository, and the
  `create_booking_batch` migration.
* **Initialization**: Created the booking bundle.
