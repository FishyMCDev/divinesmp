const { PermissionFlagsBits } = require('discord.js');

/**
 * Check if a member has a reviewer role OR is an admin.
 */
function hasReviewerRole(member, config) {
  if (!member) return false;
  if (hasAdminRole(member, config)) return true;
  const reviewerRoles = config.allowedReviewerRoleIds || [];
  return reviewerRoles.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Check if a member has an admin role or Administrator permission.
 */
function hasAdminRole(member, config) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const adminRoles = config.adminRoleIds || [];
  return adminRoles.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Check if a member can use /touch (admin or has BAN_MEMBERS permission).
 */
function canTouch(member, config) {
  if (!member) return false;
  if (hasAdminRole(member, config)) return true;
  return member.permissions.has(PermissionFlagsBits.BanMembers);
}

module.exports = { hasReviewerRole, hasAdminRole, canTouch };
