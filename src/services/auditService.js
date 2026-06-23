// auditService.js
// In-memory queue manager and background worker for Audit logs persistence

const AuditModel = require('../models/auditModel');
const client = require('prom-client');

// Enterprise Max Queue Capacity and Flush Limits
const MAX_QUEUE_SIZE = 10000;
const FLUSH_THRESHOLD = 100;
const FLUSH_INTERVAL = 5000; // 5 seconds

// Initialize Prometheus Metrics
const receivedCounter = new client.Counter({
  name: 'audit_events_received_total',
  help: 'Total number of audit events received by the service'
});

const persistedCounter = new client.Counter({
  name: 'audit_events_persisted_total',
  help: 'Total number of audit events successfully persisted to PostgreSQL'
});

const failedCounter = new client.Counter({
  name: 'audit_events_failed_total',
  help: 'Total number of audit events that failed to persist'
});

const droppedCounter = new client.Counter({
  name: 'audit_events_dropped_total',
  help: 'Total number of audit events dropped due to queue overflow'
});

const searchRequestsCounter = new client.Counter({
  name: 'audit_search_requests_total',
  help: 'Total number of audit log search/read operations executed'
});

const queueDepthGauge = new client.Gauge({
  name: 'audit_queue_depth',
  help: 'Current depth of the in-memory audit log event ingestion queue'
});

let queue = [];
let workerIntervalId = null;
let isFlushing = false;

const AuditService = {
  /**
   * Enqueues an incoming audit event to the in-memory queue.
   * If the queue reaches capacity, events are dropped to prioritize availability.
   * Flushes immediately if queue hits 100 events.
   * @param {Object} event 
   * @returns {Boolean} - Whether the event was enqueued
   */
  enqueue(event) {
    receivedCounter.inc();

    if (queue.length >= MAX_QUEUE_SIZE) {
      droppedCounter.inc();
      console.warn(`[AUDIT QUEUE WARNING] Queue capacity reached (${MAX_QUEUE_SIZE}). Dropping incoming audit event for action: ${event.action}`);
      return false;
    }

    queue.push(event);
    queueDepthGauge.set(queue.length);

    // Flush immediately if we hit threshold limit
    if (queue.length >= FLUSH_THRESHOLD) {
      this.flushQueue();
    }

    return true;
  },

  /**
   * Flushes and processes the current batch of enqueued logs.
   * Persists them to PostgreSQL using bulk insert.
   */
  async flushQueue() {
    if (isFlushing || queue.length === 0) return;
    
    isFlushing = true;
    const batch = [...queue];
    queue = []; // Reset queue
    queueDepthGauge.set(0);

    try {
      console.log(`[AUDIT QUEUE WORKER] Flushing ${batch.length} audit events to PostgreSQL...`);
      await AuditModel.bulkInsert(batch);
      persistedCounter.inc(batch.length);
      console.log(`[AUDIT QUEUE WORKER] Successfully persisted ${batch.length} audit events.`);
    } catch (err) {
      failedCounter.inc(batch.length);
      console.error(`[AUDIT QUEUE WORKER ERROR] Failed to persist batch of ${batch.length} audit events:`, err.message);
    } finally {
      isFlushing = false;
    }
  },

  /**
   * Starts the background interval worker.
   */
  startWorker() {
    if (workerIntervalId) return;
    console.log(`[AUDIT WORKER] Starting queue worker loop (interval: ${FLUSH_INTERVAL}ms)...`);
    workerIntervalId = setInterval(() => {
      this.flushQueue();
    }, FLUSH_INTERVAL);
  },

  /**
   * Stops the worker cleanly.
   */
  stopWorker() {
    if (workerIntervalId) {
      clearInterval(workerIntervalId);
      workerIntervalId = null;
    }
  },

  getQueueStats() {
    return {
      queueDepth: queue.length,
      maxQueueSize: MAX_QUEUE_SIZE,
      flushThreshold: FLUSH_THRESHOLD,
      isFlushing
    };
  },

  // Expose counters to make it easily accessible
  metrics: {
    receivedCounter,
    persistedCounter,
    failedCounter,
    droppedCounter,
    searchRequestsCounter,
    queueDepthGauge
  }
};

module.exports = AuditService;
