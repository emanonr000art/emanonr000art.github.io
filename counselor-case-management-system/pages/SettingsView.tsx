
import React, { useState } from 'react';
import { AppState } from '../types';
import { 
  Download, 
  Settings as SettingsIcon, 
  Bell, 
  Lock, 
  HelpCircle, 
  Copy, 
  ExternalLink,
  Save,
  CheckCircle,
  FileJson,
  Hash
} from 'lucide-react';

interface SettingsViewProps {
  state: AppState;
  updateState: (updater: (prev: AppState) => AppState) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ state, updateState }) => {
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [settings, setSettings] = useState(state.settings);

  const handleSave = () => {
    updateState(prev => ({ ...prev, settings }));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `counselor_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const icsUrl = `http://localhost:${settings.icsPort}/calendar.ics`;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">系统设置</h1>
          <p className="text-gray-500">管理你的偏好和数据同步</p>
        </div>
        <button 
          onClick={handleSave}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl hover:bg-blue-700 shadow-md transition-all font-medium"
        >
          {saveSuccess ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saveSuccess ? '设置已保存' : '保存更改'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Sync Settings */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-bold flex items-center gap-2">
              <Bell className="w-5 h-5 text-blue-500" />
              日历同步 (ICS)
            </h3>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">启用 ICS 订阅地址</p>
                <p className="text-sm text-gray-500">允许外部日历应用（如 Apple 日历）订阅你的排班</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.icsEnabled} 
                  onChange={e => setSettings({ ...settings, icsEnabled: e.target.checked })}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            
            {settings.icsEnabled && (
              <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">本地监听端口</label>
                  <input 
                    type="number" 
                    value={settings.icsPort}
                    onChange={e => setSettings({ ...settings, icsPort: Number(e.target.value) })}
                    className="w-32 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-xs text-blue-700 font-bold uppercase tracking-wider mb-2">订阅链接</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white p-2 rounded border border-blue-200 text-blue-800 break-all">
                      {icsUrl}
                    </code>
                    <button 
                      onClick={() => navigator.clipboard.writeText(icsUrl)}
                      className="p-2 hover:bg-blue-100 rounded-lg text-blue-600"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-blue-600 flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />
                    请在手机或桌面日历应用中“通过 URL 订阅”。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Note Templates */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-bold flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-purple-500" />
              自动笔记模板
            </h3>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-500 mb-4">当预约标记为“已完成”时，系统将使用此模板自动创建 Markdown 笔记。</p>
            <textarea 
              value={settings.noteTemplate}
              onChange={e => setSettings({ ...settings, noteTemplate: e.target.value })}
              className="w-full h-48 p-4 font-mono text-xs bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="# 咨询记录模板..."
            />
          </div>
        </div>

        {/* Global Adjustment */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-bold flex items-center gap-2">
              <Hash className="w-5 h-5 text-blue-400" />
              统计时长修正
            </h3>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-500 mb-4">设置全局时长修正（小时）。此值将累加到所有个案时长总计中。</p>
            <div className="flex items-center gap-4">
              <input 
                type="number" 
                value={settings.globalHourAdjustment}
                onChange={e => setSettings({ ...settings, globalHourAdjustment: Number(e.target.value) })}
                className="w-32 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-400">小时修正</span>
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h3 className="font-bold flex items-center gap-2">
              <Lock className="w-5 h-5 text-green-500" />
              数据安全与导出
            </h3>
          </div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-medium">导出所有数据 (JSON)</p>
                <p className="text-sm text-gray-500">包含个案资料、预约记录及所有笔记内容</p>
              </div>
              <button 
                onClick={handleExport}
                className="flex items-center justify-center gap-2 bg-gray-900 text-white px-6 py-2 rounded-xl hover:bg-black transition-all font-medium"
              >
                <FileJson className="w-4 h-4" />
                立即导出
              </button>
            </div>
            
            <div className="mt-8 pt-6 border-t border-gray-100">
              <div className="p-4 bg-yellow-50 border border-yellow-100 rounded-xl flex gap-3">
                <HelpCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-bold mb-1">隐私提示</p>
                  <p>所有数据均存储在您的浏览器本地存储 (Local Storage) 中。清除浏览器缓存可能会导致数据丢失。请务必定期通过“导出”功能备份您的重要工作资料。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
