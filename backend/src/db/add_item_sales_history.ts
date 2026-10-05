import dotenv from 'dotenv';
import path from 'path';
import { Client } from 'pg';

dotenv.config({ path: path.join(__dirname, '../.env') });

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'pricing_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to DB. Creating item_sales_price_history table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS item_sales_price_history (
        id SERIAL PRIMARY KEY,
        item_code VARCHAR(100) NOT NULL,
        customer_name VARCHAR(200),
        pricing_type VARCHAR(50) NOT NULL,
        valid_from VARCHAR(50),
        valid_to VARCHAR(50),
        price_list VARCHAR(100),
        currency VARCHAR(20),
        changed_fields JSONB NOT NULL,
        updated_by VARCHAR(100) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for faster querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_item_sales_history_item_code ON item_sales_price_history(item_code);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_item_sales_history_updated_at ON item_sales_price_history(updated_at DESC);
    `);

    console.log('Successfully created item_sales_price_history table and indexes.');
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    await client.end();
  }
}

run();
