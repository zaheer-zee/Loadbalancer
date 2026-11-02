const http = require('http');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

function postOrder(name, amount) {
  const start = Date.now();
  return fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_name: name, total_amount: amount }),
  })
    .then((r) => r.json())
    .then((data) => ({
      type: 'URGENT ORDER',
      priority: 'HIGH (1)',
      orderNumber: data.orderNumber,
      latency: Date.now() - start,
      success: data.success,
    }))
    .catch((err) => ({
      type: 'URGENT ORDER',
      priority: 'HIGH (1)',
      error: err.message,
      latency: Date.now() - start,
    }));
}

function fetchReport(id) {
  const start = Date.now();
  return fetch(`${BASE_URL}/api/reports/sales-summary?sleep=1.5`)
    .then((r) => r.json())
    .then((data) => ({
      type: `SALES REPORT #${id}`,
      priority: 'LOW (20)',
      latency: Date.now() - start,
      rowCount: data.rowCount,
      success: data.success,
    }))
    .catch((err) => ({
      type: `SALES REPORT #${id}`,
      priority: 'LOW (20)',
      error: err.message,
      latency: Date.now() - start,
    }));
}

async function runSimulation() {
  console.log('===============================================================');
  console.log('⚡ SIMULATING ENTERPRISE ORDER BOTTLENECK & PRIORITY RESOLUTION');
  console.log('===============================================================');
  console.log(`Connecting to API at ${BASE_URL}...\n`);

  // Check health
  try {
    const health = await fetch(`${BASE_URL}/api/pool/status`).then((r) => r.json());
    console.log(`📊 Pool Config: Max Connections = ${health.maxConnections}`);
  } catch (e) {
    console.error('❌ Server not responding at', BASE_URL);
    console.error('👉 Please start the server first with: npm start');
    process.exit(1);
  }

  console.log('\n[T+000ms] 🌊 Step 1: Disagreeable spike of 5 heavy back-office reports launched...');
  const reportPromises = [
    fetchReport(1),
    fetchReport(2),
    fetchReport(3),
    fetchReport(4),
    fetchReport(5),
  ];

  // Give 100ms for requests to hit server and monopolize the 3 connections
  await new Promise((resolve) => setTimeout(resolve, 100));

  const poolMid = await fetch(`${BASE_URL}/api/pool/status`).then((r) => r.json());
  console.log(
    `[T+100ms] 🔒 Pool Saturated! Active Connections: ${poolMid.activeConnections}/${poolMid.maxConnections}, Waiting in Queue: ${poolMid.waitingInQueue}`
  );

  console.log(
    '[T+120ms] ⚡ Step 2: Floor worker places an URGENT customer order (Priority 1)...'
  );
  const orderPromise = postOrder('VIP Factory Line 4', 1250.0);

  // Await results
  const results = await Promise.all([orderPromise, ...reportPromises]);

  console.log('\n===============================================================');
  console.log('🏆 RESULTS: EXECUTION ORDER & LATENCY COMPARISON');
  console.log('===============================================================\n');

  console.table(
    results.map((r) => ({
      'Task Name': r.type,
      'Pool Priority': r.priority,
      'Total Latency': `${r.latency} ms`,
      'Status': r.success ? '✅ SUCCESS' : '❌ FAILED',
    }))
  );

  const orderResult = results[0];
  const reportResults = results.slice(1);
  const avgReportLatency = Math.round(
    reportResults.reduce((a, b) => a + b.latency, 0) / reportResults.length
  );

  console.log('---------------------------------------------------------------');
  console.log(`⚡ Urgent Order Latency:       ${orderResult.latency} ms`);
  console.log(`📊 Avg Report Batch Latency:   ${avgReportLatency} ms`);
  console.log('---------------------------------------------------------------');

  if (orderResult.latency < avgReportLatency) {
    console.log(
      '🎉 SUCCESS: The Urgent Order successfully jumped ahead of the queued reports!'
    );
    console.log(
      'Without pg-priority-pool (standard FIFO), the order would have waited for all'
    );
    console.log(
      'preceding reports to finish (~3000ms - 4500ms).'
    );
  } else {
    console.log('Notice: Timing did not show priority jump.');
  }

  console.log('===============================================================\n');
}

runSimulation();

