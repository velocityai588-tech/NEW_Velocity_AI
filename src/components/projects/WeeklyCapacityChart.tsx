import React, { useState, useEffect } from 'react';
import { Calendar, Users, TrendingUp, BarChart3 } from 'lucide-react';

interface WeeklyCapacityData {
  week: number;
  startDate: string;
  endDate: string;
  hoursSpent: number;
  hoursNotSpent: number;
  totalCapacity: number;
  utilizationPercent: number;
}

interface CapacityUtilizationChartProps {
  employees?: string[];
  jiraIssues?: any[];
}

const TOTAL_EMPLOYEES = 10;
const WORKING_HOURS_PER_WEEK = 56; // 8 hours/day × 7 days, but only counted as 5 working days = 40 actual hours, let's use 56 as specified
const TOTAL_WEEKLY_CAPACITY = TOTAL_EMPLOYEES * WORKING_HOURS_PER_WEEK;

// Generate dates for 8 weeks
const generateEightWeeks = (startDate: Date): WeeklyCapacityData[] => {
  const weeks: WeeklyCapacityData[] = [];
  
  for (let i = 0; i < 8; i++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + i * 7);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    // Mock data for now - in real scenario, fetch from JIRA
    // Generate hoursSpent between 60% and 90% of 560 (336 to 504)
    const utilizationRate = 0.6 + Math.random() * 0.3;
    const hoursSpent = Math.round(TOTAL_WEEKLY_CAPACITY * utilizationRate);
    // IMPORTANT: hoursNotSpent MUST be exactly (560 - hoursSpent) to ensure sum equals 560
    const hoursNotSpent = TOTAL_WEEKLY_CAPACITY - hoursSpent;
    
    // Validation: Ensure they sum to 560
    const total = hoursSpent + hoursNotSpent;
    if (total !== TOTAL_WEEKLY_CAPACITY) {
      console.warn(`Week ${i + 1}: Total hours (${total}) does not equal ${TOTAL_WEEKLY_CAPACITY}`);
    }
    
    weeks.push({
      week: i + 1,
      startDate: weekStart.toISOString().split('T')[0],
      endDate: weekEnd.toISOString().split('T')[0],
      hoursSpent,
      hoursNotSpent,
      totalCapacity: TOTAL_WEEKLY_CAPACITY,
      utilizationPercent: Math.round((hoursSpent / TOTAL_WEEKLY_CAPACITY) * 100),
    });
  }
  
  return weeks;
};

