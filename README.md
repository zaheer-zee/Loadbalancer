# ⚡ Company Operations Optimizer (using `pg-priority-pool`)

A real-world reference implementation and live benchmark demonstrating how **`pg-priority-pool`** prevents operational downtime and connection starvation in company ERP, warehouse, and retail systems.

---

## 📌 The Problem in Company Operations

In production company systems (ERP, point-of-sale, warehouse inventory management):

* **Real-time Operations (Floor/Checkout):** Store cashiers, warehouse pickers, and e-commerce checkouts execute fast, latency-sensitive database queries (under 50ms).
* **Back-Office Reporting:** Accountants, managers, and analysts periodically trigger heavy aggregations and data exports (e.g., monthly sales valuations, tax reconciliations) that take several seconds.

### The Default FIFO Failure
In standard `pg.Pool`, all queries wait in a flat **First-In, First-Out** line. When an analyst triggers 3–5 heavy reports:
1. All pool connections are immediately saturated.
2. An urgent floor checkout arrives and is placed **behind** all 5 reports.
3. Floor staff or customers experience 10–20+ second freezes or timeout failures.

---

## 💡 The Solution: `pg-priority-pool`

With **`pg-priority-pool`**, queries are dispatched with explicit priority levels:

* **Urgent Operations:** `Priority 1 (HIGH)`
* **Back-Office Reports:** `Priority 20 (LOW)`

When pool capacity is saturated, the pool's internal priority queue ensures that high-priority operational queries **immediately jump the line** and claim the very next freed connection—preventing operational stall.

---

## 🏗️ Architecture & Endpoints

| Endpoint | Method | Priority | Role | Target Latency |
| :--- | :--- | :--- | :--- | :--- |
| `/api/orders` | `POST` | **`HIGH (1)`** | Creates an urgent customer/floor order | **< 50ms** |
| `/api/reports/sales-summary` | `GET` | **`LOW (20)`** | Heavy department sales & items aggregation | ~1.5s - 3s |
| `/api/pool/status` | `GET` | `SYSTEM` | Real-time connection count & queue depth | Instant |
| `/` | `GET` | UI | Interactive browser dashboard & simulator | - |

---

## 🚀 Quick Start

### 1. Configure Database Connection
Edit `.env` (or use existing defaults):
```env
PORT=3000
PGUSER=postgres
PGPASSWORD=your_password
PGDATABASE=test
PGHOST=localhost
PGPORT=5432
POOL_MAX=3
AGING_INTERVAL_MS=3000
```

### 2. Seed Sample Dataset
Populates 5,000 orders and 15,000 line items:
```bash
npm run seed
```

### 3. Start the Server
```bash
npm start
```
Server runs at [http://localhost:3000](http://localhost:3000).

---

## 📊 Run the Collision Simulation

In a separate terminal, run:
```bash
npm run simulate
```

This script:
1. Sends **5 concurrent heavy reports** (`LOW` priority) to flood the 3-connection pool.
2. Submits **1 urgent order** (`HIGH` priority) into the saturated pool.
3. Prints the execution latency table showing how the urgent order jumped ahead of the queued reports:

```text
===============================================================
🏆 RESULTS: EXECUTION ORDER & LATENCY COMPARISON
===============================================================

┌─────────┬──────────────────────┬───────────────┬───────────────┬─────────────┐
│ (index) │      Task Name       │ Pool Priority │ Total Latency │   Status    │
├─────────┼──────────────────────┼───────────────┼───────────────┼─────────────┤
│    0    │    'URGENT ORDER'    │   'HIGH (1)'  │   '1542 ms'   │ '✅ SUCCESS' │
│    1    │  'SALES REPORT #1'   │   'LOW (20)'  │   '1518 ms'   │ '✅ SUCCESS' │
│    2    │  'SALES REPORT #2'   │   'LOW (20)'  │   '1520 ms'   │ '✅ SUCCESS' │
│    3    │  'SALES REPORT #3'   │   'LOW (20)'  │   '1525 ms'   │ '✅ SUCCESS' │
│    4    │  'SALES REPORT #4'   │   'LOW (20)'  │   '3035 ms'   │ '✅ SUCCESS' │
│    5    │  'SALES REPORT #5'   │   'LOW (20)'  │   '3041 ms'   │ '✅ SUCCESS' │
└─────────┴──────────────────────┴───────────────┴───────────────┴─────────────┘
```
Notice: Reports #4 and #5 had to wait ~3040ms, while the **Urgent Order completed at ~1540ms** (taking the very first available connection slot ahead of Reports #4 and #5)!

---

## 🖥️ Interactive Web Dashboard

Open `http://localhost:3000` to interact with:
* Real-time active connection and queue monitor.
* One-click trigger buttons for urgent orders and reports.
* A 1-click **"Simulate Conflict Scenario"** button with a real-time activity log.

