const attemptModel = require('../models/attempt.model');
const examModel = require('../models/exam.model');
const studentModel = require('../models/student.model');
const examService = require('./exam.service');
const termService = require('./term.service');
const activityService = require('./activity.service');
const TYPES = require('../constants/examTypes');
const { ANSWER_GRACE_MS } = require('../constants');
const { newUid } = require('../utils/uid');
const { forbidden, notFound, conflict, badRequest, unprocessable } = require('../utils/errors');
const { withTransaction } = require('../utils/transaction');
const { fmtDate, hhmm, round2 } = require('../utils/datetime');

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const remainingSeconds = (attempt) => Math.max(0, Math.floor((new Date(attempt.ends_at).getTime() - Date.now()) / 1000));
const timeIsUp = (attempt) => new Date(attempt.ends_at).getTime() + ANSWER_GRACE_MS < Date.now();

async function loadStudent(id) {
  const s = await studentModel.findById(id);
  if (!s) throw notFound('Your account no longer exists.');
  return s;
}

// ---------- the student's exam list (their class arm, current term) ----------
async function available(user) {
  const term = await termService.getCurrentTerm();
  const optional = new Set(await studentModel.enrolledOptionalUids(user.id));
console.log(optional);
  const out = [];
  for (const t of [TYPES.OBJ, TYPES.THEORY]) {
    const [rows, attempts] = await Promise.all([
      examModel.listConfigsForClassArm(t, user.classArmId, term.id),
      attemptModel.statusesFor(user.id, t.type),
    ]);
    const attemptOf = Object.fromEntries(attempts.map((a) => [a.exam_config_id, a.status]));
    for (const row of rows) {
      if (row.subject_kind === 'optional' && !optional.has(row.subject_uid)) continue;
      const exam = examService.shape(row);
      if (exam.status === 'Draft') continue;                       // not ready — hidden from students
      out.push({
        id: exam.id, title: exam.title, type: exam.type, typeLabel: exam.type === 'OBJ' ? 'Objectives' : 'Theory',
        subject: exam.subject, class: exam.class, arm: exam.arm, status: exam.status,
        durationMinutes: exam.durationMinutes, totalQuestions: exam.questionsToDisplay,
        date: exam.date, time: exam.time, startsAt: exam.startsAt, attemptStatus: attemptOf[row.exam_config_id] || 'none',
      });
    }
  }
  return out;
}

// ---------- marking + closing an attempt ----------
async function finalise(conn, attempt, row) {
  if (attempt.status === 'submitted') return;
  if (attempt.exam_type === 'OBJ') {
    const correct = await attemptModel.countCorrect(attempt.id, conn);
    const score = Math.min(Number(row.mark), round2(correct * Number(row.mark_per_question)));
    await attemptModel.upsertObjResult(attempt.student_id, attempt.exam_config_id, score, conn);
  }
  await attemptModel.markSubmitted(attempt.id, conn);
}

async function autoSubmit(attempt, row) {
  await withTransaction((conn) => finalise(conn, attempt, row));
  throw conflict('Your time for this exam has ended and it was submitted automatically.');
}

async function submit(attemptUid, user) {
  return withTransaction(async (conn) => {
    const attempt = await attemptModel.findByUidForStudent(attemptUid, user.id, conn, { lock: true });
    if (!attempt) throw notFound('Attempt not found');
    if (attempt.status === 'submitted') return { submitted: true, alreadySubmitted: true };

    const row = await examModel.findConfigById(TYPES[attempt.exam_type], attempt.exam_config_id, conn);
    await finalise(conn, attempt, row);

    const student = await loadStudent(user.id);
    await activityService.log({
      type: 'result', activity: `${student.first_name} ${student.last_name} submitted "${row.title}"`,
      description: `${row.subject_name} · ${row.full_class_name}`, conn,
    });
    return { submitted: true };
  });
}

// ---------- start / resume ----------
async function attemptPayload(attempt, student) {
  const [answers, uids] = await Promise.all([attemptModel.answersOf(attempt.id), attemptModel.questionUidMap(attempt.id, attempt.exam_type)]);
  const uidOf = Object.fromEntries(uids.map((r) => [r.question_id, r.uid]));
  return {
    id: attempt.uid,
    studentId: student.student_id,
    studentName: `${student.first_name} ${student.last_name}`,
    startedAt: attempt.started_at,
    endsAt: attempt.ends_at,
    remainingSeconds: remainingSeconds(attempt),
    answers: Object.fromEntries(answers.map((a) => [uidOf[a.question_id], a.answer])),
  };
}

