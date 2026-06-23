// auditValidation.js
// Validation rules for Audit Service inputs

const validateAuditPayload = (req, res, next) => {
  const { action, resource } = req.body;

  if (!action || typeof action !== 'string' || action.trim() === '') {
    return res.status(400).json({ error: "Validation failed: 'action' is required and must be a non-empty string" });
  }

  if (!resource || typeof resource !== 'string' || resource.trim() === '') {
    return res.status(400).json({ error: "Validation failed: 'resource' is required and must be a non-empty string" });
  }

  next();
};

module.exports = {
  validateAuditPayload
};
