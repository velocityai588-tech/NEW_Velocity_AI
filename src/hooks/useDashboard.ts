import { useState, useEffect } from 'react';
import { DateRange } from 'react-day-picker';
import { getDashboardData, getGlobalSearchResults, getNotifications } from '@/services/dashboardService';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export const useDashboard = () => {
    const { activeTeamId } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState({ kpis: [], deadlines: [], gantt: [] });
    
    // Date Range State
    const [dateRangeParam, setDateRangeParam] = useState<string>('30');
    const [tempCustomRange, setTempCustomRange] = useState<DateRange | undefined>();
    const [appliedCustomRange, setAppliedCustomRange] = useState<DateRange | undefined>();
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState({ projects: [], users: [], tasks: [] });
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // Notifications State
    const [notifications, setNotifications] = useState<any[]>([]);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

    // Fetch Main Dashboard
    const fetchDashboard = async () => {
        setIsLoading(true);
        try {
            const endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            let startDate = new Date();

            if (dateRangeParam === 'custom') {
                startDate = appliedCustomRange?.from ? new Date(appliedCustomRange.from) : new Date();
                if (appliedCustomRange?.to) endDate.setTime(appliedCustomRange.to.getTime());
            } else {
                startDate.setDate(endDate.getDate() - parseInt(dateRangeParam || '30'));
            }
            startDate.setHours(0, 0, 0, 0);

            const result = await getDashboardData({ startDate, endDate, teamId: activeTeamId });
            setData(result as any);
            
            // Fetch notifications on load
            const notifs = await getNotifications();
            setNotifications(notifs);
        } catch (error) {
            toast.error("Failed to load dashboard data");
        } finally {
            setIsLoading(false);
        }
    };

    // Debounced Global Search
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchQuery.trim().length > 1) {
                const results = await getGlobalSearchResults(searchQuery);
                setSearchResults(results);
                setIsSearchOpen(true);
            } else {
                setIsSearchOpen(false);
            }
        }, 300); // Wait 300ms after user stops typing

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    // Refetch when applied dates change
    useEffect(() => {
        fetchDashboard();
    }, [dateRangeParam, appliedCustomRange, activeTeamId]);

    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    };

    return {
        ...data,
        isLoading,
        dateRangeParam,
        setDateRangeParam,
        tempCustomRange,
        setTempCustomRange,
        appliedCustomRange,
        setAppliedCustomRange,
        isCalendarOpen,
        setIsCalendarOpen,
        searchQuery,
        setSearchQuery,
        searchResults,
        isSearchOpen,
        setIsSearchOpen,
        notifications,
        isNotificationsOpen,
        setIsNotificationsOpen,
        markAllRead
    };
};