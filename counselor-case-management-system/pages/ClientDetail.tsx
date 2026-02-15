
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  FileText, 
  Folder, 
  Plus, 
  Save, 
  Trash2, 
  Download,
  Upload,
  Edit2,
  Check,
  X as XIcon,
  Clock,
  User
} from 'lucide-react';
import { AppState, Client, ClientStatus, FileCategory, FileEntry, AppointmentStatus } from '../types';
import { getClientStats, uuid } from '../store';
import { STATUS_COLORS } from '../constants';
import { format } from 'date-fns';

interface ClientDetailProps {
  state: AppState;
  updateState: (updater: (prev: AppState) => AppState) => void;
}

const ClientDetail: React.FC<ClientDetailProps> = ({ state, updateState }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const client = state.clients.find(c => c.id === id);

  const [activeCategory, setActiveCategory] = useState<FileCategory>(FileCategory.SessionNote);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [fileContent, setFileContent] = useState('');
  const [isEditingAdjustment, setIsEditingAdjustment] = useState(false);
  const [tempAdjustmentValue, setTempAdjustmentValue] = useState(0);
  
  const clientFiles = useMemo(() => {
    return state.files.filter(f => f.clientId === id).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [state.files, id]);

  const selectedFile = useMemo(() => {
    return state.files.find(f => f.id === selectedFileId);
  }, [state.files, selectedFileId]);

  if (!client) {
    return <div className="p-8 text-center">个案不存在</div>;
  }

  const stats = getClientStats(state, client.id);

  const handleUpdateClient = (updates: Partial<Client>) => {
    if (typeof updateState !== 'function') return;
    updateState(prev => ({
      ...prev,
      clients: prev.clients.map(c => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c)
    }));
  };

  const handleAddFile = (category: FileCategory) => {
    const title = category === FileCategory.SessionNote 
      ? `新咨询记录 ${format(new Date(), 'yyyy-MM-dd HH-mm')}`
      : category === FileCategory.Supervision 
      ? `新督导记录 ${format(new Date(), 'yyyy-MM-dd')}`
      : '未命名文件';

    const newFile: FileEntry = {
      id: uuid(),
      clientId: client.id,
      category,
      title,
      ext: 'md',
      content: state.settings.noteTemplate || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    updateState(prev => ({ ...prev, files: [newFile, ...prev.files] }));
    setSelectedFileId(newFile.id);
    setFileContent(newFile.content);
    setIsEditingFile(true);
  };

  const handleSaveFile = () => {
    if (!selectedFileId) return;
    updateState(prev => ({
      ...prev,
      files: prev.files.map(f => f.id === selectedFileId ? { ...f, content: fileContent, updatedAt: Date.now() } : f)
    }));
    setIsEditingFile(false);
  };

  const handleDeleteFile = (fileId: string) => {
    if (!window.confirm('确定要删除这个文件吗？')) return;
    updateState(prev => ({
      ...prev,
      files: prev.files.filter(f => f.id !== fileId)
    }));
    if (selectedFileId === fileId) {
      setSelectedFileId(null);
      setIsEditingFile(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, category: FileCategory) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const newFile: FileEntry = {
        id: uuid(),
        clientId: client.id,
        category,
        title: file.name.split('.')[0],
        ext: file.name.split('.').pop() || '',
        content: result,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      updateState(prev => ({ ...prev, files: [newFile, ...prev.files] }));
    };
    reader.readAsDataURL(file);
  };

  const handleAddTag = () => {
    const newTagsStr = prompt('输入新标签（多个请用逗号或空格分隔）');
    if (newTagsStr) {
      const newTags = newTagsStr.split(/[,，\s]+/).map(t => t.trim()).filter(Boolean);
      const combinedTags = Array.from(new Set([...client.tags, ...newTags]));
      handleUpdateClient({ tags: combinedTags });
    }
  };

  const handleSaveAdjustment = () => {
    const systemCount = state.appointments.filter(a => a.clientId === client.id && a.status === AppointmentStatus.Completed).length;
    handleUpdateClient({ manualSessionAdjustment: tempAdjustmentValue - systemCount });
    setIsEditingAdjustment(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/clients')}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {client.name}
              <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[client.status]}`}>
                {client.status}
              </span>
            </h1>
            <p className="text-sm text-gray-500">创建于 {format(client.createdAt, 'yyyy-MM-dd')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select 
            value={client.status}
            onChange={(e) => handleUpdateClient({ status: e.target.value as ClientStatus })}
            className="bg-white border border-gray-200 rounded-lg text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.values(ClientStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Basic Stats */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm space-y-4">
          <h3 className="font-bold flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-blue-500" />
            个案指标
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg group relative min-h-[80px]">
              <p className="text-xs text-gray-500 mb-1">累计咨询</p>
              {isEditingAdjustment ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1">
                    <input 
                      type="number"
                      value={tempAdjustmentValue}
                      onChange={(e) => setTempAdjustmentValue(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-blue-300 rounded px-1.5 py-1 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      autoFocus
                    />
                    <span className="text-xs text-gray-400">次</span>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={handleSaveAdjustment}
                      className="flex-1 bg-blue-600 text-white p-1 rounded hover:bg-blue-700 flex justify-center"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => setIsEditingAdjustment(false)}
                      className="flex-1 bg-gray-200 text-gray-600 p-1 rounded hover:bg-gray-300 flex justify-center"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-gray-800">{stats.totalSessions} <span className="text-xs font-normal text-gray-400">次</span></p>
                  <button 
                    onClick={() => {
                      setTempAdjustmentValue(stats.totalSessions);
                      setIsEditingAdjustment(true);
                    }} 
                    className="opacity-0 group-hover:opacity-100 p-1 text-blue-500 hover:bg-blue-50 rounded transition-all"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            <div className="p-3 bg-gray-50 rounded-lg min-h-[80px]">
              <p className="text-xs text-gray-500 mb-1">统计时长</p>
              <p className="text-xl font-bold text-gray-800">{stats.totalHours} <span className="text-xs font-normal text-gray-400">小时</span></p>
            </div>
          </div>
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">最近一次</span>
              <span className="font-medium">{stats.lastSession ? format(stats.lastSession, 'yyyy-MM-dd HH:mm') : '无记录'}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">下次预约</span>
              <button 
                onClick={() => navigate('/')} 
                className={`font-medium ${stats.nextSession ? 'text-blue-600 hover:underline' : 'text-gray-400 italic hover:text-blue-500'}`}
              >
                {stats.nextSession ? format(stats.nextSession, 'yyyy-MM-dd HH:mm') : '未安排 (点击设置)'}
              </button>
            </div>
          </div>
          
          <div className="pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">标签</label>
            <div className="flex flex-wrap gap-1.5">
              {client.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100 flex items-center gap-1">
                  {tag}
                  <button 
                    onClick={() => handleUpdateClient({ tags: client.tags.filter(t => t !== tag) })}
                    className="hover:text-red-500 font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button 
                onClick={handleAddTag}
                className="px-2 py-0.5 border border-dashed border-gray-300 text-gray-400 text-xs rounded-full hover:border-blue-500 hover:text-blue-500"
              >
                + 添加
              </button>
            </div>
          </div>
        </div>

        {/* Work Files Explorer */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
          <div className="flex border-b border-gray-100">
            {[
              { id: FileCategory.SessionNote, label: '咨询记录', icon: FileText },
              { id: FileCategory.Supervision, label: '督导笔记', icon: Folder },
              { id: FileCategory.Assessment, label: '测评资料', icon: Upload }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id as FileCategory);
                  setSelectedFileId(null);
                  setIsEditingFile(false);
                }}
                className={`flex-1 py-4 flex items-center justify-center gap-2 font-medium text-sm transition-all ${
                  activeCategory === cat.id 
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' 
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <cat.icon className="w-4 h-4" />
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* File Sidebar */}
            <div className="w-64 border-r border-gray-100 flex flex-col bg-gray-50/30 shrink-0">
              <div className="p-3">
                {activeCategory !== FileCategory.Assessment ? (
                  <button 
                    onClick={() => handleAddFile(activeCategory)}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 py-2 rounded-lg text-sm font-medium hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    新建{activeCategory === FileCategory.SessionNote ? '记录' : '笔记'}
                  </button>
                ) : (
                  <label className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 py-2 rounded-lg text-sm font-medium hover:border-blue-500 hover:text-blue-600 transition-all cursor-pointer shadow-sm">
                    <Upload className="w-4 h-4" />
                    上传文件
                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, FileCategory.Assessment)} />
                  </label>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {clientFiles
                  .filter(f => f.category === activeCategory)
                  .map(file => (
                    <div 
                      key={file.id}
                      onClick={() => {
                        setSelectedFileId(file.id);
                        setFileContent(file.content);
                        setIsEditingFile(false);
                      }}
                      className={`group p-2 rounded-lg cursor-pointer flex items-center justify-between text-sm transition-all ${
                        selectedFileId === file.id ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-gray-100'
                      }`}
                    >
                      <div className="truncate flex-1">
                        <p className="truncate font-medium">{file.title}</p>
                        <p className={`text-[10px] ${selectedFileId === file.id ? 'text-blue-100' : 'text-gray-400'}`}>
                          {format(file.updatedAt, 'yyyy/MM/dd HH:mm')}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(file.id);
                        }}
                        className={`p-1 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-black/10 ${
                          selectedFileId === file.id ? 'text-white' : 'text-gray-400'
                        }`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            {/* File Editor/Viewer */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              {selectedFile ? (
                <div className="h-full flex flex-col">
                  <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <h4 className="font-bold text-gray-800 truncate pr-4">{selectedFile.title}</h4>
                    <div className="flex gap-2">
                      {selectedFile.category !== FileCategory.Assessment && (
                        <>
                          {isEditingFile ? (
                            <button 
                              onClick={handleSaveFile}
                              className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700"
                            >
                              <Save className="w-4 h-4" />
                              保存
                            </button>
                          ) : (
                            <button 
                              onClick={() => setIsEditingFile(true)}
                              className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
                            >
                              <Edit2 className="w-4 h-4" />
                              编辑
                            </button>
                          )}
                        </>
                      )}
                      {selectedFile.category === FileCategory.Assessment && (
                        <a 
                          href={selectedFile.content} 
                          download={`${selectedFile.title}.${selectedFile.ext}`}
                          className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-200"
                        >
                          <Download className="w-4 h-4" />
                          下载
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-6">
                    {selectedFile.category === FileCategory.Assessment ? (
                      <div className="h-full flex flex-col items-center justify-center space-y-4 text-gray-400">
                        <Folder className="w-16 h-16 opacity-20" />
                        <p className="text-sm font-medium">该文件为附件，点击上方按钮下载查看</p>
                        <p className="text-xs">类型: {selectedFile.ext} | 大小估算: {Math.round(selectedFile.content.length * 0.75 / 1024)} KB</p>
                      </div>
                    ) : (
                      isEditingFile ? (
                        <textarea 
                          value={fileContent}
                          onChange={(e) => setFileContent(e.target.value)}
                          className="w-full h-full p-4 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                          placeholder="开始记录你的内容..."
                        />
                      ) : (
                        <div className="prose prose-blue max-w-none whitespace-pre-wrap text-gray-700 leading-relaxed text-sm">
                          {selectedFile.content || <span className="text-gray-300 italic">空文件内容</span>}
                        </div>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 space-y-2">
                  <FileText className="w-12 h-12 opacity-20" />
                  <p className="text-sm">选择一个文件开始查看或编辑</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientDetail;
