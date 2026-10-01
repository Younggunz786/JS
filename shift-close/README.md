# Shift Close — reconciliation engine (v0.1)

The calculation core of the Shift Close app for TotalEnergies Perth Road.
It implements spec sections 5.1–5.6 (cash-up, pumps vs POS, tank reconciliation,
delivery check, order check, dip vs gauge). No screens or database yet.

## Rules
- Money is integer cents and volume is integer centilitres. No floating-point money, ever.
- Pure functions only: same input, same answer.
- Bad input throws an error. Nothing is guessed.
- Rebates are cut down to the cent (not rounded), which matches the POS (confirmed 30 Sep 2026).
- POS logins are matched by cashier number on the staff record, not by spelling of names.

## Run
    npm install
    npm test        # acceptance tests (real 30 Sep 2026 papers)
    npm run typecheck

## Files
- `src/units.ts`: cents and centilitres, parsing and display
- `src/cashup.ts`: Page 7 reconciliation and cross-checks
- `src/fuel.ts`: pumps vs POS, tank reconciliation, delivery check, order check, dip check
- `test/sept30.test.ts`: acceptance test no. 1

## Test case no. 1 (all passing)
- Day shift 482: short R0.88. Night shift 483: short R2.56.
- Fuel variance, 06:00 to 06:00: diesel +37.64 L, ULP 95 −56.87 L, ULP 93 +1.48 L.
- Pumps vs POS: ULP 95 +13.87 L is flagged; diesel and 93 are within rounding.
- Delivery: 3,278 L ULP 95 and 956 L diesel not delivered, fully explained by the recorded return.
- Flags raised: POS login mismatch on day shift, R0.06 local-account difference, one taxi rebate 8c short.

Every new day of real paperwork should be added as another test before go-live.
