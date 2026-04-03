import { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  Zap,
  LayoutDashboard,
  Kanban,
  CalendarRange,
  User,
  Search,
  Bell,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { TeamSwitcher } from '@/components/shared/TeamSwitcher';

const navItems = [
  { path: '/app/employee/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { path: '/app/employee/my-projects', label: 'My Projects', Icon: Kanban },
  { path: '/app/employee/time', label: 'Time', Icon: CalendarRange },
  { path: '/app/employee/profile', label: 'My Profile', Icon: User },
];

export function EmployeeLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user, orgName } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [showLogout, setShowLogout] = useState(false);

  const activeItem = navItems.find((item) =>
    location.pathname.startsWith(item.path),
  );

  const displayName = user?.email?.split('@')[0] ?? 'Employee';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="flex h-screen bg-[#F5F5F4] font-['Inter',sans-serif] overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${collapsed ? 'w-[70px]' : 'w-[260px]'
          } bg-[#1C1917] flex flex-col py-6 z-40 flex-shrink-0 transition-all duration-300 [transition-timing-function:cubic-bezier(0.25,1,0.5,1)] border-r border-[#292524] shadow-2xl shadow-black/20`}
      >
        {/* Logo */}
        <div
          className={`mb-8 px-4 flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-6'
            }`}
        >
          <div className="bg-[#2DD4BF] rounded-lg p-1.5 flex-shrink-0 shadow-[0_0_15px_rgba(45,212,191,0.2)]">
            <Zap className="h-5 w-5 text-[#1C1917]" strokeWidth={2.5} />
          </div>
          {!collapsed && (
            <span className="text-white font-medium text-lg whitespace-nowrap overflow-hidden animate-in fade-in duration-300 tracking-tight">
              Velocity AI
            </span>
          )}
        </div>

        {/* Team Switcher */}
        <TeamSwitcher collapsed={collapsed} />

        {/* Nav Items */}
        <div className="flex-1 w-full flex flex-col gap-1 px-4">
          {navItems.map(({ path, label, Icon }) => {
            const isActive = location.pathname.startsWith(path);
            return (
              <button
                key={path}
                onClick={() => {
                  if (isActive) {
                    setCollapsed(!collapsed);
                  }
                  navigate(path);
                }}
                title={label}
                className={`w-full relative px-3 py-3 flex items-center ${collapsed ? 'justify-center' : 'gap-3'
                  } rounded-lg transition-all duration-200 outline-none ${isActive
                    ? 'bg-[#292524] text-white'
                    : 'text-[#A8A29E] hover:text-[#E7E5E4] hover:bg-[#292524]/50'
                  }`}
              >
                <Icon
                  className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive
                      ? 'text-[#2DD4BF]'
                      : 'text-[#78716C] group-hover:text-[#D6D3D1]'
                    }`}
                  strokeWidth={1.75}
                />
                {!collapsed && (
                  <span
                    className={`text-sm whitespace-nowrap overflow-hidden animate-in fade-in duration-300 ${isActive ? 'font-medium' : 'font-normal'
                      }`}
                  >
                    {label}
                  </span>
                )}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#2DD4BF] rounded-r-sm shadow-[0_0_10px_rgba(45,212,191,0.4)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom: logout + user */}
        <div className="w-full flex flex-col gap-1 px-4 mt-auto">
          {/* Logout */}
          <button
            className={`w-full relative px-3 py-3 flex items-center ${collapsed ? 'justify-center' : 'gap-3'
              } rounded-lg text-[#F43F5E] hover:bg-[#F43F5E]/10 transition-colors`}
            onClick={() => setShowLogout(true)}
            title="Log Out"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" strokeWidth={1.75} />
            {!collapsed && (
              <span className="text-sm font-normal whitespace-nowrap overflow-hidden animate-in fade-in duration-300">
                Log Out
              </span>
            )}
          </button>

          {/* User chip */}
          <div
            className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'
              } px-2 py-4 mt-2 border-t border-[#292524]`}
          >
            <div className="w-9 h-9 rounded-full bg-[#2DD4BF] flex items-center justify-center text-[#1C1917] font-medium text-xs flex-shrink-0 shadow-[0_0_10px_rgba(45,212,191,0.2)]">
              {initials}
            </div>
            {!collapsed && (
              <div className="flex flex-col whitespace-nowrap overflow-hidden animate-in fade-in duration-300">
                <span className="text-xs font-medium text-[#E7E5E4]">
                  {displayName}
                </span>
                {orgName && (
                  <span className="text-[10px] text-[#A8A29E]">{orgName}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F5F5F4] relative">
        {/* Subtle dot pattern */}
        <div
          className="absolute inset-0 pointer-events-none z-0 opacity-[0.05]"
          style={{
            backgroundImage: `radial-gradient(#A8A29E 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Top Header */}
        <div className="h-16 border-b border-[#E7E5E4] flex items-center justify-between px-8 bg-[#F5F5F4]/80 backdrop-blur-md sticky top-0 z-30 shadow-sm shadow-stone-200/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center text-sm text-[#78716C]">
              <span className="font-normal">Velocity AI</span>
              <ChevronRight className="h-4 w-4 mx-2 text-[#D6D3D1]" strokeWidth={1.5} />
              <span className="text-[#1C1917] font-medium">
                {activeItem?.label ?? 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex-1 max-w-xl mx-8">
            <div className="relative group">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#A8A29E] group-focus-within:text-[#1C1917] transition-colors"
                strokeWidth={1.75}
              />
              <Input
                placeholder="Search projects, tasks..."
                className="pl-10 h-10 bg-white border border-[#E7E5E4] rounded-lg text-sm focus:bg-white focus:border-[#2DD4BF] focus:ring-1 focus:ring-[#2DD4BF]/20 focus:shadow-sm transition-all placeholder:text-[#D6D3D1] font-light shadow-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-5">
            <button className="relative p-2 rounded-lg hover:bg-white text-[#78716C] transition-all hover:shadow-sm border border-transparent hover:border-[#E7E5E4]">
              <Bell className="h-5 w-5" strokeWidth={1.75} />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#F43F5E] rounded-full border border-[#F5F5F4]" />
            </button>
          </div>
        </div>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-10 z-10">
          <Outlet />
        </div>
      </div>

      {/* Logout Confirmation */}
      <AlertDialog open={showLogout} onOpenChange={setShowLogout}>
        <AlertDialogContent className="bg-white border border-[#E7E5E4]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1C1917] font-light">
              Log out of Velocity AI?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#78716C] font-light">
              You'll need to sign in again to access your workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#E7E5E4] text-[#57534E] hover:bg-[#FAFAF9] font-light">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowLogout(false);
                await signOut();
                navigate('/login');
              }}
              className="bg-[#F43F5E] hover:bg-[#E11D48] text-white font-light"
            >
              Log Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
