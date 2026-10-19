const dashboardModel = require('../models/dashboard.model');
const termService = require('./term.service');
const examService = require('./exam.service');
const resultService = require('./result.service');
const activityService = require('./activity.service');
const { round1 } = require('../utils/datetime');

// Average (%) per class and overall for one term, from students that actually have scores.
async function performance(termId) {
  const perClass = new Map();
  let sum = 0;
  let count = 0;
  for (const ca of await dashboardModel.classArmsWithClass()) {
    const sheet = await resultService.termScores(ca.class_arm_id, termId);
    const scored = sheet.students.filter((s) => Object.keys(s.subjects).length > 0);
    if (!scored.length) continue;
    const total = scored.reduce((a, s) => a + s.average, 0);
    const cur = perClass.get(ca.class_id) || { name: ca.class_name, sum: 0, n: 0 };
    cur.sum += total;
    cur.n += scored.length;
    perClass.set(ca.class_id, cur);
    sum += total;
    count += scored.length;
  }
  return {
    overall: count ? round1(sum / count) : null,
    classes: [...perClass.values()].map((c) => ({ name: c.name, score: round1(c.sum / c.n) })),
  };
}

async function overview() {
  const term = await termService.getCurrentTerm();
  const [students, subjectCount, exams, perf, previousId, recent] = await Promise.all([
    dashboardModel.studentCounts(), dashboardModel.subjectCount(),
    examService.list({ term: 'current' }), performance(term.id),
    termService.findPreviousTermId(term.id), activityService.list({ limit: 5 }),
  ]);
  const previous = previousId ? await performance(previousId) : null;
  const change = perf.overall !== null && previous?.overall != null ? round1(perf.overall - previous.overall) : null;
  const count = (status) => exams.filter((e) => e.status === status).length;

  return {
    term: { session: term.session, term: term.term },
    kpis: {
      totalStudents: students.total, newStudentsThisMonth: students.thisMonth, activeExams: count('Active'),
      totalSubjects: subjectCount, averagePerformance: perf.overall, performanceChange: change,
    },
    examActivity: [
      { name: 'Completed', value: count('Completed'), color: '#10b981' },
      { name: 'In Progress', value: count('Active'), color: '#2563eb' },
      { name: 'Scheduled', value: count('Scheduled'), color: '#f59e0b' },
      { name: 'Draft', value: count('Draft'), color: '#9ca3af' },
    ],
    totalExams: exams.length,
    classPerformance: perf.classes,
    recentActivity: recent.activities,
  };
}

module.exports = { overview };
