const { pool, PRIORITY } = require('./db');

async function initializeDatabase() {
  console.log('📦 Initializing Database Tables...');

  const client = await pool.connect(PRIORITY.CRITICAL);
  try {
    await client.query('BEGIN');

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(64) UNIQUE NOT NULL,
        customer_name VARCHAR(120) NOT NULL,
        department VARCHAR(50) NOT NULL,
        total_amount NUMERIC(12, 2) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        sku VARCHAR(50) NOT NULL,
        item_name VARCHAR(120) NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price NUMERIC(10, 2) NOT NULL
      );
    `);

    // Check existing count
    const countRes = await client.query('SELECT COUNT(*) FROM orders');
    const existingCount = parseInt(countRes.rows[0].count, 10);

    if (existingCount < 5000) {
      console.log(`🌱 Seeding initial dataset (current count: ${existingCount})...`);

      // Bulk generate 5,000 orders across departments
      await client.query(`
        INSERT INTO orders (order_number, customer_name, department, total_amount, status, created_at)
        SELECT 
          'ORD-' || LPAD((s.i)::text, 7, '0'),
          'Customer ' || (s.i % 500 + 1),
          (ARRAY['Warehouse A', 'Retail Store 1', 'Online Dispatch', 'Factory Floor', 'Regional Hub'])[1 + (s.i % 5)],
          ROUND((random() * 950 + 50)::numeric, 2),
          (ARRAY['COMPLETED', 'PROCESSING', 'PENDING', 'DELIVERED'])[1 + (s.i % 4)],
          NOW() - (s.i || ' minutes')::interval
        FROM generate_series(1, 5000) AS s(i)
        ON CONFLICT (order_number) DO NOTHING;
      `);

      // Seed order items for orders
      await client.query(`
        INSERT INTO order_items (order_id, sku, item_name, quantity, unit_price)
        SELECT 
          o.id,
          'SKU-' || LPAD(((o.id * 3 + item.num) % 1000)::text, 5, '0'),
          'Product Item ' || ((o.id * 3 + item.num) % 1000),
          1 + ((o.id + item.num) % 5),
          ROUND((o.total_amount / 3)::numeric, 2)
        FROM orders o
        CROSS JOIN (SELECT 1 AS num UNION ALL SELECT 2 UNION ALL SELECT 3) AS item
        ON CONFLICT DO NOTHING;
      `);

      console.log('✅ Seeded 5,000 orders and 15,000 order items!');
    } else {
      console.log(`✅ Database already has ${existingCount} orders. Skipping seeding.`);
    }

    await client.query('COMMIT');
    console.log('🎉 Database initialization complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database initialization failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  initializeDatabase()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };

