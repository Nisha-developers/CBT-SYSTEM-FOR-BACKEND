const { z, strict, label, email, phone, paragraph, line, logo, sessionName, termName } = require('./common');

const unique = (arr) => new Set(arr).size === arr.length;

const schoolProfile = strict({
  name: line('School name', 150),
  phone,
  email,
  motto: line('Motto', 200),
  logo: logo.nullable().optional(),
  description: paragraph('Description', 2000).min(1, 'Description is required'),
  headline: line('Headline', 200),
  address: paragraph('Address', 500).min(1, 'Address is required'),
});

const classArm = strict({ class_name: label('Class name'), arm_name: label('Arm name', 20), full_class_name: z.string().max(100) })
  .refine((v) => v.full_class_name === `${v.class_name} ${v.arm_name}`, { message: 'full_class_name must be "<class> <arm>"' });

const subject = strict({
  subject_name: label('Subject name', 80),
  class_arms: z.array(z.string().max(100)).min(1, 'Pick at least one class for each subject').max(200),
});

const lists = {
  classes: z.array(label('Class name')).max(30),
  arms: z.array(label('Arm name', 20)).max(30),
  classArms: z.array(classArm).max(400),
  subjects: z.array(subject).max(100),
  optionalSubjects: z.array(subject).max(100),
};

// Every referenced class/arm/class-arm must exist, and no subject may be both compulsory and optional in one arm.
function crossCheck(d, ctx, { requireRefs }) {
  const issue = (message) => ctx.addIssue({ code: 'custom', message });
  for (const k of ['classes', 'arms']) if (d[k] && !unique(d[k])) issue(`Duplicate entries in ${k}`);
  if (requireRefs && d.classArms) {
    const full = new Set(d.classArms.map((c) => c.full_class_name));
    if (full.size !== d.classArms.length) issue('Duplicate class arms');
    d.classArms.forEach((c) => {
      if (d.classes && !d.classes.includes(c.class_name)) issue(`Unknown class "${c.class_name}"`);
      if (d.arms && !d.arms.includes(c.arm_name)) issue(`Unknown arm "${c.arm_name}"`);
    });
    [...(d.subjects || []), ...(d.optionalSubjects || [])].forEach((s) =>
      s.class_arms.forEach((ca) => { if (!full.has(ca)) issue(`Unknown class arm "${ca}"`); }));
  }
  const names = (list) => (list || []).map((s) => s.subject_name);
  if (!unique(names(d.subjects)) || !unique(names(d.optionalSubjects))) issue('Duplicate subject names');
  const compulsory = new Map((d.subjects || []).map((s) => [s.subject_name, new Set(s.class_arms)]));
  (d.optionalSubjects || []).forEach((o) => {
    const clash = o.class_arms.find((ca) => compulsory.get(o.subject_name)?.has(ca));
    if (clash) issue(`"${o.subject_name}" cannot be both compulsory and optional in ${clash}`);
  });
}

const setup = strict({
  session: sessionName.optional(),
  term: termName.optional(),
  school: schoolProfile,
  classes: lists.classes.min(1, 'Add at least one class'),
  arms: lists.arms.min(1, 'Add at least one arm'),
  classArms: lists.classArms.min(1),
  subjects: lists.subjects.min(1, 'Add at least one compulsory subject'),
  optionalSubjects: lists.optionalSubjects.default([]),
}).superRefine((d, ctx) => crossCheck(d, ctx, { requireRefs: true }));

// Partial update: add classes/arms/subjects or edit the profile. (Existing records may be referenced.)
const update = strict({
  school: schoolProfile.partial().optional(),
  classes: lists.classes.optional(),
  arms: lists.arms.optional(),
  classArms: lists.classArms.optional(),
  subjects: lists.subjects.optional(),
  optionalSubjects: lists.optionalSubjects.optional(),
}).superRefine((d, ctx) => crossCheck(d, ctx, { requireRefs: false }));

const rename = strict({ name: label('Name', 80) });
const deleteSchool = strict({ confirm: z.string().max(20) });
const academicTerm = strict({ session: sessionName, term: termName });

module.exports = { setup, update, rename, deleteSchool, academicTerm };
