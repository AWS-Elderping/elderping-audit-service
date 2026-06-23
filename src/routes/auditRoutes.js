// auditRoutes.js
// Express Router definitions for Audit Service endpoints

const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticate, requirePermission } = require('../../shared/auth');
const { validateAuditPayload } = require('../validation/auditValidation');

/**
 * Middleware to support both standard JWT tokens and internal microservice Bearer tokens.
 * Authorizes the request as SYSTEM user if token matches AUDIT_SERVICE_TOKEN.
 */
const authenticateAudit = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const systemToken = process.env.AUDIT_SERVICE_TOKEN;

  if (systemToken && token === systemToken) {
    req.user = {
      id: 'SYSTEM',
      userId: 'SYSTEM',
      role: 'SYSTEM',
      email: 'system@elderpinq.com'
    };
    return next();
  }

  // Fallback to standard platform JWT verification
  authenticate(req, res, next);
};

// Ingestion API (Authenticated users or internal microservices)
router.post('/', authenticateAudit, validateAuditPayload, auditController.createEvent);

// Query APIs (Restricted to roles with AUDIT_READ permission: ADMIN & SUPER_ADMIN)
router.get('/', authenticate, requirePermission('AUDIT_READ'), auditController.listEvents);
router.get('/search', authenticate, requirePermission('AUDIT_READ'), auditController.searchEvents);
router.get('/:id', authenticate, requirePermission('AUDIT_READ'), auditController.getEventById);

module.exports = router;
