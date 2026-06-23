// server.js
// Security and actions ledger audit service entrypoint

const express = require('express');
const cors = require('cors');
const auditRoutes = require('./routes/auditRoutes');
const AuditService = require('./services/auditService');
const AuditModel = require('./models/auditModel');
const client = require('prom-client');

const app = express();
app.use(cors());
app.use(express.json());

// Enable default system metrics collection (CPU, Memory, GC metrics)
client.collectDefaultMetrics();

// Liveness probe (must be before path-rewrite middleware)
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'audit-service' }));
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok', service: 'audit-service' }));
app.get('/ready', (req, res) => res.status(200).json({ status: 'ok', service: 'audit-service' }));

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// K8s ALB path prefix compatibility: strip /api/audit prefix
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/audit')) {
    req.url = req.url.replace('/api/audit', '') || '/';
  }
  next();
});

// Mount modular audit endpoints under /audit
app.use('/audit', auditRoutes);

const PORT = process.env.PORT || 3000;

async function start() {
  const pool = AuditModel.getPool();
  let retries = 5;

  while (retries--) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ Connected to Audit database successfully.');
      break;
    } catch (err) {
      console.log(`⏳ Waiting for database… (${retries} retries left) error: ${err.message}`);
      if (retries === 0) {
        console.error('❌ Could not connect to database. Continuing startup to maintain service availability.');
      } else {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  // Start background queue processing loop
  AuditService.startWorker();

  const server = app.listen(PORT, () => {
    console.log(`Audit service running on port ${PORT}`);
  });

  // Graceful shutdown handling to flush active worker logs and terminate database connections
  const shutdown = () => {
    console.log('🛑 Shutting down Audit Service. Cleaning queue worker and DB connections...');
    AuditService.stopWorker();
    
    server.close(() => {
      console.log('HTTP server closed.');
      pool.end(() => {
        console.log('Database pool closed.');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();
