/**
 * Resolves whether an IdP role may perform desk-admin actions (delete, bulk
 * approve, rewrite the global prompt override).
 *
 * Production with an empty admin list refuses everyone — the IdP must map an
 * admin role (or group claim) into OIDC_ADMIN_ROLES. Outside production an empty
 * list keeps the local desk open so seeds and tests keep working.
 */
export function canAdministerRole(
  role: string,
  adminRoles: readonly string[],
  isProduction: boolean,
): boolean {
  if (adminRoles.length === 0) {
    return !isProduction;
  }

  const normalised = role.trim().toLowerCase();
  if (!normalised) {
    return false;
  }

  return adminRoles.some((entry) => {
    const target = entry.trim().toLowerCase();
    if (!target) {
      return false;
    }
    return (
      normalised === target ||
      normalised.startsWith(`${target} ·`) ||
      normalised.startsWith(`${target}·`)
    );
  });
}
