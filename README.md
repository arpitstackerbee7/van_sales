# Van Sales

Mobile field operations for ERPNext: van sales, pre-sales, logistics, picking
and management, in one app whose screens are decided by the signed-in user's
ERPNext roles.

One repository, two halves:

```
van_sales/          Frappe app  -- doctypes, policy and the mobile API
mobile/             Expo app    -- React Native client (Android / iOS)
```

## Design decisions worth knowing

**The invoice carries its own payment.** A van cash or cheque sale is one
document: a Sales Invoice against the van's warehouse with `update_stock`
on and the payment on the invoice itself. It posts once and comes back
`Paid` with nothing outstanding, and stock leaves the van at the same time,
so there is no separate delivery note or receipt to reconcile.

ERPNext only writes those payment rows to the ledger from
`make_pos_gl_entries`, which is gated on `is_pos` — so a settled invoice is
flagged POS. Without that flag the rows would sit on the document while the
customer still showed as owing the full amount, which is worse than not
having them. **No POS Profile is created or read**: `ignore_pos_profile`
stops ERPNext looking for one, and the accounts come from the Van Sales
Profile. Turn this off with **Record Payment on the Invoice** in Van Sales
Settings to go back to invoice-plus-separate-receipt.

A credit sale carries no payment rows, is not flagged POS, and is simply
left outstanding. A **post-dated cheque is refused** on an invoice: the
money has not arrived, so settling against it would erase the debt weeks
before it clears. It belongs on a held Payment Entry.

**Almost nothing is a new doctype.** Deliveries are ERPNext `Delivery Trip`s,
picking is `Pick List`, replenishment is `Material Request`, receipts are
`Payment Entry`, returns are credit notes, and credit limits are ERPNext's
own. The only additions are `Van Sales Profile` (which van a rep is on) and
`Van Sales Settings` (site policy).

**Roles decide the app, not the build.** `van_sales.api.session.bootstrap`
returns the home screen and tab set for the user's roles. Adding a role on
the desk changes the app at the next sync; nothing is configured on the
handset.

**Every write is idempotent.** The device generates a `client_uid` before a
document is queued. `van_client_uid` is a unique field on Sales Invoice,
Sales Order, Payment Entry, Delivery Note and Material Request, so an
offline retry resolves to the original document instead of posting twice.
Frappe coerces empty unique values to NULL, so desk-created documents never
collide.

**Money is calculated server-side.** The cart calls
`van_sales.api.selling.quote`, which builds the real invoice in memory and
returns its totals. The app never computes tax.

**Field collections are drafts.** A collection against invoices raised
earlier — the driver case — posts as a draft Payment Entry for the cashier
to finalise. One person does not both hold the cash and close the books on
it. That is separate from a van sale settling at the door, which is a single
paid invoice.

## Setting up a van

1. Tick **Is a Van** on the warehouse the stock travels in.
2. Create a **Van Sales Profile**: company, that warehouse, price list,
   payment modes, and the users assigned to it. A user may be on only one
   van, so "which stock am I holding" is never ambiguous.
3. Give the user the **Van Sales User** role, plus the standard ERPNext
   roles that grant the underlying document access (Sales User, Accounts
   User, Stock User).
4. Review **Van Sales Settings** for barcode, offline, credit and negative
   stock policy.

## Running the mobile app

```bash
cd mobile
npm install
npx expo start          # scan the QR with Expo Go
npm run typecheck
```

The phone must be able to reach the ERPNext site, so `site1.localhost:8000`
will not work from a handset. Serve the bench on the machine's LAN address
and enter that address on the sign-in screen.

## Building an APK

Local builds need a JDK and the Android SDK. Cloud builds need neither:

```bash
cd mobile
npx eas login
npx eas build --platform android --profile preview   # installable .apk
```

`preview` produces an APK for sideloading. `production` produces an app
bundle for Play. `development` produces a dev client, which is what the
Bluetooth thermal printing work will need.

## Status

Built and verified end to end against a live site:

- token sign-in, role-driven navigation, offline session window
- customers with outstanding, credit limit and ageing; statement of account
- barcode scan to priced line, checked against van stock
- server-priced cart, invoice post, credit-limit block
- cash sale settling on the invoice, change computed, cash posted to the ledger
- post-dated cheque refused as an invoice settlement
- draft receipts with oldest-first allocation
- idempotent replay of a retried post

Not built yet: pre-sales orders and team-leader approval, driver trips and
delivery confirmation, store picking and loading, the management dashboard,
and Bluetooth ESC/POS printing. Those screens exist in the app and say so
rather than showing placeholder data.
