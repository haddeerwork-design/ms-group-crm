export const ROLES = [
  'super_admin', 'sales_manager', 'sales_officer',
  'logistics_officer', 'finance_officer', 'quality_officer', 'viewer',
] as const
export type AppRole = (typeof ROLES)[number]

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  sales_manager: 'Sales Manager',
  sales_officer: 'Sales Officer',
  logistics_officer: 'Logistics Officer',
  finance_officer: 'Finance Officer',
  quality_officer: 'Quality Officer',
  viewer: 'Viewer',
}

/** Which roles see which module in the menu. The database (RLS) is the real
 *  guard; this only decides what to show. */
export const MODULE_ACCESS = {
  dashboard: ROLES,
  team: ['super_admin', 'sales_manager'],
  settings: ROLES, // everyone can read; only super_admin can edit (enforced by RLS)
} satisfies Record<string, readonly AppRole[]>
export type ModuleKey = keyof typeof MODULE_ACCESS

export function canAccess(roles: AppRole[], m: ModuleKey) {
  return roles.some((r) => (MODULE_ACCESS[m] as readonly AppRole[]).includes(r))
}
