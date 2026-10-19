const examModel = require('../models/exam.model');
const schoolModel = require('../models/school.model');
const termService = require('./term.service');
const activityService = require('./activity.service');
const TYPES = require('../constants/examTypes');
const { EXAM_PASS_RATIO } = require('../constants');
const { newUid } = require('../utils/uid');
const { badRequest, notFound, conflict, unprocessable } = require('../utils/errors');
const { withTransaction } = require('../utils/transaction');
const { fmtDate, hhmm, schoolInstant, round2 } = require('../utils/datetime');
const V = require('../validations/exam.validation');

// ---------- public exam id: "obj-<uid>" / "theory-<uid>" ----------
const publicId = (type, uid) => `${TYPES[type].slug}-${uid}`;

function parseExamId(raw) {
  const m = /^(obj|theory)-(.+)$/i.exec(String(raw));
  if (!m) throw notFound('Exam not found');
  return { t: TYPES[m[1].toUpperCase()], uid: m[2].toLowerCase() };
}

// ---------- status ----------
const examStart = (row) => schoolInstant(row.date_of_exam, row.time_of_exam);
// Late arrivals may still begin until the scheduled window has ended.
const examWindowEnd = (row) => new Date(examStart(row).getTime() + row.duration * 60000);
const requiredQuestions = (row) => (row.exam_type === 'OBJ' ? row.question_display : row.total_question_set);

function computeStatus(row, now = new Date()) {
  if (row.uploaded < requiredQuestions(row)) return 'Draft';
  if (row.open_exam) return 'Active';
  if (now < examStart(row)) return 'Scheduled';
  if (now <= examWindowEnd(row)) return 'Active';
  return 'Completed';
}

function shape(row) {
  return {
    id: publicId(row.exam_type, row.uid),
    type: row.exam_type,
    title: row.title,
    subject: row.subject_name,
    subjectId: row.subject_uid,
    subjectKind: row.subject_kind,
    class: row.class_name,
    arm: row.arm_name,
    classArmId: row.class_arm_uid,
    fullClassName: row.full_class_name,
    status: computeStatus(row),
    totalQuestions: row.total_question_set,
    questionsToDisplay: row.exam_type === 'OBJ' ? row.question_display : row.total_question_set,
    uploadedQuestions: row.uploaded,
    markPerQuestion: row.mark_per_question,
    durationMinutes: row.duration,
    duration: `${row.duration} mins`,
    totalMarks: row.mark,
    passMark: row.pass_mark,
    date: fmtDate(row.date_of_exam),
    dateISO: row.date_of_exam,
    time: hhmm(row.time_of_exam),
    createdAt: fmtDate(new Date(row.created_at).toISOString().slice(0, 10)),
    passage: !!row.passage,
    trueOrFalse: !!row.true_or_false,
    openExam: !!row.open_exam,
    instructions: row.instructions || '',
    session: row.session_name,
    term: row.term_name,
    hasAttempts: row.attempts > 0,
    startsAt: examStart(row).toISOString(),
    endsAt: examWindowEnd(row).toISOString(),
  };
}

async function loadRow(rawId, conn) {
  const { t, uid } = parseExamId(rawId);
  const row = await examModel.findConfigByUid(t, uid, conn);
  if (!row) throw notFound('Exam not found');
  return { t, row };
}

// ---------- list / get / create ----------
async function list({ type, term }) {
  const types = type ? [TYPES[type]] : [TYPES.OBJ, TYPES.THEORY];
  const termId = term === 'current' ? (await termService.getCurrentTerm()).id : null;
  const rows = (await Promise.all(types.map((t) => examModel.listConfigs(t, termId)))).flat();
  return rows.map(shape);
}

async function getForAdmin(rawId) {
  const { row } = await loadRow(rawId);
  return { ...shape(row), questions: await listQuestions(rawId) };
}

