const resultModel = require('../models/result.model');
const studentModel = require('../models/student.model');
const examService = require('./exam.service');
const termService = require('./term.service');
const activityService = require('./activity.service');
const TYPES = require('../constants/examTypes');
const { PASS_AVERAGE, SIX_SESSIONS, TERM_NAMES } = require('../constants');
const { badRequest, notFound } = require('../utils/errors');
const { round1, round2 } = require('../utils/datetime');

// ---------- core: one class arm, one term ----------
// subject total = OBJ + theory;  average = mean of each subject's percentage
async function termScores(classArmId, termId) {
  const students = await studentModel.findByClassArm(classArmId);
  if (!students.length) return { students: [], subjects: [], totalStudents: 0 };

  const enrolled = new Set((await studentModel.enrolledPairs(students.map((s) => s.id))).map((p) => `${p.student_id}:${p.optional_subject_id}`));

  const configs = [];
  const scores = {};
  for (const t of [TYPES.OBJ, TYPES.THEORY]) {
    const [cfgs, res] = await Promise.all([resultModel.examConfigsFor(t, classArmId, termId), resultModel.scoresFor(t, classArmId, termId)]);
    cfgs.forEach((c) => configs.push({
      type: t.type, id: c.exam_config_id, key: `${c.subject_kind}:${c.subject_id}`, name: c.name,
      kind: c.subject_kind, subjectId: c.subject_id, mark: Number(c.mark),
    }));
    res.forEach((r) => { scores[`${t.type}:${r.exam_config_id}:${r.student_id}`] = Number(r.score); });
  }

  const rows = students.map((stu) => {
    const bySubject = {};
    configs.forEach((c) => {
      if (c.kind === 'optional' && !enrolled.has(`${stu.id}:${c.subjectId}`)) return;
      const entry = (bySubject[c.key] ||= { name: c.name, obj: 0, theory: 0, max: 0 });
      entry[c.type === 'OBJ' ? 'obj' : 'theory'] += scores[`${c.type}:${c.id}:${stu.id}`] || 0;
      entry.max += c.mark;
    });
    const subjects = {};
    const percents = [];
    Object.values(bySubject).forEach((b) => {
      subjects[b.name] = { obj: round2(b.obj), theory: round2(b.theory), total: round2(b.obj + b.theory), max: b.max };
      if (b.max > 0) percents.push(((b.obj + b.theory) / b.max) * 100);
    });
    const average = percents.length ? round1(percents.reduce((a, b) => a + b, 0) / percents.length) : 0;
    return {
      dbId: stu.id, id: stu.uid, studentId: stu.student_id, name: `${stu.first_name} ${stu.last_name}`, gender: stu.gender,
      subjects, average, status: average >= PASS_AVERAGE ? 'Passed' : 'Failed',
    };
  });

  // equal averages share a position
  const sorted = [...rows].sort((a, b) => b.average - a.average);
  sorted.forEach((r, i) => { r.position = i > 0 && r.average === sorted[i - 1].average ? sorted[i - 1].position : i + 1; });
  return { students: rows, subjects: [...new Set(configs.map((c) => c.name))].sort(), totalStudents: rows.length };
}

// ---------- admin: class sheet ----------
async function view(query) {
  const term = await termService.resolveTerm(query);
  const arms = await resultModel.findClassArms({ classArmUid: query.classArmId, className: query.class, armName: query.arm });
  const released = new Set(await resultModel.releasedClassArmIds(term.id));

  const results = [];
  const subjects = new Set();
  const sheets = [];
  for (const ca of arms) {
    const sc = await termScores(ca.class_arm_id, term.id);
    sc.subjects.forEach((s) => subjects.add(s));
    sc.students.forEach((s) => results.push({
      id: s.studentId, uid: s.id, name: s.name, class: ca.class_name, arm: ca.arm_name, gender: s.gender,
      subjects: s.subjects, average: s.average, position: s.position, status: s.status,
    }));
    sheets.push({ classArmId: ca.uid, fullClassName: ca.full_class_name, released: released.has(ca.class_arm_id), students: sc.students.length });
  }
  return {
    results, subjects: [...subjects].sort(), sheets,
    released: sheets.length > 0 && sheets.every((s) => s.released),
    term: { session: term.session, term: term.term },
  };
}

