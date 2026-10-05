# Customer Table Revert Triggers

## Overview

These triggers automatically revert approved items back to 'pending' status when pricing or weight values change in the customer tables.

## Purpose

- **Auto-revert approval** when customer pricing data is modified
- **Ensure accuracy** by requiring re-approval after any pricing changes
- **Prevent stale approvals** that no longer match current data

## Affected Tables

- `argit_pld1` - Domestic Customer Pricing
- `aargit_ple1` - Export Customer Pricing
- `argit_pll1` - Labour / Job Work Customer Pricing
- `aargit_plp1` - Pin & Bush Customer Pricing

## Trigger Behavior

### When Trigger Fires

BEFORE UPDATE on any of the 4 customer tables

### Conditions

The trigger checks if:

1. Current status is `pricing_audit_status = 'approved'`
2. ANY of the following columns have changed (using `IS DISTINCT FROM`):
   - `U_CastWt` - Casting Weight
   - `U_CastRate` - Casting Rate
   - `U_CastPric` - Casting Price
   - `U_SpecProcWt` - Special Process Weight
   - `U_SpecProcRate` - Special Process Rate
   - `U_SpecProc` - Special Process Price
   - `U_RejCost` - Rejection Cost
   - `U_PowdCoat` - Powder Coating
   - `U_ProcMach` - Process Machining
   - `U_TranChar` - Trans Charges
   - `U_OHP` - Overhead
   - `U_Packing` - Packing
   - `U_FinPrice` - Final Price
   - `U_RoRate` - RO Rate
   - `U_ConsRate` - Consumables Rate
   - `U_MmrRate` - MMR Rate
   - `U_Extra` - Extra Factor

### Action

If conditions are met:

```sql
NEW.pricing_audit_status := 'pending'
```

The item is reverted to 'pending' status, requiring re-approval in the Pricing Audit page.

## Examples

### Example 1: Direct U_CastWt Change

```sql
UPDATE argit_pld1
SET "U_CastWt" = 5.5
WHERE "U_ItemNo" = '616600030' AND "U_CustCode" = 'CUS0084';
-- Result: pricing_audit_status changes from 'approved' to 'pending'
```

### Example 2: Bulk Pricing Update via Pricing Update Batch

When a Pricing Update batch updates customer pricing through the application:

- All affected items with `pricing_audit_status = 'approved'` will auto-revert to 'pending'
- No manual intervention needed

### Example 3: No Change (Trigger Does NOT Fire)

```sql
UPDATE argit_pld1
SET "U_OHP" = "U_OHP"
WHERE "U_ItemNo" = '616600030';
-- Result: No change (IS DISTINCT FROM prevents this)
```

## Related Triggers

- **Vendor Materials Revert Trigger** - Reverts approved items when vendor prices/weights change
- **Both triggers work together** to maintain approval integrity across vendor AND customer changes

## Testing Checklist

- [ ] Approve an item in Pricing Audit page
- [ ] Verify it appears in Approved tab
- [ ] Directly change one pricing field (e.g., `U_CastWt`)
- [ ] Refresh Pricing Audit page
- [ ] Confirm item moved back to Pending tab
- [ ] Verify it no longer appears in Approved tab

## Performance Notes

- Triggers fire on BEFORE UPDATE (no performance overhead from row locking)
- Uses efficient `IS DISTINCT FROM` comparison (handles NULLs correctly)
- Separate functions per table (cleaner, easier to manage)

## Troubleshooting

### Item Not Reverting?

1. Check if status is actually `'approved'` (not `'approved '` with spaces)
2. Verify the column being changed is in the trigger list
3. Check PostgreSQL logs for trigger errors

### Need to Add More Columns?

Edit the trigger function for that table and add to the OR conditions:

```sql
OR NEW."U_NewColumn" IS DISTINCT FROM OLD."U_NewColumn"
```

Then recreate the trigger.

### Disable Trigger Temporarily?

```sql
ALTER TABLE argit_pld1 DISABLE TRIGGER trg_argit_pld1_revert_on_change;
-- Re-enable:
ALTER TABLE argit_pld1 ENABLE TRIGGER trg_argit_pld1_revert_on_change;
```
