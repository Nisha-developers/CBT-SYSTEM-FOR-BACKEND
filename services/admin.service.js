const { hashPassword } = require('../utils/hash');
const { newUid } = require('../utils/uid');
const { badRequest, notFound, conflict } = require('../utils/errors');
const { withTransaction } = require('../utils/transaction');
const { fmtDateTime, timeAgo } = require('../utils/datetime');
const adminModel = require('../models/admin.model');
const activityService = require('./activity.service');
const tokenService = require('./token.service');
const { ROLES } = require('../constants');

const roleValue = (label) => (label === 'Super Admin' ? ROLES.SUPER_ADMIN : ROLES.ADMIN);
const roleLabel = (role) => (role === ROLES.SUPER_ADMIN ? 'Super Admin' : 'Admin');

const shape = (a) => ({
  id: a.uid,
  name: a.full_name,
  username: a.username,
  email: a.email,
  role: roleLabel(a.role),
  status: a.status === 'active' ? 'Active' : 'Inactive',
  createdAt: fmtDateTime(a.created_at),
  lastLogin: a.last_login ? timeAgo(a.last_login) : 'Never',
});

const usernameFromEmail = (email) => email.split('@')[0].replace(/[^A-Za-z0-9._-]/g, '').slice(0, 24).padEnd(3, '0');

async function getOrThrow(uid, conn, lock) {
  const admin = await adminModel.findByUid(uid, conn, { lock });
  if (!admin) throw notFound('Admin not found');
  return admin;
}

async function list() {
  return (await adminModel.findAll()).map(shape);
}

async function create(body, actor) {
  const passwordHash = await hashPassword(body.password);
  const uid = newUid();
  try {
    await withTransaction(async (conn) => {
      // an auto-generated username gets a number suffix until it's free
      const base = body.username || usernameFromEmail(body.email);
      let username = base;
      for (let n = 1; await adminModel.usernameTaken(username, conn); n += 1) {
        if (body.username) throw conflict('That username is already taken.');
        username = `${base}${n}`;
      }
      await adminModel.insert({
        uid, fullName: body.name, username, email: body.email, passwordHash, role: roleValue(body.role),
      }, conn);
      await activityService.log({ adminId: actor.id, type: 'admin', activity: `Added ${body.role} "${body.name}"`, conn });
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict('An admin with that email already exists.');
    throw err;
  }
  return shape(await adminModel.findByUid(uid));
}

async function update(uid, body, actor) {
  let target;
  try {
    target = await withTransaction(async (conn) => {
      const admin = await getOrThrow(uid, conn, true);
      const role = body.role ? roleValue(body.role) : admin.role;
      const status = body.status ? body.status.toLowerCase() : admin.status;

      const losingSuper = admin.role === ROLES.SUPER_ADMIN && (role !== ROLES.SUPER_ADMIN || status !== 'active');
      if (losingSuper && (await adminModel.countOtherActiveSuperAdmins(admin.id, conn)) === 0) {
        throw badRequest('There must be at least one active super admin.');
      }
      if (admin.id === actor.id && status !== 'active') throw badRequest('You cannot deactivate your own account.');

      await adminModel.update(admin.id, {
        fullName: body.name ?? admin.full_name,
        email: body.email ?? admin.email,
        role,
        status,
        passwordHash: body.password ? await hashPassword(body.password) : null,
      }, conn);
      await activityService.log({ adminId: actor.id, type: 'admin', activity: `Updated admin "${body.name ?? admin.full_name}"`, conn });
      return { id: admin.id, changedAccess: role !== admin.role || status !== admin.status || !!body.password };
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw conflict('An admin with that email already exists.');
    throw err;
  }
  // demotion / deactivation / password reset → their existing sessions must end
  if (target.changedAccess && target.id !== actor.id) await tokenService.revokeAllForSubject('admin', target.id, null);
  return shape(await adminModel.findByUid(uid));
}

async function remove(uid, actor) {
  const adminId = await withTransaction(async (conn) => {
    const admin = await getOrThrow(uid, conn, true);
    if (admin.id === actor.id) throw badRequest('You cannot delete your own account.');
    if (admin.role === ROLES.SUPER_ADMIN && (await adminModel.countOtherActiveSuperAdmins(admin.id, conn)) === 0) {
      throw badRequest('There must be at least one active super admin.');
    }
    await adminModel.remove(admin.id, conn);
    await activityService.log({ adminId: actor.id, type: 'admin', activity: `Removed admin "${admin.full_name}"`, conn });
    return admin.id;
  });
  await tokenService.revokeAllForSubject('admin', adminId, null);
}

module.exports = { list, create, update, remove };
