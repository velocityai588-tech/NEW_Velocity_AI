import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  Sparkles,
  Users,
  Calendar,
  Settings,
  LogOut,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { TopHeader } from '@/components/shared/top-header/TopHeader';
import { TeamSwitcher } from '@/components/shared/TeamSwitcher';


interface VelocityAISidebarProps {
  children: React.ReactNode;
}

export const VelocityAISidebar = ({ children }: VelocityAISidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, user } = useAuth();

  // Initialize sidebarOpen from localStorage, default to true
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem('sidebarOpen');
    return stored !== null ? JSON.parse(stored) : true;
  });

  const [loggingOut, setLoggingOut] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');

  // Persist sidebar state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('sidebarOpen', JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  // Get user display name
  const getUserDisplayName = () => {
    if (!user) return 'User';

    if (user.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }

    if (user.email) {
      const namePart = user.email.split('@')[0];
      return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }

    return 'User';
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    const displayName = getUserDisplayName();
    return displayName
      .split(' ')
      .map((name: string) => name[0].toUpperCase())
      .join('')
      .slice(0, 2);
  };

  const navItems = [
    { id: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'projects', path: '/projects', label: 'Projects', icon: <Briefcase className="w-5 h-5" /> },
    { id: 'plan', path: '/plan', label: 'Plan', icon: <Sparkles className="w-5 h-5" /> },
    { id: 'people', path: '/people', label: 'People', icon: <Users className="w-5 h-5" /> },
    { id: 'leave', path: '/leave', label: 'Leave', icon: <Calendar className="w-5 h-5" /> },
  ];

  // Sync active section with URL
  useEffect(() => {
    if (location.pathname === '/settings') {
      setActiveSection('settings');
      return;
    }

    if (location.pathname === '/people') {
      setActiveSection('people');
      return;
    }

    if (location.pathname === '/plan') {
      setActiveSection('plan');
      return;
    }

    if (location.pathname === '/leave') {
      setActiveSection('leave');
      return;
    }

    if (location.pathname === '/velocity-ai') {
      setActiveSection('dashboard');
      return;
    }

    if (location.pathname.startsWith('/projects')) {
      setActiveSection('projects');
      return;
    }

    if (location.pathname === '/progress') {
      setActiveSection('plan');
      return;
    }
  }, [location.pathname, location.search]);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      localStorage.clear();
      navigate('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const handleNavClick = (item: any) => {
    // If clicking the same nav item, toggle sidebar
    if (activeSection === item.id) {
      setSidebarOpen(!sidebarOpen);
    }
    setActiveSection(item.id);
    navigate(item.path);
  };

  return (
    <div className="flex h-screen bg-[#F5F5F4] font-['Inter',sans-serif] overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? 'w-[260px]' : 'w-[70px]'} bg-[#1C1917] flex flex-col py-6 z-40 flex-shrink-0 transition-all duration-300 [transition-timing-function:cubic-bezier(0.25,1,0.5,1)] border-r border-[#292524] shadow-2xl shadow-black/20`}
      >
        {/* Logo Section */}
        <div className={`mb-8 px-6 flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'}`}>
          <div className="bg-[#2DD4BF] rounded-lg p-1.5 flex-shrink-0 shadow-[0_0_15px_rgba(45,212,191,0.2)] hover:animate-glow hover:shadow-[0_0_25px_rgba(45,212,191,0.4)] transition-all">
            <Zap className="w-5 h-5 text-[#1C1917]" fill="currentColor" />
          </div>
          {sidebarOpen && (
            <span className="text-white font-medium text-lg whitespace-nowrap overflow-hidden animate-in fade-in duration-300 tracking-tight">
              Velocity AI
            </span>
          )}
        </div>

        {/* Team Switcher */}
        <TeamSwitcher collapsed={!sidebarOpen} />

        {/* Navigation Items */}
        <div className="flex-1 w-full flex flex-col gap-1 px-4">
          {navItems.map((item, idx) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item)}
                className={`w-full relative px-3 py-3 flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'} rounded-xl group transition-all duration-200 outline-none hover-scale ${isActive ? 'bg-[#292524] text-white shadow-md' : 'text-[#A8A29E] hover:text-[#E7E5E4] hover:bg-[#292524]/50'
                  }`}
                title={item.label}
                style={{
                  animationDelay: `${(idx + 1) * 50}ms`
                }}
              >
                <div className={`${isActive ? 'text-[#2DD4BF]' : 'text-[#78716C] group-hover:text-[#D6D3D1]'} transition-all flex-shrink-0 duration-200`}>
                  {item.icon}
                </div>
                {sidebarOpen && (
                  <span className={`text-sm whitespace-nowrap overflow-hidden animate-in fade-in duration-300 ${isActive ? 'font-medium' : 'font-normal'}`}>
                    {item.label}
                  </span>
                )}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#2DD4BF] rounded-r-sm shadow-[0_0_10px_rgba(45,212,191,0.4)] animate-fade-in" />
                )}
              </button>
            );
          })}
        </div>

        {/* Settings & Logout */}
        <div className="w-full flex flex-col gap-1 px-4 mt-auto mb-4 border-t border-[#292524] pt-4">
          <button
            onClick={() => {
              setActiveSection('settings');
              navigate('/settings');
            }}
            className={`w-full relative px-3 py-3 flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'} rounded-xl group transition-all duration-200 outline-none hover-scale ${activeSection === 'settings' ? 'bg-[#292524] text-white shadow-md' : 'text-[#A8A29E] hover:text-[#E7E5E4] hover:bg-[#292524]/50'
              }`}
            title="Settings"
          >
            <Settings className={`w-5 h-5 flex-shrink-0 transition-all duration-200 group-hover:rotate-90 ${activeSection === 'settings' ? 'text-[#2DD4BF]' : 'text-[#78716C] group-hover:text-[#D6D3D1]'}`} />
            {sidebarOpen && (
              <span className={`text-sm whitespace-nowrap overflow-hidden animate-in fade-in duration-300 ${activeSection === 'settings' ? 'font-medium' : 'font-normal'}`}>
                Settings
              </span>
            )}
            {activeSection === 'settings' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#2DD4BF] rounded-r-sm shadow-[0_0_10px_rgba(45,212,191,0.4)] animate-fade-in" />
            )}
          </button>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className={`w-full relative px-3 py-3 flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'} rounded-xl transition-all duration-200 outline-none text-[#F43F5E] hover:bg-[#F43F5E]/10 hover-scale disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Log Out"
          >
            <LogOut className="w-5 h-5 flex-shrink-0 transition-transform" />
            {sidebarOpen && (
              <span className={`text-sm whitespace-nowrap overflow-hidden animate-in fade-in duration-300 font-normal`}>
                {loggingOut ? 'Logging Out...' : 'Log Out'}
              </span>
            )}
          </button>

          {/* User Profile */}
          <div className={`flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'} px-2 py-4 mt-2 border-t border-[#292524] hover-scale transition-all`}>
            <div className="w-9 h-9 rounded-lg bg-[#292524] flex items-center justify-center text-xs font-medium text-[#D6D3D1] flex-shrink-0 group-hover:bg-[#2DD4BF]/20 transition-colors">
              {getUserInitials()}
            </div>
            {sidebarOpen && (
              <div className="flex flex-col whitespace-nowrap overflow-hidden animate-in fade-in duration-300 min-w-0">
                <span className="text-xs font-medium text-[#E7E5E4] truncate">{getUserDisplayName()}</span>
                <span className="text-[10px] text-[#A8A29E] truncate">{user?.email || ''}</span>
              </div>
            )}
          </div>
        </div>


      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#F5F5F4]">
        <TopHeader
          activeLabel={navItems.find(n => n.id === activeSection)?.label || (activeSection === 'settings' ? 'Settings' : 'Dashboard')}
        />

        {/* Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#F5F5F4] relative overflow-auto">
          {/* Texture Overlay */}
          <div
            className="absolute inset-0 pointer-events-none z-0 opacity-[0.03]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />

          {/* Children Content */}
          <div className="flex-1 relative z-10 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};


