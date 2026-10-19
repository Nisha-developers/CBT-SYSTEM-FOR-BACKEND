const examService = require('../services/exam.service');
const attemptService = require('../services/attempt.service');
const importService = require('../services/questionImport.service');
const { ok, created, message } = require('../utils/response');

// ---- admin ----
const list = async (req, res) => ok(res, { exams: await examService.list(req.valid.query) });
const create = async (req, res) => created(res, { exam: await examService.create(req.valid.body, req.user) });
const getForAdmin = async (req, res) => ok(res, { exam: await examService.getForAdmin(req.valid.params.id) });
const setOpen = async (req, res) => ok(res, { exam: await examService.setOpen(req.valid.params.id, req.valid.body.open, req.user) });
const remove = async (req, res) => {
  await examService.remove(req.valid.params.id, req.user);
  return message(res, 'Exam deleted');
};
const listQuestions = async (req, res) => ok(res, { questions: await examService.listQuestions(req.valid.params.id) });
const addQuestion = async (req, res) => created(res, await examService.addQuestions(req.valid.params.id, [req.valid.body], req.user));
const removeQuestion = async (req, res) => {
  await examService.removeQuestion(req.valid.params.id, req.valid.params.questionId);
  return message(res, 'Question removed');
};
const importPreview = async (req, res) => ok(res, await importService.previewImport(req.valid.params.id, req.file));
const importConfirm = async (req, res) => created(res, await examService.addQuestions(req.valid.params.id, req.valid.body.questions, req.user));

// ---- student ----
const available = async (req, res) => {ok(res, { exams: await attemptService.available(req.user), studentId: req.params })
};
const start = async (req, res) =>{ 
  ok(res, await attemptService.start(req.valid.params.id, req.valid.body, req.user))
};
const paper = async (req, res) => ok(res, await attemptService.paper(req.valid.params.id, req.user));
const saveAnswer = async (req, res) => ok(res, await attemptService.saveAnswer(req.valid.params.attemptId, req.valid.body, req.user));
const submit = async (req, res) => ok(res, await attemptService.submit(req.valid.params.attemptId, req.user));

module.exports = {
  list, create, getForAdmin, setOpen, remove, listQuestions, addQuestion, removeQuestion, importPreview, importConfirm,
  available, start, paper, saveAnswer, submit,
};
