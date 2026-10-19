const { z, strict, uid, line, paragraph, isoDate, clock } = require('./common');
const { UID_RE } = require('../utils/uid');

const examId = z.string().refine((v) => /^(obj|theory)-/.test(v) && UID_RE.test(v.replace(/^(obj|theory)-/, '')), 'Invalid exam id');

const create = strict({
  type: z.enum(['OBJ', 'THEORY']),
  title: line('Exam title', 150),
  classArmId: uid,
  subjectId: uid,
  subjectKind: z.enum(['compulsory', 'optional']).default('compulsory'),
  totalQuestions: z.coerce.number().int().min(1).max(500),
  questionsToDisplay: z.coerce.number().int().min(1).max(500).optional(),
  markPerQuestion: z.coerce.number().min(0.25).max(100),
  passage: z.boolean().default(false),
  trueOrFalse: z.boolean().default(false),
  openExam: z.boolean().default(false),
  durationMinutes: z.coerce.number().int().min(1).max(300),
  date: isoDate,
  time: clock,
  instructions: paragraph('Instructions', 3000).optional().default(''),
}).superRefine((d, ctx) => {
  if (d.type === 'OBJ') {
    if (!d.questionsToDisplay) ctx.addIssue({ code: 'custom', path: ['questionsToDisplay'], message: 'Questions to display is required' });
    else if (d.questionsToDisplay > d.totalQuestions) ctx.addIssue({ code: 'custom', path: ['questionsToDisplay'], message: 'Cannot be more than total questions' });
  } else if (d.questionsToDisplay !== undefined || d.passage || d.trueOrFalse) {
    ctx.addIssue({ code: 'custom', message: 'Theory exams do not use passages, true/false or questions-to-display' });
  }
  const year = Number(d.date.slice(0, 4));
  const thisYear = new Date().getUTCFullYear();
  if (year < thisYear - 1 || year > thisYear + 2) ctx.addIssue({ code: 'custom', path: ['date'], message: 'Exam date is out of range' });
});

const list = strict({
  type: z.enum(['OBJ', 'THEORY']).optional(),
  term: z.enum(['current', 'all']).default('current'),
});

const option = z.string().trim().max(500).regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/, 'Invalid characters');

const objQuestion = strict({
  text: paragraph('Question', 5000).min(1, 'Question text is required'),
  passage: paragraph('Passage', 10000).nullable().optional(),
  options: strict({
    A: option.default(''), B: option.default(''), C: option.default(''), D: option.default(''),
  }),
  correctOption: z.string().trim().toUpperCase().pipe(z.enum(['A', 'B', 'C', 'D'], 'Correct option must be A, B, C or D')),
});

const theoryQuestion = strict({ text: paragraph('Question', 5000).min(1, 'Question text is required') });

// Either kind of question: the service picks the right schema once it knows the exam type.
const addQuestion = z.record(z.string(), z.unknown());
const confirmImport = strict({ questions: z.array(z.record(z.string(), z.unknown())).min(1, 'No questions to save').max(500) });

const open = strict({ open: z.boolean() });
const examParams = strict({
  id: examId,
  studentId: z.string()
    .trim()
    .min(1, 'Please enter your Student ID')
    .max(50),
});;
const questionParams = strict({ id: examId, questionId: uid });
const attemptParams = strict({ attemptId: uid });
const answer = strict({ questionId: uid, answer: z.string().max(20000).regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/, 'Invalid characters') });
const start = strict({ studentId: z.string().trim().min(1, 'Please enter your Student ID').max(50) });

module.exports = {
  examId, create, list, objQuestion, theoryQuestion, addQuestion, confirmImport, open,
  examParams, questionParams, attemptParams, answer, start,
};
