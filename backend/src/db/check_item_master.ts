import { query } from './pool';

async function main() {
  try {
    console.log('--- checking item_master details ---');
    const items = await query<any>(`
      SELECT id, item_code, customer_name, grade, casting_code 
      FROM item_master 
      WHERE customer_name ILIKE '%Accucut Lasers%'
    `);
    console.log('Items in item_master for Accucut Lasers:', items);

    console.log('\n--- checking SAP fallback purchase orders (por1) or special prices (ospp) ---');
    const porRes = await query<any>(`
      SELECT DISTINCT p."CardCode", v.cardname
      FROM por1_sftp p
      JOIN ocrd_sftp v ON p."CardCode" = v.cardcode
      WHERE p."ItemCode" = '0.023.0516.0/20'
    `);
    console.log('SAP Purchase Orders for 0.023.0516.0/20:', porRes);

    const osppRes = await query<any>(`
      SELECT DISTINCT o."CardCode", v.cardname
      FROM ospp_sftp o
      JOIN ocrd_sftp v ON o."CardCode" = v.cardcode
      WHERE o."ItemCode" = '0.023.0516.0/20'
    `);
    console.log('SAP Special Prices for 0.023.0516.0/20:', osppRes);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

main();