async function create(input, actor) {
  const t = TYPES[input.type];
  const classArm = await examModel.findClassArmByUid(input.classArmId);
  if (!classArm) throw badRequest('That class/arm does not exist.');
  const subjectId = await examModel.findSubjectIdByUid(input.subjectKind, input.subjectId);
  if (!subjectId) throw badRequest('That subject does not exist.');
  if (!(await schoolModel.isSubjectOffered(input.subjectKind, subjectId, classArm.class_arm_id))) {
    throw badRequest(`That subject is not offered in ${classArm.full_class_name}.`);
  }

  const term = await termService.getCurrentTerm();
  const counted = input.type === 'OBJ' ? input.questionsToDisplay : input.totalQuestions;
  const mark = round2(counted * input.markPerQuestion);
  const uid = newUid();

  try {
    await examModel.insertConfig(t, {
      uid, ...input, instructions: input.instructions || null, mark, passMark: round2(Math.ceil(mark * EXAM_PASS_RATIO * 100) / 100),
      subjectId, classArmId: classArm.class_arm_id, termId: term.id, createdBy: actor.id,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict(`A ${input.type === 'OBJ' ? 'objective' : 'theory'} exam for this subject and class already exists this term.`);
    throw err;
  }

  const row = await examModel.findConfigByUid(t, uid);
  await activityService.log({
    adminId: actor.id, type: 'exam',
    activity: `Created ${input.type === 'OBJ' ? 'an objective' : 'a theory'} exam "${input.title}"`,
    description: `${row.subject_name} · ${classArm.full_class_name}`,
  });
  return shape(row);
}

async function setOpen(rawId, open, actor) {
  const { t, row } = await loadRow(rawId);
  await examModel.setOpen(t, row.exam_config_id, open);
  await activityService.log({
    adminId: actor.id, type: 'exam', activity: `${open ? 'Opened' : 'Closed'} exam "${row.title}"`,
    description: `${row.subject_name} · ${row.full_class_name}`,
  });
  return shape((await loadRow(rawId)).row);
}

async function remove(rawId, actor) {
  const { t, row } = await loadRow(rawId);
  if (row.attempts > 0) throw conflict('Students have already started this exam, so it cannot be deleted.');
  await withTransaction(async (conn) => {
    // question-bank rows belong to the exam they were created for
    const questionIds = await examModel.questionIdsOf(t, row.exam_config_id, conn);
    await examModel.removeConfig(t, row.exam_config_id, conn);
    await examModel.removeQuestions(t, questionIds, conn);
  });
  await activityService.log({ adminId: actor.id, type: 'exam', activity: `Deleted exam "${row.title}"` });
}

// ---------- questions ----------
async function listQuestions(rawId) {
  const { t, row } = await loadRow(rawId);
  if (t.type === 'OBJ') {
    return (await examModel.listObjQuestions(row.exam_config_id)).map((q) => ({
      id: q.uid, text: q.question, passage: q.passage,
      options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }, correctOption: q.correct_option,
    }));
  }
  return (await examModel.listTheoryQuestions(row.exam_config_id)).map((q) => ({ id: q.uid, text: q.question, marks: q.marks }));
}

// Validate one raw question for this exam, rejecting nonsense before anything is stored.
function checkQuestion(raw, t, row) {
  const parsed = t.type === 'THEORY'
    ? V.theoryQuestion.safeParse({ text: raw.text ?? raw.question })
    : V.objQuestion.safeParse({ text: raw.text ?? raw.question, passage: raw.passage ?? null, options: raw.options || {}, correctOption: raw.correctOption ?? raw.correct ?? '' });
  if (!parsed.success) throw unprocessable(parsed.error.issues[0].message);
  const q = parsed.data;
  if (t.type === 'OBJ') {
    const needed = row.true_or_false ? ['A', 'B'] : ['A', 'B', 'C', 'D'];
    for (const k of needed) if (!q.options[k]) throw unprocessable(`Option ${k} is required`);
    if (!needed.includes(q.correctOption)) throw unprocessable(`Correct option must be one of ${needed.join(', ')}`);
    if (!row.passage) q.passage = null;
  }
  return q;
}

async function addQuestions(rawId, list, actor) {
  const { t, row } = await loadRow(rawId);
  if (row.attempts > 0) throw conflict('Students have already started this exam, so its questions are locked.');
  if (!list.length) throw unprocessable('No questions supplied');
  const room = row.total_question_set - row.uploaded;
  if (list.length > room) {
    throw conflict(room > 0
      ? `This exam only has room for ${room} more question${room === 1 ? '' : 's'} (total set: ${row.total_question_set}).`
      : `All ${row.total_question_set} questions have already been added.`);
  }
  const questions = list.map((raw) => checkQuestion(raw, t, row));   // validate everything first

  await withTransaction(async (conn) => {
    const classArm = await examModel.findClassArmByUid(row.class_arm_uid, conn);
    const common = { subjectKind: row.subject_kind, subjectId: row.subject_id, classId: classArm.class_id };
    for (const q of questions) {
      if (t.type === 'OBJ') {
        const id = await examModel.insertObjQuestion({ uid: newUid(), ...q, ...common }, conn);
        await examModel.linkObjQuestion(row.exam_config_id, id, conn);
      } else {
        const id = await examModel.insertTheoryQuestion({ uid: newUid(), text: q.text, ...common }, conn);
        await examModel.linkTheoryQuestion(row.exam_config_id, id, row.mark_per_question, conn);
      }
    }
    await activityService.log({
      adminId: actor.id, type: 'exam',
      activity: `Added ${questions.length} question${questions.length === 1 ? '' : 's'} to "${row.title}"`,
      description: `${row.subject_name} · ${row.full_class_name}`, conn,
    });
  });
  return { questions: await listQuestions(rawId), total: row.total_question_set };
}

async function removeQuestion(rawId, questionUid) {
  const { t, row } = await loadRow(rawId);
  if (row.attempts > 0) throw conflict('Students have already started this exam, so its questions are locked.');
  const questionId = await examModel.findQuestionInExam(t, row.exam_config_id, questionUid);
  if (!questionId) throw notFound('Question not found in this exam');
  await examModel.removeQuestion(t, questionId);
}

module.exports = {
  publicId, parseExamId, loadRow, shape, computeStatus, examStart, examWindowEnd, list, getForAdmin, create,
  setOpen, remove, listQuestions, addQuestions, removeQuestion,
};
