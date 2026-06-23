// auditModel.js
// Data layer for Audit Service PostgreSQL operations

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const AuditModel = {
  /**
   * Performs bulk insertion of multiple audit events in a single SQL query.
   * Parameterized to prevent SQL Injection.
   * @param {Array} events 
   * @returns {Promise<Array>}
   */
  async bulkInsert(events) {
    if (!events || events.length === 0) return [];
    
    const client = await pool.connect();
    try {
      const valueClauses = [];
      const values = [];
      let paramIndex = 1;

      for (const event of events) {
        valueClauses.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8})`);
        values.push(
          event.actorId || null,
          event.actorEmail || null,
          event.actorRole || null,
          event.action,
          event.resource,
          event.resourceId || null,
          event.metadata ? JSON.stringify(event.metadata) : null,
          event.ipAddress || null,
          event.userAgent || null
        );
        paramIndex += 9;
      }

      const query = `
        INSERT INTO audit_events 
          (actor_id, actor_email, actor_role, action, resource, resource_id, metadata, ip_address, user_agent)
        VALUES 
          ${valueClauses.join(', ')}
        RETURNING *`;
      
      const res = await client.query(query, values);
      return res.rows;
    } finally {
      client.release();
    }
  },

  /**
   * Returns a single audit event by UUID.
   * @param {String} id 
   * @returns {Promise<Object>}
   */
  async getById(id) {
    const res = await pool.query('SELECT * FROM audit_events WHERE id = $1', [id]);
    return res.rows[0];
  },

  /**
   * Searches and filters events with pagination support.
   * @param {Object} filters 
   * @returns {Promise<Object>}
   */
  async search(filters) {
    const { actorId, actorRole, action, resource, startDate, endDate } = filters;
    const page = parseInt(filters.page || 1, 10);
    const limit = parseInt(filters.limit || 10, 10);
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const values = [];
    let paramIndex = 1;

    if (actorId) {
      whereClauses.push(`actor_id = $${paramIndex}`);
      values.push(actorId);
      paramIndex++;
    }
    if (actorRole) {
      whereClauses.push(`actor_role = $${paramIndex}`);
      values.push(actorRole);
      paramIndex++;
    }
    if (action) {
      whereClauses.push(`action = $${paramIndex}`);
      values.push(action);
      paramIndex++;
    }
    if (resource) {
      whereClauses.push(`resource = $${paramIndex}`);
      values.push(resource);
      paramIndex++;
    }
    if (startDate) {
      whereClauses.push(`created_at >= $${paramIndex}`);
      values.push(new Date(startDate));
      paramIndex++;
    }
    if (endDate) {
      whereClauses.push(`created_at <= $${paramIndex}`);
      values.push(new Date(endDate));
      paramIndex++;
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count total items
    const countQuery = `SELECT COUNT(*) FROM audit_events ${whereString}`;
    const countRes = await pool.query(countQuery, values);
    const total = parseInt(countRes.rows[0].count, 10);

    // Retrieve limited items ordered by time
    const dataQuery = `
      SELECT * FROM audit_events 
      ${whereString} 
      ORDER BY created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    
    const dataRes = await pool.query(dataQuery, [...values, limit, offset]);

    return {
      events: dataRes.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  getPool() {
    return pool;
  }
};

module.exports = AuditModel;
