const studentService = require('../services/student.service');
const { ok, created, message } = require('../utils/response');

const list = async (req, res) => ok(res, await studentService.list(req.valid.query));
const get = async (req, res) => ok(res, { student: await studentService.getOne(req.valid.params.id) });
const create = async (req, res) => created(res, { student: await studentService.create(req.valid.body, req.user) });
const update = async (req, res) => ok(res, { student: await studentService.update(req.valid.params.id, req.valid.body, req.user) });
const remove = async (req, res) => {
  await studentService.remove(req.valid.params.id, req.user);
  return message(res, 'Student removed');
};
const resetPassword = async (req, res) => {
  await studentService.resetPassword(req.valid.params.id, req.user);
  return message(res, "Password reset to the student's last name");
};

module.exports = { list, get, create, update, remove, resetPassword };
