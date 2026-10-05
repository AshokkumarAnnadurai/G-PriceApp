# Vendor Materials Revert Trigger

## Overview
This trigger automatically reverts approved customer items back to 'pending' status when vendor pricing or weight data changes.

## Purpose
- **Auto-revert approval** when vendor material data is modified
- **Cascade changes** from vendor_materials → customer tables
- **Prevent stale approvals** that use outdated vendor data

## Affected Tables
**Source (monitored):** `vendor_materials`
**Targets (modified):** 
- `argit_pld1` - Domestic Customer Pricing
- `aargit_ple1` - Export Customer Pricing
- `argit_pll1` - Labour / Job Work Customer Pricing
- `aargit_plp1` - Pin & Bush Customer Pricing

## Trigger Behavior

### When Trigger Fires
BEFORE UPDATE on `vendor_materials` table

### Conditions
The trigger checks if ANY of these columns have changed (using `IS DISTINCT FROM`):
- `revised_price` - Revised/Updated Price
- `revised_rate_per_kg` - Rate per KG
- `rm_weight` - Raw Material Weight

### Action
If conditions are met:
1. Find all customer table rows with matching `casting_code`
2. Where `pricing_audit_status = 'approved'`
3. Set their status to `'pending'`
4. Log the change with casting_code

## Flow Diagram
```
User updates vendor_materials (price/weight change)
         ↓
Trigger fires BEFORE UPDATE
         ↓
Check if revised_price, revised_rate_per_kg, or rm_weight changed
         ↓
Find all approved items in customer tables with same casting_code
         ↓
Revert their pricing_audit_status from 'approved' → 'pending'
         ↓
Update completes, application refreshes Pricing Audit page
```

## Examples

### Example 1: Vendor Price Change
```sql
UPDATE vendor_materials 
SET revised_price = 450 
WHERE vendor_id = 'V001' AND casting_code = '916600030';
-- Result: All approved items in customer tables with casting_code='916600030'
--         have their pricing_audit_status changed to 'pending'
```

### Example 2: Vendor Weight Change
```sql
UPDATE vendor_materials 
SET rm_weight = 2.8 
WHERE casting_code = '916600030';
-- Result: Auto-reverts all approved customer items with that casting_code
```

### Example 3: No Change (Trigger Does NOT Fire)
```sql
UPDATE vendor_materials 
SET from_date = from_date 
WHERE vendor_id = 'V001';
-- Result: No trigger (date fields not monitored)
```

## Related Triggers
- **Customer Table Revert Triggers** - Reverts items when customer data changes
- **Both work together** for complete approval integrity

## Testing Checklist
- [ ] Approve multiple items in different customers with same casting_code
- [ ] Verify they appear in Approved tab
- [ ] Update vendor_materials price for that casting_code
- [ ] Check database - customer table status should be 'pending'
- [ ] Refresh Pricing Audit page
- [ ] Confirm items moved back to Pending tab

## Performance Notes
- Trigger fires on BEFORE UPDATE (minimal overhead)
- Uses efficient `IS DISTINCT FROM` comparison
- Handles NULL values correctly
- Updates only affected customer rows

## SQL Definition
See: `database/triggers/02_VENDOR_REVERT_TRIGGER.sql`

## Monitoring

### View Recent Revert Activity
```sql
SELECT casting_code, COUNT(*) as items_reverted
FROM argit_pld1
WHERE pricing_audit_status = 'pending'
GROUP BY casting_code
ORDER BY casting_code;
```

### Disable Trigger Temporarily
```sql
ALTER TABLE vendor_materials DISABLE TRIGGER trg_vendor_materials_revert_approved;
-- Re-enable:
ALTER TABLE vendor_materials ENABLE TRIGGER trg_vendor_materials_revert_approved;
```

### Check Trigger Status
```sql
SELECT trigger_name, trigger_schema, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%vendor%revert%';
```

## Troubleshooting

### Items Not Reverting?
1. Verify `casting_code` matches exactly (check for spaces/whitespace)
2. Check if `revised_price`, `revised_rate_per_kg`, or `rm_weight` actually changed
3. Verify items have `pricing_audit_status = 'approved'` BEFORE the update
4. Check PostgreSQL logs for errors

### Only Some Items Reverted?
- Trigger only affects items with matching `casting_code`
- Items without the exact casting_code won't be affected
- Check casting_code values in both vendor_materials and customer tables

### Need to Monitor More Columns?
Edit the trigger and add more conditions:
```sql
OR NEW.other_column IS DISTINCT FROM OLD.other_column
```
