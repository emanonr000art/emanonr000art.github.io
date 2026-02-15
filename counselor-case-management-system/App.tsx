
import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  Users, 
  Calendar as CalendarIcon, 
  PieChart, 
  Settings as SettingsIcon,
  Menu,
  X,
  Database
} from 'lucide-react';
import { AppState } from './types';
import { loadData, saveData } from './store';

// Pages
import CalendarView from './pages/CalendarView';
import ClientList from './pages/ClientList';
import ClientDetail from './pages/ClientDetail';
import StatsView from './pages/StatsView';
import SettingsView from './pages/SettingsView';

const NavItem: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
        isActive 
          ? 'bg-blue-600 text-white' 
          : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </Link>
  );
};

function App() {
  const [state, setState] = useState<AppState>(loadData());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Sync state to local storage whenever it changes
  useEffect(() => {
    saveData(state);
  }, [state]);

  // Stable reference for state updates
  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState(prev => updater(prev));
  }, []);

  return (
    <HashRouter>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        {/* Sidebar */}
        <aside 
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 lg:relative lg:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex flex-col h-full">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-8">
                <div className="bg-blue-600 p-2 rounded-lg">
                  <Database className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-xl font-bold tracking-tight">CaseManager</h1>
              </div>

              <nav className="space-y-2">
                <NavItem to="/" icon={<CalendarIcon className="w-5 h-5" />} label="周日历" />
                <NavItem to="/clients" icon={<Users className="w-5 h-5" />} label="个案管理" />
                <NavItem to="/stats" icon={<PieChart className="w-5 h-5" />} label="统计分析" />
                <NavItem to="/settings" icon={<SettingsIcon className="w-5 h-5" />} label="系统设置" />
              </nav>
            </div>
            
            <div className="mt-auto p-6 border-t border-gray-100">
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">数据导出</div>
              <p className="text-xs text-gray-500 mb-4">定期备份以确保数据安全</p>
              <Link to="/settings" className="block text-sm text-blue-600 font-semibold hover:underline">
                立即备份
              </Link>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 shrink-0">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-2 text-gray-600"
            >
              {isSidebarOpen ? <X /> : <Menu />}
            </button>
            
            <div className="flex-1 px-4">
              <div className="max-w-xl relative">
                <input 
                  type="text" 
                  placeholder="搜索个案..." 
                  className="w-full bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 rounded-full px-10 py-2 text-sm transition-all"
                />
                <Users className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8">
            <Routes>
              <Route path="/" element={<CalendarView state={state} updateState={updateState} />} />
              <Route path="/clients" element={<ClientList state={state} updateState={updateState} />} />
              <Route path="/clients/:id" element={<ClientDetail state={state} updateState={updateState} />} />
              <Route path="/stats" element={<StatsView state={state} updateState={updateState} />} />
              <Route path="/settings" element={<SettingsView state={state} updateState={updateState} />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  );
}

export default App;
