import type { Role } from "@/generated/prisma/enums";

const RANK: Record<Role, number> = { VIEWER: 0, SALES: 1, ADMIN: 2, OWNER: 3 };

export function hasRole(actual: Role, required: Role) {
  return RANK[actual] >= RANK[required];
}

/** What each role may do. Server actions check these; the UI only hides controls. */
export const PERMISSIONS = {
  "lead.read": "VIEWER",
  "lead.edit": "SALES",
  "lead.message": "SALES",
  "lead.takeover": "SALES",
  "lead.delete": "ADMIN",
  "lead.export": "ADMIN",
  "demo.regenerate": "SALES",
  "demo.approve": "ADMIN",
  "demo.send": "SALES",
  "template.manage": "ADMIN",
  "followup.manage": "ADMIN",
  "deal.edit": "SALES",
  "deal.customPrice": "ADMIN",
  "payment.verify": "ADMIN",
  "settings.manage": "ADMIN",
  "automation.killSwitch": "ADMIN",
  "jobs.retry": "ADMIN",
  "users.manage": "OWNER",
  "audit.read": "ADMIN",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission) {
  return hasRole(role, PERMISSIONS[permission]);
}
