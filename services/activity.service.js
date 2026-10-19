const activityModel = require('../models/activity.model');
const { dayLabel, timeAgo } = require('../utils/datetime');

/**
 * Record an action. Never throws — an audit-log failure must not break the real action.
 * Pass `conn` to log inside an open transaction.
 */
async function log({ adminId = null, type = 'general', activity, description = null, conn = null }) {
  if (!activity || !String(activity).trim()) return;
  try {
    await activityModel.insert({ adminId, type, activity: String(activity).trim(), description }, conn);
  } catch (err) {
    console.error('Activity log failed:', err.message);
  }
}

const shape = (row) => ({
  id: row.id,
  type: row.type,
  title: row.activity,
  description: row.description || (row.admin_name ? `By ${row.admin_name}` : ''),
  time: timeAgo(row.created_at),
  date: dayLabel(row.created_at),
  createdAt: row.created_at,
});

async function list({ adminId = null, limit = 30, offset = 0 } = {}) {
  const [rows, total] = await Promise.all([
    activityModel.list({ adminId, limit, offset }),
    activityModel.count(adminId),
  ]);
  return { activities: rows.map(shape), total, hasMore: offset + rows.length < total };
}

module.exports = { log, list };