async function setRelease({ classArmId, session, term: termName, release }, actor) {
  const term = await termService.resolveTerm({ session, term: termName });
  const classArm = await resultModel.findClassArmByUid(classArmId);
  if (!classArm) throw notFound('Class not found');
  if (release) await resultModel.upsertRelease(classArm.class_arm_id, term.id, actor.id);
  else await resultModel.deleteRelease(classArm.class_arm_id, term.id);
  await activityService.log({
    adminId: actor.id, type: 'result',
    activity: `${release ? 'Released' : 'Withdrew'} ${term.term} ${term.session} results for ${classArm.full_class_name}`,
  });
  return { released: release };
}

// ---------- theory marking ----------
async function loadTheoryExam(rawId) {
  const { t, row } = await examService.loadRow(rawId);
  if (t.type !== 'THEORY') throw badRequest('Marks can only be recorded manually for theory exams.');
  return row;
}

async function theorySheet({ examId }) {
  const row = await loadTheoryExam(examId);
  const students = await resultModel.theorySheetRows(row);
  return {
    exam: examService.shape(row),
    maxScore: Number(row.mark),
    students: students.map((s) => ({
      id: s.uid, studentId: s.student_id, name: `${s.first_name} ${s.last_name}`,
      attempted: !!s.attempt_status, submitted: s.attempt_status === 'submitted',
      score: s.score === null ? null : Number(s.score), remarks: s.remarks || '',
    })),
  };
}

async function theoryAnswers({ examId, studentId }) {
  const row = await loadTheoryExam(examId);
  const student = await studentModel.findBasicByUid(studentId);
  if (!student) throw notFound('Student not found');
  const rows = await resultModel.theoryAnswersOf(student.id, row.exam_config_id);
  return rows.map((r) => ({ id: r.uid, question: r.question, marks: Number(r.marks), answer: r.answer || '' }));
}

async function recordTheory({ examId, studentId, score, remarks }, actor) {
  const row = await loadTheoryExam(examId);
  const student = await studentModel.findBasicByUid(studentId);
  if (!student) throw notFound('Student not found');
  if (student.class_arm_id !== row.class_arm_id) throw badRequest("That student is not in this exam's class.");
  if (score > Number(row.mark)) throw badRequest(`Score cannot be more than ${row.mark}.`);

  await resultModel.upsertTheoryResult({ studentId: student.id, cfgId: row.exam_config_id, score, remarks, adminId: actor.id });
  await activityService.log({
    adminId: actor.id, type: 'result',
    activity: `Recorded ${row.subject_name} theory marks for ${student.first_name} ${student.last_name}`,
    description: `${score}/${row.mark} · ${row.full_class_name}`,
  });
  return { saved: true };
}

// ---------- history (admin: all terms; student: released terms only) ----------
async function history(studentDbId, releasedOnly) {
  const seen = new Set();
  const pairs = (await resultModel.historyPairs(studentDbId)).filter((p) => {
    const key = `${p.term_id}:${p.class_arm_id}`;
    return seen.has(key) ? false : seen.add(key);
  });

  const current = await termService.getCurrentTerm();
  const sessions = new Map();
  for (const p of pairs) {
    if (releasedOnly && !(await resultModel.isReleased(p.class_arm_id, p.term_id))) continue;
    const info = await resultModel.termAndClassName(p.term_id, p.class_arm_id);
    const sc = await termScores(p.class_arm_id, p.term_id);
    const me = sc.students.find((s) => s.dbId === studentDbId);
    if (!me) continue;
    if (!sessions.has(info.session)) sessions.set(info.session, { session: info.session, current: false, terms: [] });
    const entry = sessions.get(info.session);
    if (p.term_id === current.id) entry.current = true;
    entry.terms.push({
      term: info.term, class: info.full_class_name, average: me.average, position: me.position, totalStudents: sc.totalStudents, status: me.status,
      subjects: Object.fromEntries(Object.entries(me.subjects).map(([k, v]) => [k, { obj: v.obj, theory: v.theory, total: v.total }])),
    });
  }
  return [...sessions.values()]
    .sort((a, b) => b.session.localeCompare(a.session))
    .slice(0, SIX_SESSIONS)
    .map((s) => ({ ...s, terms: s.terms.sort((a, b) => TERM_NAMES.indexOf(a.term) - TERM_NAMES.indexOf(b.term)) }));
}