// Format date for display
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Get month and year from date
const getMonthYear = (date: Date) => {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export const WeeklyCapacityChart: React.FC<CapacityUtilizationChartProps> = ({
  employees = [],
  jiraIssues = [],
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(0); // January
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [weeklyData, setWeeklyData] = useState<WeeklyCapacityData[]>([]);
  const [startDate, setStartDate] = useState<Date>(new Date(2024, 0, 1));

  useEffect(() => {
    const newStartDate = new Date(selectedYear, selectedMonth, 1);
    setStartDate(newStartDate);
    const weeks = generateEightWeeks(newStartDate);
    setWeeklyData(weeks);
  }, [selectedMonth, selectedYear]);

  // Get array of years (current year ± 2)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Calculate average and total metrics
  const avgUtilization = Math.round(
    weeklyData.reduce((sum, w) => sum + w.utilizationPercent, 0) / weeklyData.length
  );
  const totalHoursSpent = weeklyData.reduce((sum, w) => sum + w.hoursSpent, 0);
  const totalCapacity = weeklyData.length * TOTAL_WEEKLY_CAPACITY;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          <h2 className="text-xl font-semibold text-gray-900">8-Week Capacity Utilization</h2>
        </div>
        <p className="text-sm text-gray-600">
          Track team capacity across {TOTAL_EMPLOYEES} employees over 8 weeks
        </p>
      </div>

      {/* Date Selection */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          <Calendar className="w-4 h-4 inline mr-2" />
          Select Starting Month and Year
        </label>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-2">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {months.map((month, index) => (
                <option key={month} value={index}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-600 mb-2">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Showing data from {getMonthYear(startDate)}
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
          <p className="text-xs text-gray-600 font-medium mb-1">Total Capacity</p>
          <p className="text-2xl font-bold text-blue-700">{totalCapacity.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">hours over 8 weeks</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-100">
          <p className="text-xs text-gray-600 font-medium mb-1">Hours Spent</p>
          <p className="text-2xl font-bold text-green-700">{totalHoursSpent.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">allocated to work</p>
        </div>
        <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
          <p className="text-xs text-gray-600 font-medium mb-1">Avg Utilization</p>
          <p className="text-2xl font-bold text-indigo-700">{avgUtilization}%</p>
          <p className="text-xs text-gray-500 mt-1">across all weeks</p>
        </div>
      </div>

      {/* Chart Legend */}
      <div className="flex gap-6 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span className="text-sm text-gray-700">Hours Spent</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-300 rounded"></div>
          <span className="text-sm text-gray-700">Hours Not Spent</span>
        </div>
      </div>

      {/* Stacked Bar Chart */}
      <div className="space-y-4">
        {weeklyData.map((week) => {
          const spentPercent = (week.hoursSpent / week.totalCapacity) * 100;
          const notSpentPercent = (week.hoursNotSpent / week.totalCapacity) * 100;

          return (
            <div key={week.week} className="space-y-1">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium text-sm text-gray-900">
                  Week {week.week}
                </h3>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-900">
                    {formatDate(week.startDate)} - {formatDate(week.endDate)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {week.hoursSpent}/{week.totalCapacity}h ({week.utilizationPercent}%)
                  </p>
                </div>
              </div>
              
              {/* Stacked Bar */}
              <div className="flex h-10 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                {/* Hours Spent */}
                <div
                  className="bg-gradient-to-r from-green-400 to-green-500 flex items-center justify-center transition-all duration-300 hover:from-green-500 hover:to-green-600"
                  style={{ width: `${spentPercent}%` }}
                  title={`${week.hoursSpent}h spent out of 560h total`}
                >
                  {spentPercent > 10 && (
                    <span className="text-white text-xs font-semibold">
                      {week.hoursSpent}h
                    </span>
                  )}
                </div>
                
                {/* Hours Not Spent */}
                <div
                  className="bg-gray-300 flex items-center justify-center transition-all duration-300 hover:bg-gray-400"
                  style={{ width: `${notSpentPercent}%` }}
                  title={`${week.hoursNotSpent}h not spent out of 560h total`}
                >
                  {notSpentPercent > 10 && (
                    <span className="text-gray-700 text-xs font-semibold">
                      {week.hoursNotSpent}h
                    </span>
                  )}
                </div>
              </div>
              
              {/* Validation: Show sum verification */}
              <div className="text-xs text-gray-500">
                Total: {week.hoursSpent}h + {week.hoursNotSpent}h = {week.hoursSpent + week.hoursNotSpent}h ✓
              </div>

              {/* Status Indicator */}
              <div className="flex gap-2">
                <div className="text-xs">
                  {week.utilizationPercent >= 85 ? (
                    <span className="px-2 py-1 bg-red-50 text-red-700 rounded font-medium">
                      High Load
                    </span>
                  ) : week.utilizationPercent >= 70 ? (
                    <span className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded font-medium">
                      Good Utilization
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-green-50 text-green-700 rounded font-medium">
                      Optimal
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Users className="w-4 h-4" />
          <span>
            Based on {TOTAL_EMPLOYEES} employees × {WORKING_HOURS_PER_WEEK} working hours/week = {TOTAL_WEEKLY_CAPACITY} total capacity hours
          </span>
        </div>
      </div>
    </div>
  );
};

export default WeeklyCapacityChart;
