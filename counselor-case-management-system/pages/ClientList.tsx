
import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, MoreVertical, Calendar, Clock, Tag as TagIcon, X } from 'lucide-react';
import { AppState, Client, ClientStatus } from '../types';
import { uuid, getClientStats } from '../store';
import { STATUS_COLORS } from '../constants';
import { format } from 'date-fns';

interface ClientListProps {
  state: AppState;
  updateState: (updater: (prev: AppState) => AppState) => void;
}

const ClientList: React.FC<ClientListProps> = ({ state, updateState }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', status: ClientStatus.Potential, tags: '' });

  const filteredClients = useMemo(() => {
    return state.clients.filter(client => {
      const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          client.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [state.clients, searchTerm, statusFilter]);

  const handleAddClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name) return;

    // Support both English and Chinese commas
    const tags = newClient.tags
      .split(/[,，\s]+/)
      .map(t => t.trim())
      .filter(Boolean);

    const client: Client = {
      id: uuid(),
      name: newClient.name,
      status: newClient.status,
      tags: tags,
      manualSessionAdjustment: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    updateState(prev => ({
      ...prev,
      clients: [client, ...prev.clients]
    }));
    setIsModalOpen(false);
    setNewClient({ name: '', status: ClientStatus.Potential, tags: '' });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">个案管理</h1>
          <p className="text-gray-500">共 {state.clients.length} 位个案资料</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>新建个案</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="搜索姓名或标签..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <select 
              className="bg-white border border-gray-200 rounded-lg text-sm px-3 py-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">所有状态</option>
              {Object.values(ClientStatus).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-4">个案名称</th>
                <th className="px-6 py-4">状态</th>
                <th className="px-6 py-4">咨询次数</th>
                <th className="px-6 py-4">最近一次</th>
                <th className="px-6 py-4">下次预约</th>
                <th className="px-6 py-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredClients.map(client => {
                const stats = getClientStats(state, client.id);
                return (
                  <tr key={client.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <Link to={`/clients/${client.id}`} className="font-semibold text-blue-600 hover:underline">
                          {client.name}
                        </Link>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {client.tags.map(tag => (
                            <span key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[client.status]}`}>
                        {client.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-700">
                      {stats.totalSessions} 次
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {stats.lastSession ? format(stats.lastSession, 'yyyy-MM-dd') : '无记录'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {stats.nextSession ? (
                        <Link to="/" className="text-blue-600 hover:underline">
                          {format(stats.nextSession, 'MM-dd HH:mm')}
                        </Link>
                      ) : (
                        <button 
                          onClick={() => navigate('/')} 
                          className="text-gray-400 hover:text-blue-600 hover:underline italic"
                        >
                          未安排 (点击前往排班)
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Link to={`/clients/${client.id}`} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    未找到匹配的个案
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold">新建个案</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddClient} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名/代号 *</label>
                <input 
                  type="text" 
                  required
                  value={newClient.name}
                  onChange={e => setNewClient({ ...newClient, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="如：小张 或 Client-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">初始状态</label>
                <select 
                  value={newClient.status}
                  onChange={e => setNewClient({ ...newClient, status: e.target.value as ClientStatus })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {Object.values(ClientStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标签</label>
                <input 
                  type="text" 
                  value={newClient.tags}
                  onChange={e => setNewClient({ ...newClient, tags: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="标签，多个用逗号分隔（中英文皆可）"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 font-medium"
                >
                  取消
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  确认创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientList;
