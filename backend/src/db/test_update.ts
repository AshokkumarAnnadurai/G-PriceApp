import { pool } from './pool';

async function test() {
  try {
    console.log('Testing vendor material update...');
    // We will attempt to update material ID 1 (or any ID) with sample values
    const res = await pool.query(`
      UPDATE vendor_materials
      SET customer_name=$1, casting_code=$2, rm_weight=$3, revised_rate_per_kg=$4, revised_price=$3::numeric * $4::numeric, mmr_rate=$5, ro_rate=$6, consumables_rate=$7, extra_factor=$8, from_date=$9, to_date=$10, updated_at=NOW()
      WHERE id=(SELECT id FROM vendor_materials LIMIT 1)
      RETURNING *
    `, ['All', 'All', 10.5, 85.2, 0, 0, 0, 0, '2026-07-01', '2026-07-31']);
    console.log('Update query succeeded:', res.rows[0]);
  } catch (err) {
    console.error('Update query failed with database error:', err);
  } finally {
    await pool.end();
  }
}

test();
