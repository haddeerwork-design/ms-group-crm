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
  products: ROLES,
  pricing: ROLES,
  planner: ['super_admin', 'sales_manager', 'sales_officer', 'logistics_officer'],
  quotations: ['super_admin', 'sales_manager', 'sales_officer', 'finance_officer'],
  crm: ['super_admin', 'sales_manager', 'sales_officer', 'finance_officer'],
  pipeline: ['super_admin', 'sales_manager', 'sales_officer', 'finance_officer'],
  tasks: ROLES,
  suppliers: ROLES,
  logistics: ROLES,
  proformas: ['super_admin', 'sales_manager', 'sales_officer', 'finance_officer'],
  team: ['super_admin', 'sales_manager'],
  settings: ROLES, // everyone can read; only super_admin can edit (enforced by RLS)
} satisfies Record<string, readonly AppRole[]>
export type ModuleKey = keyof typeof MODULE_ACCESS

export function canAccess(roles: AppRole[], m: ModuleKey) {
  return roles.some((r) => (MODULE_ACCESS[m] as readonly AppRole[]).includes(r))
}

/** Roles allowed to add / edit products (must match app_can_manage_catalog() in SQL). */
export const CATALOG_MANAGERS: AppRole[] = ['super_admin', 'sales_manager']

/** Must match the SQL helpers in 0003_pricing. */
export const PRICE_MANAGERS: AppRole[] = ['super_admin', 'sales_manager']
export const COST_VIEWERS: AppRole[] = ['super_admin', 'sales_manager', 'finance_officer']
export const FX_EDITORS: AppRole[] = ['super_admin', 'sales_manager', 'finance_officer']

/** Must match 0004_containers. */
export const CONTAINER_MANAGERS: AppRole[] = ['super_admin', 'sales_manager', 'logistics_officer']
export const PLANNERS: AppRole[] = ['super_admin', 'sales_manager', 'sales_officer']
export const PLAN_EDIT_ALL: AppRole[] = ['super_admin', 'sales_manager']

/** Must match 0005_quotations (writers reuse the planner roles). */
export const QUOTE_WRITERS: AppRole[] = ['super_admin', 'sales_manager', 'sales_officer']
export const QUOTE_EDIT_ALL: AppRole[] = ['super_admin', 'sales_manager']

/** Must match 0006_crm. */
export const CRM_WRITERS: AppRole[] = ['super_admin', 'sales_manager', 'sales_officer']
export const CRM_ASSIGNERS: AppRole[] = ['super_admin', 'sales_manager']
