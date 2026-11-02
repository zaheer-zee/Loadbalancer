require('dotenv').config();
const express = require('express');
const { pool, PRIORITY } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 1. HIGH-PRIORITY: Operational Order Placement (Warehouse / POS / Floor)
app.post('/api/orders', async (req, res) => {
  const start = Date.now();
  const {
    customer_name = 'Floor Client',
    department = 'Warehouse A',
    total_amount = 299.99,
  } = req.body;

  const orderNumber = `ORD-URGENT-${Date.now().toString().slice(-6)}`;

  try {
    const queryStart = Date.now();
    // Query with HIGH PRIORITY (1)
    const result = await pool.query(
      `INSERT INTO orders (order_number, customer_name, department, total_amount, status)
       VALUES ($1, $2, $3, $4, 'PROCESSING')
       RETURNING *`,
      [orderNumber, customer_name, department, total_amount],
      PRIORITY.CRITICAL
    );

    const totalLatency = Date.now() - start;
    const queryLatency = Date.now() - queryStart;

    console.log(
      `⚡ [HIGH PRIORITY] Order ${orderNumber} completed in ${totalLatency}ms (Query: ${queryLatency}ms)`
    );

    res.status(201).json({
      success: true,
      priority: 'HIGH (1)',
      orderNumber,
      latencyMs: totalLatency,
      queryLatencyMs: queryLatency,
      order: result.rows[0],
      poolStatus: {
        active: pool.activeCount,
        queued: pool.queue.length,
      },
    });
  } catch (err) {
    console.error('❌ Order failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. LOW-PRIORITY: Heavy Back-Office Analytical Reports (Sales & Inventory Summary)
app.get('/api/reports/sales-summary', async (req, res) => {
  const start = Date.now();
  const sleepSec = parseFloat(req.query.sleep || '1.5');

  try {
    const queryStart = Date.now();
    // Query with LOW PRIORITY (20)
    // Includes aggregation over orders + items and simulated processing load
    const result = await pool.query(
      `SELECT 
         o.department,
         o.status,
         COUNT(DISTINCT o.id) AS total_orders,
         COUNT(oi.id) AS total_items,
         ROUND(SUM(o.total_amount)::numeric, 2) AS total_revenue,
         ROUND(AVG(o.total_amount)::numeric, 2) AS avg_order_value,
         (SELECT pg_sleep($1)) AS _cost
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       GROUP BY o.department, o.status
       ORDER BY total_revenue DESC`,
      [sleepSec],
      PRIORITY.LOW
    );

    const totalLatency = Date.now() - start;
    const queryLatency = Date.now() - queryStart;

    console.log(
      `📊 [LOW PRIORITY] Sales Report completed in ${totalLatency}ms (Query: ${queryLatency}ms)`
    );

    res.json({
      success: true,
      priority: 'LOW (20)',
      latencyMs: totalLatency,
      queryLatencyMs: queryLatency,
      rowCount: result.rows.length,
      data: result.rows.map((row) => ({
        department: row.department,
        status: row.status,
        total_orders: row.total_orders,
        total_items: row.total_items,
        total_revenue: row.total_revenue,
        avg_order_value: row.avg_order_value,
      })),
      poolStatus: {
        active: pool.activeCount,
        queued: pool.queue.length,
      },
    });
  } catch (err) {
    console.error('❌ Report query failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Pool Health and Metrics Endpoint
app.get('/api/pool/status', (req, res) => {
  res.json({
    maxConnections: pool.maxConnections,
    activeConnections: pool.activeCount,
    waitingInQueue: pool.queue.length,
    idleConnections: pool.idleCount,
    totalConnections: pool.totalCount,
  });
});

// 4. Interactive Live Demo Web Page
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Company Operations Optimizer | pg-priority-pool</title>
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: #0f172a; color: #f8fafc; margin: 0; padding: 32px 16px; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 8px; color: #38bdf8; display: flex; align-items: center; gap: 10px; }
    p.subtitle { color: #94a3b8; margin-top: 0; margin-bottom: 24px; font-size: 15px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: #1e293b; padding: 18px; border-radius: 12px; border: 1px solid #334155; }
    .stat-label { font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value { font-size: 32px; font-weight: 700; margin-top: 6px; color: #f1f5f9; }
    .stat-value.highlight { color: #38bdf8; }
    .controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 28px; }
    button {
      padding: 16px;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }
    button:active { transform: scale(0.98); }
    .btn-high { background: #10b981; color: white; }
    .btn-high:hover { background: #059669; }
    .btn-low { background: #f59e0b; color: white; }
    .btn-low:hover { background: #d97706; }
    .btn-stress { background: #6366f1; color: white; }
    .btn-stress:hover { background: #4f46e5; }
    button span.sub { font-size: 12px; font-weight: normal; opacity: 0.9; }
    .log-panel { background: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 20px; }
    .log-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .log-title { font-weight: 600; font-size: 16px; }
    .log-clear { background: transparent; border: 1px solid #475569; color: #94a3b8; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; }
    .logs { font-family: monospace; font-size: 13px; max-height: 380px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .log-item { padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
    .log-item.high { background: rgba(16, 185, 129, 0.15); border-left: 4px solid #10b981; }
    .log-item.low { background: rgba(245, 158, 11, 0.15); border-left: 4px solid #f59e0b; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge.high { background: #10b981; color: white; }
    .badge.low { background: #f59e0b; color: white; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚡ Company Operations Optimizer</h1>
    <p class="subtitle">Powered by <strong>pg-priority-pool</strong>. Demonstrates zero-delay floor operations even when heavy batch reports saturate the PostgreSQL pool.</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Max Connections</div>
        <div class="stat-value" id="maxConns">-</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Connections</div>
        <div class="stat-value highlight" id="activeConns">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Waiting in Queue</div>
        <div class="stat-value" id="queuedConns" style="color: #f43f5e;">0</div>
      </div>
    </div>

    <div class="controls">
      <button class="btn-high" onclick="placeOrder()">
        <span>⚡ Place Urgent Order</span>
        <span class="sub">Priority 1 (HIGH) &bull; Target: &lt;50ms</span>
      </button>

      <button class="btn-low" onclick="generateReport()">
        <span>📊 Run Heavy Report</span>
        <span class="sub">Priority 20 (LOW) &bull; Heavy aggregation</span>
      </button>

      <button class="btn-stress" onclick="runCollisionScenario()">
        <span>🚀 Simulate Conflict Scenario</span>
        <span class="sub">5 Heavy Reports + 1 Urgent Order</span>
      </button>
    </div>

    <div class="log-panel">
      <div class="log-header">
        <div class="log-title">Live Transaction Activity Stream</div>
        <button class="log-clear" onclick="clearLogs()">Clear</button>
      </div>
      <div class="logs" id="logs">
        <div style="color: #64748b;">Ready. Trigger an order or run the simulation above...</div>
      </div>
    </div>
  </div>

  <script>
    async function updateStats() {
      try {
        const res = await fetch('/api/pool/status');
        const data = await res.json();
        document.getElementById('maxConns').innerText = data.maxConnections;
        document.getElementById('activeConns').innerText = data.activeConnections;
        document.getElementById('queuedConns').innerText = data.waitingInQueue;
      } catch (e) {}
    }

    setInterval(updateStats, 200);

    function addLog(text, priority, latency) {
      const logs = document.getElementById('logs');
      if (logs.children.length === 1 && logs.children[0].innerText.startsWith('Ready')) {
        logs.innerHTML = '';
      }
      const item = document.createElement('div');
      item.className = 'log-item ' + (priority.includes('HIGH') ? 'high' : 'low');
      item.innerHTML = '<div><span class="badge ' + (priority.includes('HIGH') ? 'high' : 'low') + '">' + priority + '</span> ' + text + '</div><strong>' + latency + 'ms</strong>';
      logs.prepend(item);
    }

    function clearLogs() {
      document.getElementById('logs').innerHTML = '<div style="color: #64748b;">Ready. Trigger an order or run the simulation above...</div>';
    }

    async function placeOrder() {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: 'Floor Operator', total_amount: 145.50 })
      });
      const data = await res.json();
      addLog('Order ' + data.orderNumber + ' inserted successfully!', 'HIGH (1)', data.latencyMs);
    }

    async function generateReport() {
      const res = await fetch('/api/reports/sales-summary');
      const data = await res.json();
      addLog('Daily Sales Summary generated (' + data.rowCount + ' groupings)', 'LOW (20)', data.latencyMs);
    }

    async function runCollisionScenario() {
      addLog('🚀 Dispatched 5 heavy reports to saturate pool...', 'LOW (20)', 0);
      
      // Fire 5 reports
      const reports = [1, 2, 3, 4, 5].map((i) => 
        fetch('/api/reports/sales-summary')
          .then(r => r.json())
          .then(data => addLog('Report #' + i + ' completed', 'LOW (20)', data.latencyMs))
      );

      // Wait 100ms for pool to be 100% saturated
      await new Promise(r => setTimeout(r, 100));

      addLog('⚡ Urgent Order submitted while pool is fully saturated!', 'HIGH (1)', 0);
      
      // Fire urgent order
      const orderPromise = fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: 'VIP Client #999', total_amount: 850.00 })
      })
      .then(r => r.json())
      .then(data => addLog('⚡ Order ' + data.orderNumber + ' jumped queue and executed!', 'HIGH (1)', data.latencyMs));

      await Promise.all([orderPromise, ...reports]);
    }
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`🚀 Company Operations API running on http://localhost:${PORT}`);
  console.log(`📊 Pool Max Connections: ${pool.maxConnections}`);
  console.log(`⚡ High-Priority route: POST /api/orders`);
  console.log(`📑 Low-Priority route:  GET  /api/reports/sales-summary`);
  console.log(`🖥️  Open http://localhost:${PORT} in your browser to view the live dashboard!`);
});

