---
type: Feature
title: Shared UI Primitives
description: The reusable buttons, dialogs, badges, controls, and layout primitives that every page is built from.
tags: [design-system, components, layout, forms]
status: draft
generated: { by: claude-code/claude-sonnet-5, at: 2026-11-10T16:58:53Z }
sources:
  - id: button
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/button.tsx
    title: Button component
  - id: action-button
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/action-button.tsx
    title: ActionButton component
  - id: dialog
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/dialog.tsx
    title: Dialog component
  - id: alert-dialog
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/alert-dialog.tsx
    title: AlertDialog component
  - id: confirm-dialog
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/confirm-dialog.tsx
    title: ConfirmDialog component
  - id: notice-dialog
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/notice-dialog.tsx
    title: NoticeDialog component
  - id: status-badge
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/status-badge.tsx
    title: StatusBadge component
  - id: row-action
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/row-action.tsx
    title: RowAction component
  - id: segmented-control
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/segmented-control.tsx
    title: SegmentedControl component
  - id: toggle
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/toggle.tsx
    title: Toggle component
  - id: toggle-group
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/toggle-group.tsx
    title: ToggleGroup component
  - id: field
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/field.tsx
    title: Field component
  - id: toolbar
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/toolbar.tsx
    title: Toolbar component
  - id: settings-board
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/settings-board.tsx
    title: SettingsBoard component
  - id: show-archived-toggle
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/show-archived-toggle.tsx
    title: ShowArchivedToggle component
  - id: table
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/table.tsx
    title: Table component
  - id: card
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/card.tsx
    title: Card component
  - id: input
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/input.tsx
    title: Input component
  - id: page-failure
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/page-failure.tsx
    title: PageFailure component
  - id: error-code
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/error-code.tsx
    title: ErrorCode component
  - id: read-only-notice
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/read-only-notice.tsx
    title: ReadOnlyNotice component
  - id: window
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/window.tsx
    title: Window component
  - id: window-toolbar
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/window-toolbar.tsx
    title: Window toolbar controls
  - id: traffic-lights
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/traffic-lights.tsx
    title: TrafficLights component
  - id: dock
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/dock.tsx
    title: Dock component
  - id: menu
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/menu.tsx
    title: Menu component
  - id: tooltip
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/tooltip.tsx
    title: Tooltip component
  - id: sidebar-list
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/sidebar-list.tsx
    title: SidebarList component
  - id: widget
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/widget.tsx
    title: Widget component
  - id: widget-grid
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/widget-grid.tsx
    title: WidgetGrid component
  - id: widget-grid-layout
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/widget-grid-layout.ts
    title: Widget grid placement rules
  - id: widget-gallery
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/widget-gallery.tsx
    title: WidgetGallery component
  - id: context-menu
    resource: https://github.com/s1041613/studiolane/blob/main/src/components/ui/context-menu.tsx
    title: ContextMenu component
---

# Overview

This document covers the reusable interface components in
`src/components/ui/*`. The underlying rules for color, font, corner
radius, and spacing live in [Design Tokens](design-system.md).

Most of these components' code comments mark a section with a
`DESIGN.md §` reference, for example `§5.1`, `§5.4`, and `§5.9` through
`§5.11`. This repo does not have a `DESIGN.md` file right now. The notes
below describe only what the component code itself does, and do not cite
that missing file.

# Buttons and Action Buttons

`Button` is the base button component. It uses `class-variance-authority`
to manage nine variants.[^button]

- `default` is the primary button. Its background is a soft gradient that
  slides right on hover.
- `outline`, `secondary`, and `ghost` are regular buttons: a white
  background with a border, a gray background, and a transparent
  background.
- `icon` is for icon-only buttons.
- `destructive` is a solid button for delete or deactivate confirmations.
  `destructive-ghost` is for a delete button inside a dialog. Its
  background is transparent and turns red only on hover.
- `row-action` is for each row's action button in a list, and for the
  close button in the top right corner of a dialog.
- `link` is a text link style.
- `dark` is only for the sign-in screen. It has a solid dark background,
  unlike the `default` gradient.

Size also has several options, from `xs` (24px) to `lg` (42px, for a
page's primary action, such as submitting a booking). A few more square
sizes hold only an icon.[^button]

`ActionButton` wraps `Button`, for any button that runs an action. It has
two modes.[^action-button]

- The `onClick` mode ignores repeat clicks within 300ms and locks the
  button while the action runs, releasing it only after the async work
  finishes. Buttons placed in the same `ActionGroup` share one lock, so
  when one action on a row is running, the row's other action buttons
  lock too.
- The external pending mode does not take an `onClick`. It only reflects a
  pending state managed elsewhere, such as `useActionState`, for native
  form submission. This keeps pressing Enter to submit a form working
  correctly.

# Dialog Family

`Dialog` and `AlertDialog` share the same look, but differ in
interaction.[^dialog][^alert-dialog] `Dialog` has a `✕` close icon in the
top right corner, so it does not need a cancel button at the bottom.
`AlertDialog` has no `✕`. It always keeps a cancel and a confirm button at
the bottom, for confirmation actions. `DialogBody` lets the dialog content
scroll on its own, while the header and footer stay fixed.[^dialog]

`ConfirmDialog` wraps `AlertDialog`, giving actions such as deactivating a
row a shared confirmation behavior.[^confirm-dialog] It manages its own
pending state: the confirm button shows a spinner, and the cancel button
locks too while the action runs. The dialog can close only after the
action finishes. In the same file, `DiscardChangesDialog` and
`useDiscardGuard` are a fixed pairing built for the `放棄這次的修改？`
(discard these changes?) case. Its confirm button reads `放棄` (discard)
and its cancel button reads `取消` (cancel).

`NoticeDialog` uses the same frame, but only to tell the user that
something cannot be done or is already done. It has only a confirm button,
plus at most one extra action. It never offers a button that would finish
the rejected action.[^notice-dialog]

# Status Badge and Row Actions

`StatusBadge` is for a deactivated settings row. It shows the label
`已停用` (deactivated). If the row is still active, it shows
nothing.[^status-badge] `archivedRowClass` separately turns the whole row's
text gray, so a deactivated row stands out at a glance.[^status-badge]

`RowAction` is the action button on the right side of each list row. It is
always a 32px icon button, not shown only on hover, because tablets have no
hover.[^row-action] Six actions exist today: `編輯` (edit), `停用`
(deactivate, red), `啟用` (reactivate, green), `刪除` (delete, red), `更多`
(more), and `查看` (view). When an action is temporarily unavailable, its
button uses `aria-disabled` instead of `disabled`, so a pointer can still
hover over it and see why it is disabled. A native `disabled` button does
not show a hover tooltip, so it cannot be used for this.

# Segmented Controls

`SegmentedControl` and `MultiSegmentedControl` are both built from
`ToggleGroup` with the `track` style of `Toggle`.[^segmented-control][^toggle][^toggle-group]
The first always has exactly one selection. The second can have zero or
more. Both components call `useFieldControl` inside their own function, to
read `aria-invalid` and `aria-describedby` from the surrounding
`Field`.[^segmented-control][^field] This call must not be destructured at
the call site and passed in. Doing so would run the hook in the caller's
render, not inside the child component that `Field` renders, and it would
read the wrong field state.

`ShowArchivedToggle` is another common filter control, used in a toolbar to
show `顯示已停用` (show deactivated).[^show-archived-toggle] It defaults to
off, so a list shows only active rows by default. It also shows a count of
how many rows are currently deactivated.

# Toolbar

`Toolbar` is the top row of a content card. Filters, such as a segmented
control, a search box, and `ShowArchivedToggle`, go on the left. Primary
actions, such as adding a row, go on the right.[^toolbar] If the list below
fails to load, the whole `Toolbar` becomes a disabled `fieldset`. Every
control inside it, including the add button, turns 50% transparent,
because a page that failed to load its data should not let any control
keep working.[^toolbar] `Toolbar` usually sits inside a `SettingsBoard`
layout container, followed by the content card itself.[^settings-board]

# Table

The `Table` set, `TableFrame`, `TableHeader`, `TableBody`, `TableRow`,
`TableHead`, and `TableCell`, is shared by every list page's
table.[^table] With `stack="md"`, the whole table turns into a stack of
two-column cards below the `md` breakpoint, but it still keeps the table's
semantic role, so a screen reader can still read it correctly.

With `density="compact"`, the table becomes a window's list pane: 35px
single-line rows with no row dividers, a rounded blue selected row, and a
small 11.5px header.[^table] A `TableHead` with a `sort` prop renders its
label as a button and sets `aria-sort`; the sorted column reads bold with
a ▲ or ▼.[^table]

# Card and Form Fields

`Card` is a card with a translucent white background and a large corner
radius. `padding` can be regular, more relaxed, or none. `fill` lets a list
page's card fill the rest of the window height and scroll on its
own.[^card] `Inset` marks a sub-section inside a card.

`Field` standardizes the layout of a form field: the field name sits 8px
above the control, helper text sits on the same line to the right, an
error message sits below the control, and a divider separates one field
from the next.[^field] `Field` passes the control's id, its error state,
and the id of its error message to components such as `Input` through
`FieldControlContext`. This read must happen inside the control
component's own function, for the same reason given above for
`SegmentedControl`.[^field][^input]

# Load Failure and Read-Only Notice

`PageFailure` is the full-page failure screen, shared by every `error.tsx`
and `global-error.tsx`. It has only a title, one line of explanation, and
`ErrorCode`, with no buttons. Reloading the page is the way to
retry.[^page-failure] `ErrorCode` shows the error code in uppercase, with a
copy button that shows `已複製` (copied) for two seconds after a
successful copy.[^error-code]

`ReadOnlyNotice` is used on settings pages that only an admin can edit. It
tells a non-admin that the page can be viewed but not changed.[^read-only-notice]
The page hides the editing controls, but the server still refuses a write
from a non-admin. Hiding the controls is a convenience for the user, not
the only guard.

An error shown as a toast always has a ✕ close button. An error does not go
away on its own, so the user must be able to close it.

# Window, Traffic Lights, and Dock

`Window` is a floating, draggable, resizable panel with file-browser-style
chrome: a title bar with `TrafficLights` and a centered title, three resize
handles, and Esc-to-close.[^window] Position and size are read from a
`rect` prop and written back only when a drag or resize ends.
With `toolbar`, the title bar shows no title. Instead, the content puts
its own controls there through `WindowToolbar`, a portal into the title
bar. Outside a `Window` (for example, in a unit test), `WindowToolbar`
renders its children in place.[^window] `WindowPane` is an inset, rounded
content pane inside a window. `WindowStatusBar` is the one line of
centered summary text along the window's bottom edge.[^window]

The title bar's controls live in `window-toolbar.tsx`: `ToolbarButton` (a
glossy pill button), `ToolbarButtonGroup` (two buttons joined edge to
edge, such as back and forward), `ToolbarTitle`, and `ToolbarSearch` (a
rounded search field with a magnifier and an optional × clear
link).[^window-toolbar]
`TrafficLights` renders the three gel-sphere window-control dots; only the
close light does anything today, min/max are decorative
placeholders.[^traffic-lights] `Dock` is the floating icon bar pinned to
the bottom of the desktop, holding `DockItem` entries with a hover label
and an active indicator dot.[^dock] All three are used together by the
desktop shell that `/bookings` renders inside of.

