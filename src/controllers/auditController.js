// auditController.js
// Controllers for enqueuing and searching audit log entries

const AuditModel = require('../models/auditModel');
const AuditService = require('../services/auditService');

const createEvent = async (req, res) => {
  try {
    const { 
      actorId, actorEmail, actorRole, action, resource, resourceId, metadata, ipAddress, userAgent 
    } = req.body;

    // Use JWT user values if authenticated via a real user token, fallback to body values.
    // Requests authenticated via the internal system token get a synthetic SYSTEM req.user
    // (see authenticateAudit) which must not override the real actor passed in the body.
    const isSystemCall = req.user?.role === 'SYSTEM';
    const actor_id = (!isSystemCall && (req.user?.userId || req.user?.id)) || actorId || 'SYSTEM';
    const actor_email = (!isSystemCall && req.user?.email) || actorEmail || 'system@elderpinq.com';
    const actor_role = (!isSystemCall && req.user?.role) || actorRole || 'SYSTEM';

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const clientUserAgent = req.headers['user-agent'];

    const event = {
      actorId: actor_id,
      actorEmail: actor_email,
      actorRole: actor_role,
      action,
      resource,
      resourceId: resourceId || null,
      metadata: metadata || {},
      ipAddress: ipAddress || clientIp || null,
      userAgent: userAgent || clientUserAgent || null
    };

    const enqueued = AuditService.enqueue(event);
    if (!enqueued) {
      return res.status(503).json({ error: 'Audit log buffer is saturated. Event dropped.' });
    }

    res.status(202).json({ status: 'Accepted', message: 'Audit event queued successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await AuditModel.getById(id);
    if (!event) {
      return res.status(404).json({ error: 'Audit event not found' });
    }
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const listEvents = async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 10, 10);
    const result = await AuditModel.search({ page, limit });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const searchEvents = async (req, res) => {
  try {
    // Increment Prometheus counter
    AuditService.metrics.searchRequestsCounter.inc();

    const { actorId, actorRole, action, resource, startDate, endDate, page, limit } = req.query;
    const result = await AuditModel.search({
      actorId,
      actorRole,
      action,
      resource,
      startDate,
      endDate,
      page,
      limit
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createEvent,
  getEventById,
  listEvents,
  searchEvents
};
