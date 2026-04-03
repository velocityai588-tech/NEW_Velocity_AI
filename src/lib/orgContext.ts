/**
 * Client-side organization context.
 * Stores the current user's active org_id so that all Supabase
 * queries are automatically scoped to the correct organization.
 *
 * Set once after login (from AuthContext), read by jiraDbClient
 * and other services that need tenant isolation.
 */

let _currentOrgId: string | null = null;

export function setCurrentOrgId(orgId: string | null) {
  _currentOrgId = orgId;
  if (orgId) {
    localStorage.setItem('velocity_org_id', orgId);
  } else {
    localStorage.removeItem('velocity_org_id');
  }
}

export function getCurrentOrgId(): string | null {
  if (_currentOrgId) return _currentOrgId;
  // Hydrate from localStorage on first access
  _currentOrgId = localStorage.getItem('velocity_org_id');
  return _currentOrgId;
}

export function clearCurrentOrg() {
  _currentOrgId = null;
  localStorage.removeItem('velocity_org_id');
  localStorage.removeItem('velocity_org_role');
  localStorage.removeItem('velocity_org_name');
  localStorage.removeItem('velocity_active_team_id');
}

// --- Org role (owner / manager / employee) ---

export function setCurrentOrgRole(role: string | null) {
  if (role) localStorage.setItem('velocity_org_role', role);
  else localStorage.removeItem('velocity_org_role');
}

export function getCurrentOrgRole(): string | null {
  return localStorage.getItem('velocity_org_role');
}

// --- Org name ---

export function setCurrentOrgName(name: string | null) {
  if (name) localStorage.setItem('velocity_org_name', name);
  else localStorage.removeItem('velocity_org_name');
}

export function getCurrentOrgName(): string | null {
  return localStorage.getItem('velocity_org_name');
}

// --- Active team ---

export function setCurrentTeamId(teamId: string | null) {
  if (teamId) localStorage.setItem('velocity_active_team_id', teamId);
  else localStorage.removeItem('velocity_active_team_id');
}

export function getCurrentTeamId(): string | null {
  return localStorage.getItem('velocity_active_team_id');
}