# Menu, Tooltip, and SidebarList

`Menu` is a context menu for one row: a trigger (click, or a row's own
right-click) opens a popup of real `menuitem`s with arrow-key navigation,
type-ahead, and Esc-to-close, unlike `Popover`'s plain buttons-in-a-box.
Use it for a row's own choice (such as the bookings list's `狀態` cell),
not a form control's popover.[^menu] A disabled `MenuItem` stays in the
menu, dimmed, instead of being removed, so its text can explain why.[^menu]

`Tooltip` is a passive hint, not a choice: hover or focus only, with about
a 450ms open delay carried by its own `Provider` (base-ui's `Tooltip.Root`
takes no delay prop directly).[^tooltip] It never opens from a touch tap,
so it needs no extra wiring for a `(hover: none)` device.[^tooltip] It
looks like a classic desktop help tag (pale yellow, square-ish) and opens
below its trigger, start-aligned by default.[^tooltip]

`SidebarList` is a window's left-hand folder list, in its own inset pane:
grouped sections, each item a small blue folder icon (`glyph` picks the
symbol on it), a label, and a quiet count. The selected item is a blue
gradient pill with white text. An item's count can be marked `accent`
(bold blue, for a folder that still needs a decision) or `danger` (red,
for a live clash).[^sidebar-list]

