// End-to-end API test. Run against a FRESH database:  node test/e2e.js
const BASE = process.env.BASE || 'http://localhost:5000/api';
const crypto = require('crypto');
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const jwt = require('jsonwebtoken');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
async function call(method, path, { token, body, form, jar, headers: extra } = {}) {
  const headers = { ...(extra || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (jar && jar.rt) headers.Cookie = `cbt_rt=${jar.rt}`;
  let b;
  if (form) b = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; b = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers, body: b });
  const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (jar) {
    for (const c of setCookies) {
      const m = /^cbt_rt=([^;]*)/.exec(c);
      if (m) jar.rt = m[1] || null;      // empty value = cookie cleared
    }
  }
  let j = {}; try { j = await r.json(); } catch {}
  return { s: r.status, setCookies, ...j };
}
(async () => {
  console.log('SETUP');
  let r = await call('GET', '/school/exists'); ok(r.exists === false, 'no school yet');
  const setup = {
    school: { name: 'Test High', phone: '08012345678', email: 'a@test.edu', motto: 'Learn', logo: 'data:image/png;base64,AAAA', description: 'd', headline: 'h', address: 'Abeokuta' },
    classes: ['SS1', 'SS2'], arms: ['A', 'B'],
    classArms: [['SS1','A'],['SS1','B'],['SS2','A'],['SS2','B']].map(([c,a]) => ({ class_name: c, arm_name: a, full_class_name: `${c} ${a}` })),
    subjects: [{ subject_name: 'Mathematics', class_arms: ['SS1 A','SS1 B','SS2 A','SS2 B'] }, { subject_name: 'English', class_arms: ['SS2 A'] }],
    optionalSubjects: [{ subject_name: 'Music', class_arms: ['SS2 A'] }],
  };
  r = await call('POST', '/school/setup', { body: setup }); ok(r.s === 201, 'school setup 201 ' + (r.message||''));
  r = await call('POST', '/school/setup', { body: setup }); ok(r.s === 409, 'second setup blocked');
  r = await call('GET', '/school/exists'); ok(r.exists && !r.hasAdmin, 'exists, no admin');

  console.log('AUTH');
  r = await call('POST', '/auth/admin/signup', { body: { fullName: 'Nisha Admin', email: 'N@Test.edu', username: 'nisha', password: 'password123' } });
  ok(r.s === 201 && r.user.role === 'super_admin', 'signup creates super admin'); const A = r.accessToken;
  r = await call('POST', '/auth/admin/signup', { body: { fullName: 'X Y', email: 'x@test.edu', username: 'xyz', password: 'password123' } }); ok(r.s === 403, 'second signup blocked');
  r = await call('POST', '/auth/admin/login', { body: { emailOrUsername: 'nisha', password: 'wrong' } }); ok(r.s === 401, 'bad password 401');
  r = await call('POST', '/auth/admin/login', { body: { emailOrUsername: 'n@test.edu', password: 'password123' } }); ok(r.s === 200 && r.accessToken, 'login by email');
  r = await call('GET', '/students'); ok(r.s === 401, 'students needs auth');

  console.log('SCHOOL');
  r = await call('GET', '/school', { token: A }); ok(r.s === 200 && r.data.classes.length === 2, 'get school');
  const D = r.data; ok(/^[0-9a-f-]{36}$/.test(D.classes[0].id), 'ids are uids');
  const caId = (n) => D.classArms.find((c) => c.fullName === n).id;
  const subj = (n) => D.subjects.find((s) => s.name === n).id;
  const opt = D.optionalSubjects[0].id;
  r = await call('PATCH', `/school/classes/${D.classes[0].id}`, { token: A, body: { name: 'SSS1' } }); ok(r.s === 200, 'rename class by uid');
  r = await call('GET', '/school', { token: A }); ok(r.data.classArms.some((c) => c.fullName === 'SSS1 A'), 'full class names resynced');
  r = await call('PATCH', `/school/classes/${D.classes[0].id}`, { token: A, body: { name: 'SS1' } });
  r = await call('PUT', '/school/academic-term', { token: A, body: { session: '2026/2027', term: 'First Term' } }); ok(r.s === 200, 'set current term');
  r = await call('PUT', '/school', { token: A, body: { classes: ['SS3'] } }); ok(r.s === 200, 'add class via PUT');
  r = await call('GET', '/school', { token: A }); const ss3 = r.data.classes.find((c) => c.name === 'SS3');
  r = await call('DELETE', `/school/classes/${ss3.id}`, { token: A }); ok(r.s === 200, 'delete unused class by uid');
  r = await call('DELETE', `/school/classes/${D.classes[1].id}`, { token: A }); ok(r.s === 409, 'cannot delete class in use');
  r = await call('DELETE', `/school/classes/12`, { token: A }); ok(r.s === 422, 'integer id rejected');

  console.log('STUDENTS');
  const mk = (n, id, ca, extra = {}) => call('POST', '/students', { token: A, body: { firstName: n, lastName: 'Okafor', studentId: id, classArmId: ca, gender: 'Female', ...extra } });
  r = await mk('Ada', 'S001', caId('SS2 A'), { optionalSubjectIds: [opt] }); ok(r.s === 201, 'create student'); const ada = r.student;
  r = await mk('Bayo', 'S002', caId('SS2 A')); ok(r.s === 201, 'create 2nd'); const bayo = r.student;
  r = await mk('Dup', 'S001', caId('SS2 A')); ok(r.s === 409, 'duplicate student id blocked');
  r = await mk('Chi', 'S003', caId('SS1 A')); ok(r.s === 201, 'student in other class');
  r = await mk('Bad', 'S004', caId('SS1 A'), { optionalSubjectIds: [opt] }); ok(r.s === 400, 'optional subject not offered in class rejected');
  r = await call('GET', `/students?classArmId=${caId('SS2 A')}`, { token: A }); ok(r.total === 2 && r.students[0].class === 'SS2', 'filter by class arm uid');
  r = await call('PUT', `/students/${bayo.id}`, { token: A, body: { firstName: 'Bayode' } }); ok(r.s === 200 && r.student.firstName === 'Bayode', 'edit student by uid');

  console.log('EXAMS');
  const cfg = { type: 'OBJ', title: 'Maths Obj', classArmId: caId('SS2 A'), subjectId: subj('Mathematics'), totalQuestions: 3, questionsToDisplay: 3, markPerQuestion: 10, durationMinutes: 30, date: '2026-10-14', time: '08:00', openExam: true };
  r = await call('POST', '/exams', { token: A, body: cfg }); ok(r.s === 201 && r.exam.totalMarks === 30, 'create OBJ exam'); const obj = r.exam;
  ok(obj.status === 'Draft', 'status Draft until questions uploaded');
  r = await call('POST', '/exams', { token: A, body: cfg }); ok(r.s === 409, 'duplicate exam blocked');
  r = await call('POST', '/exams', { token: A, body: { ...cfg, subjectId: subj('English'), classArmId: caId('SS1 A') } }); ok(r.s === 400, 'subject not in class rejected');
  const fd = new FormData(); fd.append('file', new Blob([require('fs').readFileSync(__dirname + '/questions.docx')]), 'questions.docx');
  r = await call('POST', `/exams/${obj.id}/questions/import`, { token: A, form: fd }); ok(r.s === 200 && r.preview.length === 3 && r.preview[0].correctOption === 'B', 'docx import preview parsed 3 questions');
  const prev = r.preview;
  r = await call('GET', `/exams/${obj.id}/questions`, { token: A }); ok(r.questions.length === 0, 'preview did not save anything');
  r = await call('POST', `/exams/${obj.id}/questions/import/confirm`, { token: A, body: { questions: prev } }); ok(r.s === 201 && r.questions.length === 3, 'confirm saves');
  r = await call('POST', `/exams/${obj.id}/questions`, { token: A, body: { text: 'x', options: { A: '1', B: '2', C: '3', D: '4' }, correctOption: 'A' } }); ok(r.s === 409, 'cannot exceed total question set');
  r = await call('GET', `/exams?type=OBJ`, { token: A }); ok(r.exams[0].status === 'Active' && r.exams[0].uploadedQuestions === 3, 'exam now Active');
  const th = await call('POST', '/exams', { token: A, body: { type: 'THEORY', title: 'Maths Theory', classArmId: caId('SS2 A'), subjectId: subj('Mathematics'), totalQuestions: 2, markPerQuestion: 20, durationMinutes: 60, date: '2026-10-14', time: '08:00', openExam: true } });
  ok(th.s === 201 && th.exam.totalMarks === 40, 'create THEORY exam');
  r = await call('POST', `/exams/${th.exam.id}/questions`, { token: A, body: { text: 'Explain Pythagoras' } }); ok(r.s === 201, 'add theory q');
  r = await call('POST', `/exams/${th.exam.id}/questions`, { token: A, body: { text: 'Define a prime number' } }); ok(r.s === 201, 'add theory q2');
  const music = await call('POST', '/exams', { token: A, body: { type: 'OBJ', title: 'Music', classArmId: caId('SS2 A'), subjectId: opt, subjectKind: 'optional', totalQuestions: 1, questionsToDisplay: 1, markPerQuestion: 5, durationMinutes: 10, date: '2026-10-14', time: '08:00', openExam: true } });
  ok(music.s === 201, 'exam for optional subject'); 
  await call('POST', `/exams/${music.exam.id}/questions`, { token: A, body: { text: 'q', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, correctOption: 'C' } });

  console.log('STUDENT TAKES EXAMS');
  r = await call('POST', '/auth/student/login', { body: { admissionNumber: 's001', password: 'OKAFOR' } }); ok(r.s === 200 && r.user.mustChangePassword, 'student login (default pw = last name, any case)'); const AT = r.accessToken;
  r = await call('POST', '/auth/student/login', { body: { admissionNumber: 'S002', password: 'Okafor' } }); const BT = r.accessToken;
  r = await call('GET', '/exams/available', { token: AT }); ok(r.exams.length === 3, 'Ada sees 3 exams (incl. her optional)');
  r = await call('GET', '/exams/available', { token: BT }); ok(r.exams.length === 2, 'Bayo sees 2 (not Music)');
  r = await call('GET', '/exams', { token: AT }); ok(r.s === 403, 'student cannot list admin exams');
  r = await call('POST', `/exams/${obj.id}/start`, { token: AT, body: { studentId: 'S999' } }); ok(r.s === 400, 'wrong student id rejected');
  r = await call('POST', `/exams/${music.exam.id}/start`, { token: BT, body: { studentId: 'S002' } }); ok(r.s === 403, 'not enrolled in optional subject');
  r = await call('GET', `/exams/${obj.id}`, { token: AT }); ok(r.s === 403, 'cannot open paper before starting');
  r = await call('POST', `/exams/${obj.id}/start`, { token: AT, body: { studentId: 's001' } }); ok(r.s === 200 && r.attempt.remainingSeconds > 1700, 'start attempt'); const att = r.attempt;
  r = await call('POST', `/exams/${obj.id}/start`, { token: AT, body: { studentId: 'S001' } }); ok(r.attempt.id === att.id, 'start again resumes same attempt');
  r = await call('GET', `/exams/${obj.id}`, { token: AT }); ok(r.exam.questions.length === 3 && !JSON.stringify(r).includes('correct'), 'paper has 3 questions and no answers');
  const qs = r.exam.questions;
  const right = { 'What is 2+2?': 'B', 'Capital of France?': 'A', 'Largest planet?': 'B' };
  for (let i = 0; i < qs.length; i++) {
    const ans = i === 2 ? 'C' : right[qs[i].text]; // last one wrong
    r = await call('PUT', `/exams/attempts/${att.id}/answer`, { token: AT, body: { questionId: qs[i].id, answer: ans } });
  }
  ok(r.s === 200, 'answers saved');
  r = await call('GET', `/exams/${obj.id}`, { token: AT }); ok(Object.keys(r.attempt.answers).length === 3, 'answers restored after refresh');
  r = await call('PUT', `/exams/attempts/${att.id}/answer`, { token: BT, body: { questionId: qs[0].id, answer: 'A' } }); ok(r.s === 404, "can't touch another student's attempt");
  r = await call('POST', `/exams/attempts/${att.id}/submit`, { token: AT }); ok(r.s === 200, 'submit OBJ');
  r = await call('PUT', `/exams/attempts/${att.id}/answer`, { token: AT, body: { questionId: qs[0].id, answer: 'A' } }); ok(r.s === 409, 'no edits after submit');
  r = await call('POST', `/exams/${obj.id}/start`, { token: AT, body: { studentId: 'S001' } }); ok(r.s === 409, 'cannot retake');
  r = await call('POST', `/exams/${th.exam.id}/start`, { token: AT, body: { studentId: 'S001' } }); const tatt = r.attempt;
  r = await call('GET', `/exams/${th.exam.id}`, { token: AT }); const tq = r.exam.questions;
  await call('PUT', `/exams/attempts/${tatt.id}/answer`, { token: AT, body: { questionId: tq[0].id, answer: 'a^2+b^2=c^2' } });
  r = await call('POST', `/exams/attempts/${tatt.id}/submit`, { token: AT }); ok(r.s === 200, 'submit theory');
  r = await call('POST', `/exams/${music.exam.id}/start`, { token: AT, body: { studentId: 'S001' } }); const matt = r.attempt;
  r = await call('GET', `/exams/${music.exam.id}`, { token: AT });
  await call('PUT', `/exams/attempts/${matt.id}/answer`, { token: AT, body: { questionId: r.exam.questions[0].id, answer: 'C' } });
  await call('POST', `/exams/attempts/${matt.id}/submit`, { token: AT });

  console.log('RESULTS');
  r = await call('GET', `/results/theory/sheet?examId=${th.exam.id}`, { token: A }); ok(r.students.length === 2 && r.students.find((s) => s.studentId === 'S001').submitted, 'theory sheet lists students');
  r = await call('GET', `/results/theory/answers?examId=${th.exam.id}&studentId=${ada.id}`, { token: A }); ok(r.answers.some((a) => a.answer.includes('a^2')), "can read student's theory answers");
  r = await call('POST', '/results/theory', { token: A, body: { examId: th.exam.id, studentId: ada.id, score: 99 } }); ok(r.s === 400, 'score above max rejected');
  r = await call('POST', '/results/theory', { token: A, body: { examId: th.exam.id, studentId: ada.id, score: 30, remarks: 'good' } }); ok(r.s === 200, 'record theory marks');
  r = await call('GET', `/results?classArmId=${caId('SS2 A')}`, { token: A });
  const row = r.results.find((x) => x.id === 'S001');
  ok(row && row.subjects.Mathematics.obj === 20 && row.subjects.Mathematics.theory === 30 && row.subjects.Mathematics.total === 50, 'OBJ auto-marked (2/3×10=20) + theory 30 = 50');
  ok(row.subjects.Music && row.subjects.Music.total === 5, 'optional subject result');
  ok(row.position === 1 && r.results.length === 2, 'position computed');
  r = await call('GET', '/results/mine', { token: AT }); ok(r.results.length === 0, 'student sees nothing before release');
  r = await call('PUT', '/results/release', { token: A, body: { classArmId: caId('SS2 A'), release: true } }); ok(r.s === 200, 'release results');
  r = await call('GET', '/results/mine', { token: AT }); ok(r.results.length === 2 && r.results.find((x) => x.subject === 'Mathematics').score === 50 && r.results[0].maxScore > 0, 'student sees released results');
  r = await call('POST', '/results/review', { token: A, body: { studentId: ada.id, cognitiveRatings: { memory: 5 }, behavioralRatings: { punctuality: 4 }, teacherRemark: 'Great' } }); ok(r.s === 200, 'save review');
  r = await call('GET', `/results/review?studentId=${ada.id}`, { token: A }); ok(r.review.cognitiveRatings.memory === 5, 'read review back');
  r = await call('GET', '/results/mine', { token: AT }); const k = Object.keys(r.remarks)[0]; ok(k && r.remarks[k].teacherRemark === 'Great', 'student sees remarks of released term');
  r = await call('GET', `/results/past?studentId=${ada.id}`, { token: A }); ok(r.sessions.length === 1 && r.sessions[0].terms[0].subjects.Mathematics.total === 50 && r.sessions[0].current, 'past results');
  r = await call('PUT', '/results/release', { token: A, body: { classArmId: caId('SS2 A'), release: false } }); 
  r = await call('GET', '/results/mine', { token: AT }); ok(r.results.length === 0, 'withdrawn results hidden again');

  console.log('PASSWORD');
  r = await call('POST', '/auth/student/change-password', { token: AT, body: { currentPassword: 'wrong', newPassword: 'newpass123' } }); ok(r.s === 400, 'wrong current pw');
  r = await call('POST', '/auth/student/change-password', { token: AT, body: { currentPassword: 'okafor', newPassword: 'newpass123' } }); ok(r.s === 200, 'change pw');
  r = await call('POST', '/auth/student/login', { body: { admissionNumber: 'S001', password: 'newpass123' } }); ok(r.s === 200 && !r.user.mustChangePassword, 'login with new pw');
  r = await call('POST', `/students/${ada.id}/reset-password`, { token: A }); ok(r.s === 200, 'admin resets pw');
  r = await call('POST', '/auth/student/login', { body: { admissionNumber: 'S001', password: 'okafor' } }); ok(r.s === 200, 'default pw works again');

  console.log('DASHBOARD / ACTIVITY / ADMINS');
  r = await call('GET', '/dashboard/overview', { token: A }); ok(r.kpis.totalStudents === 3 && r.kpis.activeExams === 3 && r.kpis.totalSubjects === 3 && r.classPerformance.length >= 1, 'overview numbers');
  r = await call('GET', '/activities?limit=5', { token: A }); ok(r.activities.length === 5 && r.total > 5 && r.hasMore, 'activities paginate');
  r = await call('GET', '/activities?limit=5&offset=5', { token: A }); ok(r.activities.length > 0, 'activities page 2');
  r = await call('POST', '/admins', { token: A, body: { name: 'Jane Smith', email: 'jane@test.edu', role: 'Admin', password: 'password123' } }); ok(r.s === 201 && r.admin.role === 'Admin', 'create admin'); const jane = r.admin;
  r = await call('POST', '/auth/admin/login', { body: { emailOrUsername: 'jane', password: 'password123' } }); const J = r.accessToken; ok(r.s === 200, 'new admin logs in (auto username)');
  r = await call('GET', '/admins', { token: J }); ok(r.s === 403, 'plain admin cannot manage admins');
  r = await call('PUT', `/admins/${jane.id}`, { token: A, body: { status: 'Inactive' } }); ok(r.s === 200 && r.admin.status === 'Inactive', 'deactivate by uid');
  r = await call('POST', '/auth/admin/login', { body: { emailOrUsername: 'jane', password: 'password123' } }); ok(r.s === 403, 'inactive admin blocked');
  const me = (await call('GET', '/admins', { token: A })).admins.find((a) => a.username === 'nisha');
  r = await call('DELETE', `/admins/${me.id}`, { token: A }); ok(r.s === 400, 'cannot delete yourself');
  r = await call('DELETE', `/admins/${jane.id}`, { token: A }); ok(r.s === 200, 'delete admin by uid');

  console.log('SESSIONS & TOKENS');
  const jar = {};
  r = await call('POST', '/auth/admin/login', { body: { emailOrUsername: 'nisha', password: 'password123' }, jar });
  ok(r.s === 200 && r.accessToken && r.user.email === 'n@test.edu', 'login returns access token + profile');
  ok(r.refreshToken === undefined && !JSON.stringify(r).includes('refresh'), 'refresh token is NOT in the response body');
  const sc = r.setCookies.find((c) => c.startsWith('cbt_rt='));
  ok(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc) && /Path=\/api\/auth/i.test(sc), 'refresh cookie is HttpOnly, SameSite=Strict, scoped to /api/auth');
  const rt1 = jar.rt;
  r = await call('POST', '/auth/refresh', { jar, headers: { Origin: 'http://localhost:5173' } });
  ok(r.s === 200 && r.accessToken && r.user.role === 'super_admin' && jar.rt && jar.rt !== rt1, 'refresh issues a new access token and ROTATES the cookie');
  const newAccess = r.accessToken;
  r = await call('GET', '/auth/me', { token: newAccess }); ok(r.s === 200 && r.user.username === 'nisha', 'new access token works');
  r = await call('POST', '/auth/refresh', { jar: { rt: rt1 } });                  // old token, replayed straight away
  ok(r.s === 401, 'replaying a rotated refresh token is refused');
  r = await call('POST', '/auth/refresh', { jar }); ok(r.s === 200, 'duplicate request inside the grace window does not kill the live session');
  console.log('  … waiting 11s to test token-theft detection');
  await new Promise((res) => setTimeout(res, 11000));
  const stolen = { rt: rt1 };
  r = await call('POST', '/auth/refresh', { jar: stolen }); ok(r.s === 401, 'old (stolen) refresh token refused after the grace window');
  r = await call('POST', '/auth/refresh', { jar }); ok(r.s === 401, 'reuse detected → the whole session family is revoked');
  r = await call('POST', '/auth/refresh', { jar: {} }); ok(r.s === 401, 'no cookie → 401');
  r = await call('POST', '/auth/refresh', { jar: { rt: 'garbage.token.value' } }); ok(r.s === 401, 'garbage cookie → 401');

  const forged = jwt.sign({ type: 'admin', role: 'super_admin' }, process.env.REFRESH_TOKEN_SECRET, { subject: 'x', expiresIn: '1m', issuer: 'cbt-api', audience: 'cbt-app' });
  r = await call('GET', '/auth/me', { token: forged }); ok(r.s === 401, 'a refresh-secret token is not accepted as an access token');
  const expired = jwt.sign({ type: 'admin', role: 'admin' }, process.env.ACCESS_TOKEN_SECRET, { subject: 'x', expiresIn: -10, issuer: 'cbt-api', audience: 'cbt-app' });
  r = await call('GET', '/auth/me', { token: expired }); ok(r.s === 401 && r.code === 'TOKEN_EXPIRED', 'expired access token → 401 with code TOKEN_EXPIRED');
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 'x', type: 'admin' })).toString('base64url') + '.';
  r = await call('GET', '/auth/me', { token: none }); ok(r.s === 401, 'alg:none token rejected');
  r = await call('GET', '/auth/me', { token: A.slice(0, -3) + 'abc' }); ok(r.s === 401, 'tampered signature rejected');

  // logout revokes the session
  const j2 = {};
  r = await call('POST', '/auth/admin/login', { body: { emailOrUsername: 'nisha', password: 'password123' }, jar: j2 });
  const rtBefore = j2.rt;
  r = await call('POST', '/auth/logout', { jar: j2 }); ok(r.s === 200 && j2.rt === null, 'logout clears the cookie');
  r = await call('POST', '/auth/refresh', { jar: { rt: rtBefore } }); ok(r.s === 401, 'a logged-out refresh token no longer works');

  // origin check on cookie endpoints
  r = await call('POST', '/auth/refresh', { jar: { rt: 'x' }, headers: { Origin: 'https://evil.example' } }); ok(r.s === 403, 'refresh from a foreign Origin is blocked (CSRF)');

  // a deactivated admin loses access IMMEDIATELY (not when the token expires)
  r = await call('POST', '/admins', { token: A, body: { name: 'Temp Admin', email: 'temp@test.edu', role: 'Admin', password: 'password123' } });
  const temp = r.admin; const tj = {};
  r = await call('POST', '/auth/admin/login', { body: { emailOrUsername: 'temp', password: 'password123' }, jar: tj }); const T = r.accessToken;
  r = await call('GET', '/students', { token: T }); ok(r.s === 200, 'new admin can use the API');
  await call('PUT', `/admins/${temp.id}`, { token: A, body: { status: 'Inactive' } });
  r = await call('GET', '/students', { token: T }); ok(r.s === 401, 'deactivated admin: existing access token stops working at once');
  r = await call('POST', '/auth/refresh', { jar: tj }); ok(r.s === 401, 'deactivated admin: refresh token is revoked too');
  await call('DELETE', `/admins/${temp.id}`, { token: A });

  // student: changing password signs out OTHER devices but keeps this one
  const s1 = {}; const s2 = {};
  r = await call('POST', '/auth/student/login', { body: { admissionNumber: 'S001', password: 'okafor' }, jar: s1 }); const S1 = r.accessToken;
  await call('POST', '/auth/student/login', { body: { admissionNumber: 'S001', password: 'okafor' }, jar: s2 });
  r = await call('POST', '/auth/student/change-password', { token: S1, body: { currentPassword: 'okafor', newPassword: 'Brand5new' } }); ok(r.s === 200, 'student changes password');
  r = await call('POST', '/auth/refresh', { jar: s2 }); ok(r.s === 401, "the student's other device was signed out");
  r = await call('POST', '/auth/refresh', { jar: s1 }); ok(r.s === 200, 'this device stays signed in');
  r = await call('POST', `/students/${ada.id}/reset-password`, { token: A });

  // brute force: 5 wrong passwords for ONE account lock that account (per IP), others are unaffected
  for (let i = 0; i < 5; i++) await call('POST', '/auth/student/login', { body: { admissionNumber: 'S002', password: 'wrong-' + i } });
  r = await call('POST', '/auth/student/login', { body: { admissionNumber: 'S002', password: 'Okafor' } }); ok(r.s === 429, '6th attempt on the same account is rate-limited (429)');
  r = await call('POST', '/auth/student/login', { body: { admissionNumber: 'S001', password: 'okafor' } }); ok(r.s === 200, 'other students are not locked out by it');

  // hostile / nonsense input
  const bad = async (label, method, path, body, token = A, want = 422) => { r = await call(method, path, { token, body }); ok(r.s === want, `${label} → ${want} (got ${r.s})`); };
  await bad('unknown field rejected', 'POST', '/students', { firstName: 'A', lastName: 'B', studentId: 'X1', classArmId: caId('SS1 A'), isAdmin: true });
  await bad('digits in a name', 'POST', '/students', { firstName: 'Ada123', lastName: 'Okafor', studentId: 'X2', classArmId: caId('SS1 A') });
  await bad('<script> as a name', 'POST', '/students', { firstName: '<script>alert(1)</script>', lastName: 'Okafor', studentId: 'X3', classArmId: caId('SS1 A') });
  await bad('SQL-ish student id', 'POST', '/students', { firstName: 'Ada', lastName: 'Okafor', studentId: "S1'; DROP TABLE students;--", classArmId: caId('SS1 A') });
  await bad('array instead of string', 'POST', '/students', { firstName: ['Ada'], lastName: 'Okafor', studentId: 'X4', classArmId: caId('SS1 A') });
  await bad('object instead of string', 'POST', '/students', { firstName: { $ne: 1 }, lastName: 'Okafor', studentId: 'X5', classArmId: caId('SS1 A') });
  await bad('absurdly long name', 'POST', '/students', { firstName: 'A'.repeat(5000), lastName: 'Okafor', studentId: 'X6', classArmId: caId('SS1 A') });
  await bad('control characters', 'POST', '/students', { firstName: 'Ada\u0000', lastName: 'Okafor', studentId: 'X7', classArmId: caId('SS1 A') });
  await bad('non-uuid id', 'GET', '/students/not-a-uuid', undefined);
  await bad('weak admin password', 'POST', '/admins', { name: 'Weak Admin', email: 'weak@test.edu', role: 'Admin', password: 'abcdefgh' });
  await bad('72+ char password', 'POST', '/admins', { name: 'Long Admin', email: 'long@test.edu', role: 'Admin', password: 'a1' + 'x'.repeat(100) });
  await bad('impossible exam date', 'POST', '/exams', { type: 'OBJ', title: 'T', classArmId: caId('SS1 A'), subjectId: subj('Mathematics'), totalQuestions: 1, questionsToDisplay: 1, markPerQuestion: 1, durationMinutes: 10, date: '2026-02-31', time: '09:00' });
  await bad('negative marks', 'POST', '/exams', { type: 'OBJ', title: 'T', classArmId: caId('SS1 A'), subjectId: subj('Mathematics'), totalQuestions: 1, questionsToDisplay: 1, markPerQuestion: -5, durationMinutes: 10, date: '2026-10-20', time: '09:00' });
  await bad('display > total', 'POST', '/exams', { type: 'OBJ', title: 'T', classArmId: caId('SS1 A'), subjectId: subj('Mathematics'), totalQuestions: 2, questionsToDisplay: 9, markPerQuestion: 1, durationMinutes: 10, date: '2026-10-20', time: '09:00' });
  await bad('bad session name', 'PUT', '/school/academic-term', { session: '2026/2030', term: 'First Term' });
  await bad('fake term', 'PUT', '/school/academic-term', { session: '2026/2027', term: 'Fourth Term' });
  await bad('bad logo type', 'PUT', '/school', { school: { logo: 'javascript:alert(1)' } });
  await bad('page size too big', 'GET', '/students?limit=100000', undefined);
  await bad('unknown query key', 'GET', '/students?foo=bar', undefined);
  r = await call('POST', '/auth/admin/login', { body: { emailOrUsername: "' OR '1'='1", password: "' OR '1'='1" } }); ok(r.s === 401, 'SQL-injection login attempt → clean 401');
  r = await call('POST', '/auth/admin/login', { body: { emailOrUsername: 'nisha', password: { $gt: '' } } }); ok(r.s === 422, 'object as password → 422');
  r = await fetch(BASE + '/auth/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' }); ok(r.status === 400, 'malformed JSON → 400');
  r = await fetch(BASE + '/students', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${A}` }, body: JSON.stringify({ x: 'y'.repeat(200000) }) }); ok(r.status === 413, 'oversized body → 413');
  r = await fetch(BASE + '/school/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'y'.repeat(200000) }) }); ok(r.status !== 413, 'school routes accept larger bodies (logo)');

  console.log('DELETE BY UID + SCHOOL RESET');
  r = await call('DELETE', `/students/${bayo.id}`, { token: A }); ok(r.s === 200, 'delete student by uid');
  r = await call('DELETE', `/exams/${music.exam.id}`, { token: A }); ok(r.s === 409, 'cannot delete exam with attempts');
  r = await call('DELETE', `/school`, { token: J }); ok(r.s === 401 || r.s === 403, 'inactive/other cannot delete school');
  r = await call('DELETE', `/school`, { token: A, body: { confirm: 'nope' } }); ok(r.s === 400, 'needs DELETE confirmation');
  r = await call('DELETE', `/school`, { token: A, body: { confirm: 'DELETE' } }); ok(r.s === 200, 'school deleted');
  r = await call('GET', '/school/exists'); ok(r.exists === false && r.hasAdmin === false, 'system back to original state');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