async function past({ studentId }) {
  const student = await studentModel.findBasicByUid(studentId);
  if (!student) throw notFound('Student not found');
  return history(student.id, false);
}

// ---------- student: my released results + teacher remarks ----------
async function mine(user) {
  const sessions = await history(user.id, true);

  const results = [];
  for (const s of sessions) {
    for (const t of s.terms) {
      for (const [subject, v] of Object.entries(t.subjects)) {
        const max = await resultModel.maxMarkFor({ session: s.session, term: t.term, subject, studentId: user.id });
        results.push({
          id: `${s.session}-${t.term}-${subject}`, session: s.session, term: t.term, subject,
          score: v.total, maxScore: max || 100, obj: v.obj, theory: v.theory,
          position: t.position, totalStudents: t.totalStudents, average: t.average, status: t.status,
          Exam: { title: `${subject} ${t.term}` },
        });
      }
    }
  }

  const released = new Set(sessions.flatMap((s) => s.terms.map((t) => `${s.session}-${t.term}`)));
  const remarks = {};
  for (const v of await resultModel.reviewsOfStudent(user.id)) {
    const key = `${v.session}-${v.term}`;
    if (!released.has(key)) continue;                       // remarks follow the results' release
    remarks[key] = {
      academicRemark: v.academic_remark || '', cognitiveRemark: v.cognitive_remark || '',
      behavioralRemark: v.behavioral_remark || '', teacherRemark: v.teacher_remark || '',
      cognitive: JSON.parse(v.cognitive || '{}'), behavioral: JSON.parse(v.behavioral || '{}'),
    };
  }
  return { results, remarks, history: sessions };
}

// ---------- teacher review ----------
async function getReview(query) {
  const term = await termService.resolveTerm(query);
  const student = await studentModel.findBasicByUid(query.studentId);
  if (!student) throw notFound('Student not found');
  const row = await resultModel.findReview(student.id, term.id);
  const termInfo = { session: term.session, term: term.term };
  if (!row) return { review: null, term: termInfo };
  return {
    term: termInfo,
    review: {
      cognitiveRatings: JSON.parse(row.cognitive), behavioralRatings: JSON.parse(row.behavioral),
      academicRemark: row.academic_remark || '', cognitiveRemark: row.cognitive_remark || '',
      behavioralRemark: row.behavioral_remark || '', teacherRemark: row.teacher_remark || '',
    },
  };
}

async function saveReview(b, actor) {
  const term = await termService.resolveTerm(b);
  const student = await studentModel.findBasicByUid(b.studentId);
  if (!student) throw notFound('Student not found');
  await resultModel.upsertReview({
    studentId: student.id, termId: term.id, cognitive: JSON.stringify(b.cognitiveRatings), behavioral: JSON.stringify(b.behavioralRatings),
    academicRemark: b.academicRemark || null, cognitiveRemark: b.cognitiveRemark || null,
    behavioralRemark: b.behavioralRemark || null, teacherRemark: b.teacherRemark || null, adminId: actor.id,
  });
  await activityService.log({
    adminId: actor.id, type: 'result', activity: `Reviewed ${student.first_name} ${student.last_name} for ${term.term}, ${term.session}`,
  });
  return { saved: true };
}

module.exports = { termScores, view, setRelease, theorySheet, theoryAnswers, recordTheory, past, mine, getReview, saveReview };
