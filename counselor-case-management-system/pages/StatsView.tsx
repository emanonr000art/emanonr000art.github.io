
import React, { useMemo, useState, useEffect } from 'react';
import { AppState, AppointmentStatus } from '../types';
import { getClientStats } from '../store';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, startOfWeek, endOfWeek } from 'date-fns';
import { Edit2, Check, X as XIcon } from 'lucide-react';

interface StatsViewProps {
  state: AppState;
  updateState: (updater: (prev: AppState) => AppState) => void;
}

const StatsView: React.FC<StatsViewProps> = ({ state, updateState }) => {
  const [isEditingGlobalHours, setIsEditingGlobalHours] = useState(false);
  const [tempHourAdjustment, setTempHourAdjustment] = useState(state.settings.globalHourAdjustment);

  // Sync temp value when state updates
  useEffect(() => {
    setTempHourAdjustment(state.settings.globalHourAdjustment);
  }, [state.settings.globalHourAdjustment]);

  const completedAppts = state.appointments.filter(a => a.status === AppointmentStatus.Completed);
  
  const now = new Date();
  const thisMonth = { start: startOfMonth(now), end: endOfMonth(now) };
  const thisWeek = { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };

  const monthCompleted = completedAppts.filter(a => isWithinInterval(a.startAt, thisMonth));
  const weekCompleted = completedAppts.filter(a => isWithinInterval(a.startAt, thisWeek));

  // Calculate base system hours from completed sessions across all clients
  const baseSystemHours = useMemo(() => {
    let sum = 0;
    state.clients.forEach(c => {
      const stats = getClientStats(state, c.id);
      sum += stats.totalHours;
    });
    // Subtract the global adjustment from the sum because getClientStats doesn't include it anyway
    return sum;
  }, [state.clients, state.appointments]);

  const totalSystemHours = baseSystemHours + state.settings.globalHourAdjustment;

  const handleSaveGlobalHours = () => {
    if (typeof updateState !== 'function') {
      console.error('updateState is not a function in StatsView');
      return;
    }
    updateState(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        globalHourAdjustment: tempHourAdjustment
      }
    }));
    setIsEditingGlobalHours(false);
  };

  // Client distribution data
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    state.clients.forEach(c => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [state.clients]);

  // Daily volume this week
  const weeklyDailyData = useMemo(() => {
    const days = eachDayOfInterval(thisWeek);
    return days.map(day => {
      const count = weekCompleted.filter(a => format(a.startAt, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')).length;
      return {
        name: format(day, 'EEE'),
        count
      };
    });
  }, [weekCompleted]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#6b7280', '#8b5cf6'];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">统计分析</h1>
          <p className="text-gray-500">了解你的咨询工作量和个案分布</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm group relative min-h-[140px]">
          <p className="text-sm font-medium text-gray-500 mb-1">系统总咨询时长</p>
          {isEditingGlobalHours ? (
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  value={tempHourAdjustment + baseSystemHours}
                  onChange={(e) => setTempHourAdjustment(Number(e.target.value) - baseSystemHours)}
                  className="w-full bg-white border border-blue-300 rounded px-2 py-1 text-xl font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <span className="text-sm text-gray-400">h</span>
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={handleSaveGlobalHours} 
                  className="flex-1 bg-blue-600 text-white text-xs py-1.5 rounded hover:bg-blue-700 flex items-center justify-center gap-1"
                >
                  <Check className="w-3 h-3" /> 确认
                </button>
                <button 
                  onClick={() => setIsEditingGlobalHours(false)} 
                  className="flex-1 bg-gray-100 text-gray-600 text-xs py-1.5 rounded hover:bg-gray-200 flex items-center justify-center gap-1"
                >
                  <XIcon className="w-3 h-3" /> 取消
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <p className="text-3xl font-bold text-blue-600">
                {totalSystemHours} 
                <span className="text-sm font-normal text-gray-400 ml-1">小时</span>
              </p>
              <button 
                onClick={() => {
                  setTempHourAdjustment(state.settings.globalHourAdjustment);
                  setIsEditingGlobalHours(true);
                }}
                className="opacity-0 group-hover:opacity-100 absolute -top-1 -right-1 p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                title="手动修正总时长"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <p className="text-[10px] text-gray-400 mt-2 block">包含 {state.settings.globalHourAdjustment}h 系统修正值</p>
            </div>
          )}
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-500 mb-1">今日完成</p>
          <p className="text-3xl font-bold text-gray-900">
            {completedAppts.filter(a => format(a.startAt, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')).length} 
            <span className="text-sm font-normal text-gray-400 ml-1">节</span>
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-500 mb-1">本周完成</p>
          <p className="text-3xl font-bold text-gray-900">
            {weekCompleted.length} 
            <span className="text-sm font-normal text-gray-400 ml-1">节</span>
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-500 mb-1">本月完成</p>
          <p className="text-3xl font-bold text-gray-900">
            {monthCompleted.length} 
            <span className="text-sm font-normal text-gray-400 ml-1">节</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm h-[400px]">
          <h3 className="font-bold text-gray-800 mb-6">个案状态分布</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" className="text-xs font-bold fill-gray-500">
                  总个案: {state.clients.length}
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm h-[400px]">
          <h3 className="font-bold text-gray-800 mb-6">本周咨询量趋势</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyDailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsView;
