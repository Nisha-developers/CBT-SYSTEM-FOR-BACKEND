const dashboardService = require('../services/dashboard.service');
const activityService = require('../services/activity.service');
const { ok } = require('../utils/response');

const overview = async (req, res) => ok(res, await dashboardService.overview());
const activities = async (req, res) => ok(res, await activityService.list(req.valid.query));

module.exports = { overview, activities };
