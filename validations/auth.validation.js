const { z, strict, line, personName, email, username, password, uid } = require('./common');

const adminSignup = strict({ fullName: personName('Full name'), email, username, password });

const adminLogin = strict({
  emailOrUsername: z.string().trim().min(1, 'Email or username is required').max(254),
  password: z.string().min(1, 'Password is required').max(200),
});

const studentLogin = strict({
  admissionNumber: line('Student ID', 50),
  password: z.string().min(1, 'Password is required').max(200),
});

const changePassword = strict({ currentPassword: z.string().min(1).max(200), newPassword: password });

const adminCreate = strict({
  name: personName('Name'),
  email,
  username: username.optional(),
  role: z.enum(['Admin', 'Super Admin']).default('Admin'),
  password,
});

const adminUpdate = strict({
  name: personName('Name').optional(),
  email: email.optional(),
  role: z.enum(['Admin', 'Super Admin']).optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
  password: password.optional().or(z.literal('')),
});

const adminParams = strict({ id: uid });

module.exports = { adminSignup, adminLogin, studentLogin, changePassword, adminCreate, adminUpdate, adminParams };
