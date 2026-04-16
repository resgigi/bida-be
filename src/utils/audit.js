const prisma = require('../config/database');

async function logAction(userId, action, entity, entityId = '', details = {}) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, entity, entityId: String(entityId), details: JSON.stringify(details) },
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { logAction };
