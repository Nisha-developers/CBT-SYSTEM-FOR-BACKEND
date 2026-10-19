const adminService = require('../services/admin.service');
const { ok, created, message } = require('../utils/response');

const list = async (req, res) => ok(res, { admins: await adminService.list() });
const create = async (req, res) => created(res, { admin: await adminService.create(req.valid.body, req.user) });
const update = async (req, res) => ok(res, { admin: await adminService.update(req.valid.params.id, req.valid.body, req.user) });
const remove = async (req, res) => {
  await adminService.remove(req.valid.params.id, req.user);
  return message(res, 'Admin removed');
};

module.exports = { list, create, update, remove };
