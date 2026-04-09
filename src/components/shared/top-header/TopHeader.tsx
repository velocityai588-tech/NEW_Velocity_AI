import React, { useState, useEffect } from 'react';
import { Bell, ChevronRight } from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { NotificationDropdown } from './NotificationDropdown';
import { getNotifications } from '@/services/dashboardService';
import { PresenceIndicator } from '@/components/PresenceIndicator';

interface TopHeaderProps {
    activeLabel: string;
    actions?: React.ReactNode;
}

export const TopHeader = ({ activeLabel, actions }: TopHeaderProps) => {
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await getNotifications();
                const mapped = data.map((n: any) => ({
                    id: n.id,
                    title: n.type === 'suggestion' ? '🤖 AI Task Suggestion' : 'Leave Request',
                    description: n.message,
                    time: n.date ? new Date(n.date).toLocaleDateString() : '',
                    type: n.type === 'suggestion' ? 'suggestion' : 'warning',
                    taskName: n.message?.replace('AI extracted task: ', ''),
                    projectId: n.projectId,
                    suggestedUserId: n.suggestedUserId,
                    estimatedHours: n.estimatedHours,
                }));
                setNotifications(mapped);
            } catch (e) {
                console.warn('Failed to load notifications:', e);
            }
        };
        load();
        const interval = setInterval(load, 120000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="h-14 border-b border-[#E7E5E4]/60 flex items-center justify-between px-8 bg-[#F5F5F4]/90 backdrop-blur-md sticky top-0 z-30 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
                <div className="flex items-center text-sm text-[#A8A29E]">
                    <span className="font-normal tracking-tight">Velocity AI</span>
                    <ChevronRight className="h-3.5 w-3.5 mx-1.5 text-[#D6D3D1]" strokeWidth={1.5} />
                    <span className="text-[#1C1917] font-medium tracking-tight">{activeLabel}</span>
                </div>
            </div>

            {/* Global Search */}
            <GlobalSearch />

            {/* Right Actions */}
            <div className="flex items-center gap-4 relative">
                {actions}
                <PresenceIndicator />

                {/* Bell — with animated ping badge */}
                <button
                    className={`relative p-2 rounded-lg transition-all duration-200 border ${
                        isNotificationsOpen
                            ? 'bg-white shadow-sm border-[#E7E5E4] text-[#1C1917]'
                            : 'border-transparent hover:bg-white hover:shadow-sm hover:border-[#E7E5E4] text-[#78716C] hover:text-[#1C1917]'
                    }`}
                    onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                >
                    <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    {notifications.length > 0 && (
                        <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F43F5E] opacity-60" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F43F5E]" />
                        </span>
                    )}
                </button>

                {isNotificationsOpen && (
                    <NotificationDropdown
                        onClose={() => setIsNotificationsOpen(false)}
                        items={notifications}
                    />
                )}
            </div>
        </div>
    );
};