All three are used together by the bookings list's shelf view (sidebar
folders, a row's `狀態` menu, and a clash tooltip on the date).

# Widget, Widget Grid, Widget Gallery, and Context Menu

`Widget` is a frosted desktop card in a light or dark tone. It fills the
box the grid gives it. In edit mode it wobbles and shows a round − button;
`WidgetAddButton` is the matching round +.[^widget] `WidgetGrid` places
widgets on a home-screen-style grid of square cells. In edit mode a widget
can be dragged, and on release it snaps to the cell under it, or the
nearest free cell when that one is taken, so a drop never displaces
another widget.[^widget-grid] The placement rules (free-cell check, first
free cell, nearest free cell, re-flow to a narrower grid) are pure
functions with unit tests.[^widget-grid-layout] `WidgetGallery` is the
加入小工具 sheet: a list on the left and a real-size preview with one
action on the right.[^widget-gallery] `ContextMenu` is the right-click
menu that opens at the pointer; the desktop uses it to enter edit
mode.[^context-menu]

Desktop windows have their own control look. `Window chrome="plain"` drops
the toolbar band; the body holds `WindowPane`s (`tone="panel"` for a lighter
side column).[^window] Inside them use `Button` `bevel` (清除) and `gel` (送出),
`SegmentedControl look="gel"` (教室, 用途, 付款方式), `Input
variant="inline"` for text that reads as plain until hovered or focused,
and `Skeleton` for the fill-in placeholder.[^button][^input] Colours come
from the `--eb-desk-*`, `--eb-bevel*`, `--eb-gel*` and `--eb-window-*` tokens in
`src/app/tokens.css`.

[^button]: Button component
[^action-button]: ActionButton component
[^dialog]: Dialog component
[^alert-dialog]: AlertDialog component
[^confirm-dialog]: ConfirmDialog component
[^notice-dialog]: NoticeDialog component
[^status-badge]: StatusBadge component
[^row-action]: RowAction component
[^segmented-control]: SegmentedControl component
[^toggle]: Toggle component
[^toggle-group]: ToggleGroup component
[^field]: Field component
[^toolbar]: Toolbar component
[^settings-board]: SettingsBoard component
[^show-archived-toggle]: ShowArchivedToggle component
[^table]: Table component
[^card]: Card component
[^input]: Input component
[^page-failure]: PageFailure component
[^error-code]: ErrorCode component
[^read-only-notice]: ReadOnlyNotice component
[^window]: Window component
[^window-toolbar]: Window toolbar controls
[^traffic-lights]: TrafficLights component
[^dock]: Dock component
[^menu]: Menu component
[^tooltip]: Tooltip component
[^sidebar-list]: SidebarList component
[^widget]: Widget component
[^widget-grid]: WidgetGrid component
[^widget-grid-layout]: Widget grid placement rules
[^widget-gallery]: WidgetGallery component
[^context-menu]: ContextMenu component
