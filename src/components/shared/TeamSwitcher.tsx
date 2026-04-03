import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Users } from "lucide-react";

interface TeamSwitcherProps {
  collapsed?: boolean;
}

export function TeamSwitcher({ collapsed = false }: TeamSwitcherProps) {
  const { userTeams, activeTeamId, setActiveTeamId } = useAuth();

  if (userTeams.length === 0) return null;

  return (
    <div className={`px-4 mb-4 transition-all duration-300 ${collapsed ? 'px-2' : 'px-4'}`}>
      <Select value={activeTeamId || ""} onValueChange={(val) => setActiveTeamId(val)}>
        <SelectTrigger 
          className={`
            bg-[#292524]/50 border-none text-[#E7E5E4] h-11
            hover:bg-[#292524] hover:text-white transition-all
            ${collapsed ? 'w-10 px-0 justify-center' : 'w-full px-3'}
          `}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <Users className="h-4 w-4 text-[#2DD4BF] flex-shrink-0" strokeWidth={2} />
            {!collapsed && (
              <div className="flex flex-col items-start gap-0 overflow-hidden">
                <SelectValue placeholder="Select Team" />
              </div>
            )}
          </div>
        </SelectTrigger>
        <SelectContent className="bg-[#1C1917] border-[#292524] text-[#E7E5E4] shadow-2xl">
          {userTeams.map((team) => (
            <SelectItem 
              key={team.teamId} 
              value={team.teamId}
              className="focus:bg-[#292524] focus:text-white cursor-pointer py-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium leading-none">{team.teamName}</span>
                <span className="text-[10px] text-[#A8A29E] uppercase tracking-wider font-semibold">
                  {team.role}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
