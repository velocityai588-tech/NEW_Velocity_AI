import { useAuth } from "@/contexts/AuthContext";
import { useMemo } from "react";

export const usePermissions = (teamId?: string | null) => {
  const { userTeams, orgRole, activeTeamId } = useAuth();

  // Mapping of team_members.role to functional "Manager" status
  const MANAGER_ROLES = [
    'lead', 
    'Engineering Manager', 
    'Product Manager',
    'admin',
    'manager'
  ];

  const permissions = useMemo(() => {
    // 1. Check Org-level Admin bypass
    const isOrgAdmin = orgRole?.toLowerCase() === 'admin' || orgRole?.toLowerCase() === 'manager';

    // 2. Determine target team context
    const targetTeamId = teamId || activeTeamId;

    if (!targetTeamId) {
      return {
        isManager: isOrgAdmin,
        isEmployee: !isOrgAdmin,
        isOrgAdmin,
        teamRole: null,
      };
    }

    // 3. Find user's role in this specific team
    const teamMembership = userTeams.find(t => t.teamId === targetTeamId);
    const teamRole = teamMembership?.role?.toLowerCase() || '';

    const isTeamManager = MANAGER_ROLES.some(role => teamRole.includes(role.toLowerCase()));

    return {
      isManager: isOrgAdmin || isTeamManager,
      isEmployee: !isOrgAdmin && !isTeamManager,
      isOrgAdmin,
      teamRole,
      canManageTeam: isOrgAdmin || isTeamManager,
    };
  }, [userTeams, orgRole, activeTeamId, teamId]);

  return permissions;
};
