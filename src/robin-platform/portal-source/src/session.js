import applicationRoles from "../../shared/application-roles.cjs";

const { hasApplicationAdminRole } = applicationRoles;

export function isAdminUser(user) {
  if (!user) return false;
  return user.is_application_admin === true || hasApplicationAdminRole(user);
}
