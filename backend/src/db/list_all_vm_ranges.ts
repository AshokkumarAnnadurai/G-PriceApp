import { query } from './pool';

async function main() {
  try {
    console.log('--- ALL rows in vendor_materials ---');
    const rows = await query<any>(`
      SELECT id, vendor_id, item_code, rm_weight, revised_rate_per_kg, from_date, to_date, customer_name
      FROM vendor_materials
      ORDER BY id ASC
    `);
    console.log(rows);

    console.log('\n--- ALL rows in vendor_materials_history ---');
    const hist = await query<any>(`
      SELECT id, vendor_id, item_code, new_rm_weight, new_revised_rate_per_kg, from_date, to_date, customer_name
      FROM vendor_materials_history
      ORDER BY id ASC
    `);
    console.log(hist);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

main();
