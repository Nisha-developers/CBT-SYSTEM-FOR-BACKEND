const schoolService = require('../services/school.service');
const termService = require('../services/term.service');
const { ok, created, message } = require('../utils/response');

const exists = async (req, res) => ok(res, await schoolService.status());
const publicInfo = async (req, res) => ok(res, { school: await schoolService.publicInfo() });
const setup = async (req, res) => created(res, { message: 'School setup created successfully', data: await schoolService.createSetup(req.valid.body) });
const get = async (req, res) => ok(res, { data: await schoolService.getSetup() });
const update = async (req, res) => {
  const { changes } = await schoolService.updateSetup(req.valid.body, req.user);
  return ok(res, { message: 'School information updated successfully', changes });
};
const remove = async (req, res) => {
  await schoolService.deleteSchool(req.valid.body.confirm, req.user);
  return message(res, 'School deleted. The system has been reset.');
};

// One handler per (verb, thing) — the thing is fixed in the route table.
const renameOf = (what) => async (req, res) =>
  ok(res, { message: 'Updated successfully', ...(await schoolService.rename(what, req.valid.params.id, req.valid.body.name, req.user)) });
const deleterOf = (fn) => async (req, res) =>
  ok(res, { message: 'Deleted successfully', ...(await fn(req.valid.params.id, req.user)) });

const academicTerms = async (req, res) => {
  const [sessions, current] = await Promise.all([termService.listSessions(), termService.getCurrentTerm()]);
  return ok(res, { sessions, current });
};
const setAcademicTerm = async (req, res) =>
  ok(res, { message: 'Current term updated', current: await schoolService.setAcademicTerm(req.valid.body, req.user) });

module.exports = {
  exists, publicInfo, setup, get, update, remove, academicTerms, setAcademicTerm,
  renameClass: renameOf('class'), renameArm: renameOf('arm'), renameSubject: renameOf('subject'), renameOptional: renameOf('optional'),
  deleteClass: deleterOf(schoolService.deleteClass), deleteArm: deleterOf(schoolService.deleteArm),
  deleteClassArm: deleterOf(schoolService.deleteClassArm),
  deleteSubject: deleterOf((id, u) => schoolService.deleteSubject('compulsory', id, u)),
  deleteOptional: deleterOf((id, u) => schoolService.deleteSubject('optional', id, u)),
};
