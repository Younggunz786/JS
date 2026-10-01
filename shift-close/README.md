# Shift Close (v0.5)

Shift Close for TotalEnergies Perth Road: the reconciliation engine and the single-file app built on it.
It implements the Shift Close App Specification v1: cash-up (5.1), pumps vs POS (5.2), tank reconciliation (5.3),
delivery check (5.4), order check (5.5), dip vs gauge (5.6), the alerts in section 6, the reports in section 7,
and the roles and audit rules in sections 2, 4 and 8.

## Rules
- Money is integer cents and volume is integer centilitres. No floating-point money, ever.
- Pure functions only: same input, same answer. All calculations live in the engine; the app only displays them.
- Bad input throws an error. Nothing is guessed.
- Rebates are cut down to the cent (not rounded), which matches the POS (confirmed 30 Sep 2026).
- POS logins are matched by cashier number on the staff record, not by spelling of names.
- A total is never typed when its lines exist: the app adds up the lines (account sheets, batches, drops).
- Corrections are never silent: once a shift has been submitted, every changed number is logged with the old value,
  who changed it, when and why.

## Run
    npm install
    npm test          # engine acceptance tests (real Perth Road papers, 10 Sep to 1 Oct 2026)
    npm run typecheck
    npm run build     # writes app/shift-close.html (engine inlined) and dist/*.json seed records
    npm run e2e       # builds, then drives the app in Chromium against a mock claude.ai runtime

Set `CHROMIUM_PATH` if Chromium is not at `/opt/pw-browsers/chromium`.

## Files
- `src/units.ts`: cents and centilitres, parsing and display
- `src/cashup.ts`: Page 7 reconciliation and cross-checks
- `src/fuel.ts`: pumps vs POS, tank reconciliation, delivery check, order check, dip check
- `src/checks.ts`: written Page 7 result, pump continuity, Total Card
- `src/posslip.ts`: POS balancing slip checks
- `src/evaluate.ts`: one entry point per shift and per fuel day, producing every result and alert
- `seed/seed.ts`: the real 30 Sep 2026 records the pilot is seeded with
- `app/app.src.html`: the app source; `app/shift-close.html` is the built file that is published
- `e2e/`: browser tests and the mock runtime

## The app
Published as a claude.ai artifact using the `db` (shared shift records and settings), `user` (who is viewing, for roles
and the history), `assets` (photos of slips) and `downloads` (CSV and shift pack) capabilities.

- **Today**: both shifts of a fuel day, the 24-hour fuel check with month to date and loss streaks, tank levels,
  the order check, and the morning brief in the format of spec section 7.
- **Shift**: every page of the paper pack, with the live cash-up and checks beside it. Workflow
  Open → Submitted → Reconciled → Signed off, with "send back one step" and a note.
- **Reports**: fuel variance per fuel day, cash per cashier, open unpaids by customer and age, staff overfills,
  rebates per customer with rate mismatches, delivery history. Every table downloads as CSV or copies into Excel.
- **Settings** (owner and editors): roles, staff and POS logins, rebate rates, account and rebate customer lists,
  pumps, tanks, safe fill, prices and every tolerance.

### Roles
While no roles are set, everyone with access can enter and approve (pilot mode). Once roles are set:

| Role | Can |
|---|---|
| Cashier | Enter and submit an open shift |
| Forecourt supervisor | Enter tank gauge, dips and deliveries (open or submitted shifts) |
| Cash-up controller | Enter POS figures, correct a submitted shift with a reason, mark reconciled, send back |
| Checker | Sign off a reconciled shift, or send it back with a note |
| Owner / admin | Everything, including settings |

The artifact's owner and editors are always Owner / admin. Settings can only be written by editors (a server rule);
the other role limits are applied by the app's screens, since the platform's access levels are view, use and edit.

## Test cases
- No. 1, 30 Sep 2026: day short R0.88, night short R2.56; fuel day diesel +37.64 L, ULP 95 −56.87 L, ULP 93 +1.48 L;
  delivery 3017884981 fully explained by its returns.
- No. 2, 22 Sep to 1 Oct: split by shift, gauge vs truck per drop, POS slip consistency.
- No. 3, 14 shifts 10 to 30 Sep: Page 7 recalculated, 4 arithmetic slips and 1 wrong direction caught.
- Spec v1 checks: delivery notes, dips, tank levels and water, written Page 7, manual discounts, account lines,
  loss streaks, order room.

Every new day of real paperwork should be added as another test before go-live.