async function start(rawExamId, { studentId }, user) {
  const student = await loadStudent(user.id);
  if (studentId.toLowerCase() !== student.student_id.toLowerCase()) throw badRequest('That Student ID does not match your account.');

  const { t, row } = await examService.loadRow(rawExamId);
  if (row.class_arm_id !== student.class_arm_id) throw forbidden('This exam is not for your class.');
  if (row.subject_kind === 'optional' && !(await studentModel.enrolledOptionalUids(student.id)).includes(row.subject_uid)) {
    throw forbidden('You are not registered for this subject.');
  }

  let attempt = await attemptModel.find(student.id, t.type, row.exam_config_id);
  if (attempt?.status === 'submitted') throw conflict('You have already submitted this exam.');

  if (!attempt) {
    const status = examService.computeStatus(row);
    if (status === 'Draft') throw conflict('This exam is not ready yet.');
    if (status === 'Scheduled') throw conflict(`This exam has not started yet. It opens ${fmtDate(row.date_of_exam)} at ${hhmm(row.time_of_exam)}.`);
    if (status === 'Completed') throw conflict('This exam has ended.');

    try {
      await withTransaction(async (conn) => {
        const now = new Date();
        const attemptId = await attemptModel.insert({
          uid: newUid(), studentId: student.id, type: t.type, cfgId: row.exam_config_id,
          startedAt: now, endsAt: new Date(now.getTime() + row.duration * 60000),
        }, conn);
        let ids = await examModel.questionIdsOf(t, row.exam_config_id, conn);
        if (t.type === 'OBJ') ids = shuffle(ids).slice(0, row.question_display);   // each student gets a random subset
        await attemptModel.insertQuestions(attemptId, ids, conn);
        await activityService.log({
          type: 'exam', activity: `${student.first_name} ${student.last_name} started "${row.title}"`,
          description: `${row.subject_name} · ${row.full_class_name}`, conn,
        });
      });
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err;      // double click → fall through and resume
    }
    attempt = await attemptModel.find(student.id, t.type, row.exam_config_id);
  }

  if (timeIsUp(attempt)) await autoSubmit(attempt, row);
  return { attempt: await attemptPayload(attempt, student) };
}

// ---------- the paper (never contains correct answers) ----------
async function paper(rawExamId, user) {
  const student = await loadStudent(user.id);
  const { t, row } = await examService.loadRow(rawExamId);
  if (row.class_arm_id !== student.class_arm_id) throw forbidden('This exam is not for your class.');

  const attempt = await attemptModel.find(student.id, t.type, row.exam_config_id);
  if (!attempt) throw forbidden('Please start the exam from the instructions page first.');
  if (attempt.status === 'submitted') throw conflict('You have already submitted this exam.');
  if (timeIsUp(attempt)) await autoSubmit(attempt, row);

  let questions;
  if (t.type === 'OBJ') {
    questions = (await attemptModel.objPaper(attempt.id)).map((q) => {
      const options = { A: q.option_a, B: q.option_b };
      if (q.option_c) options.C = q.option_c;
      if (q.option_d) options.D = q.option_d;
      return { id: q.uid, text: q.question, passage: q.passage, options };
    });
  } else {
    questions = (await attemptModel.theoryPaper(attempt.id, row.exam_config_id)).map((q) => ({ id: q.uid, text: q.question, marks: q.marks }));
  }

  return {
    exam: {
      id: examService.publicId(t.type, row.uid), title: row.title, type: t.type, subject: row.subject_name,
      class: row.class_name, arm: row.arm_name, durationMinutes: row.duration, instructions: row.instructions || '',
      trueOrFalse: !!row.true_or_false, allowFileUpload: false, questions,
    },
    attempt: await attemptPayload(attempt, student),
  };
}

// ---------- save an answer (every click / pause in typing) ----------
async function saveAnswer(attemptUid, { questionId, answer }, user) {
  const attempt = await attemptModel.findByUidForStudent(attemptUid, user.id);
  if (!attempt) throw notFound('Attempt not found');
  if (attempt.status === 'submitted') throw conflict('This exam has already been submitted.');
  if (timeIsUp(attempt)) throw conflict('Time is up for this exam.');

  const table = attempt.exam_type === 'OBJ' ? 'obj_questions' : 'theory_questions';
  const qId = await attemptModel.findQuestionInAttempt(table, attempt.id, questionId);
  if (!qId) throw notFound('That question is not part of your exam.');

  let value = answer;
  if (attempt.exam_type === 'OBJ') {
    value = answer.trim().toUpperCase();
    if (value && !['A', 'B', 'C', 'D'].includes(value)) throw unprocessable('Answer must be A, B, C or D');
  }
  if (!value.trim()) await attemptModel.deleteAnswer(attempt.id, qId);
  else await attemptModel.upsertAnswer(attempt.id, qId, value);
  return { saved: true, remainingSeconds: remainingSeconds(attempt) };
}

module.exports = { available, start, paper, saveAnswer, submit };
