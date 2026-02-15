
import React, { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { 
  Plus, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle, 
  ChevronLeft, 
  ChevronRight,
  MoreVertical,
  RotateCcw,
  X,
  Trash2
} from 'lucide-react';
import { AppState, Appointment, AppointmentStatus, Client, FileCategory, FileEntry } from '../types';
import { uuid } from '../store';
import { APPOINTMENT_COLORS } from '../constants';
import { format, addMinutes, startOfDay } from 'date-fns';

interface CalendarViewProps {
  state: AppState;
  updateState: (updater: (prev: AppState) => AppState) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ state, updateState }) => {
  const calendarRef = useRef<FullCalendar>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [newAppt, setNewAppt] = useState<{ clientId: string; start: Date; duration: number }>({
    clientId: '',
    start: new Date(),
    duration: 50,
  });

  const events = state.appointments.map(appt => {
    const client = state.clients.find(c => c.id === appt.clientId);
    return {
      id: appt.id,
      title: client?.name || '未知个案',
      start: appt.startAt,
      end: appt.endAt,
      color: APPOINTMENT_COLORS[appt.status],
      extendedProps: { ...appt, clientName: client?.name }
    };
  });

  const handleDateSelect = (selectInfo: any) => {
    setNewAppt({
      clientId: '',
      start: selectInfo.start,
      duration: 50,
    });
    setSelectedAppt(null);
    setIsModalOpen(true);
  };

  const handleEventClick = (clickInfo: any) => {
    const appt = clickInfo.event.extendedProps as Appointment;
    setSelectedAppt(appt);
    setIsModalOpen(true);
  };

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppt.clientId) return;

    const startAt = newAppt.start.getTime();
    const endAt = addMinutes(newAppt.start, newAppt.duration).getTime();

    const appt: Appointment = {
      id: uuid(),
      clientId: newAppt.clientId,
      startAt,
      endAt,
      status: AppointmentStatus.Scheduled,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    updateState(prev => ({ ...prev, appointments: [...prev.appointments, appt] }));
    setIsModalOpen(false);
  };

  const updateApptStatus = (apptId: string, status: AppointmentStatus) => {
    updateState(prev => {
      const appt = prev.appointments.find(a => a.id === apptId);
      if (!appt) return prev;

      let newFiles = prev.files;
      // Auto-generate session note if completed
      if (status === AppointmentStatus.Completed && appt.status !== AppointmentStatus.Completed) {
        const alreadyHasNote = prev.files.some(f => f.relatedAppointmentId === apptId);
        if (!alreadyHasNote) {
          const client = prev.clients.find(c => c.id === appt.clientId);
          const newNote: FileEntry = {
            id: uuid(),
            clientId: appt.clientId,
            category: FileCategory.SessionNote,
            title: `${client?.name || '个案'} 记录 ${format(appt.startAt, 'yyyy-MM-dd HH-mm')}`,
            ext: 'md',
            content: prev.settings.noteTemplate || '',
            relatedAppointmentId: apptId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          newFiles = [newNote, ...prev.files];
        }
      }

      return {
        ...prev,
        appointments: prev.appointments.map(a => a.id === apptId ? { ...a, status, updatedAt: Date.now() } : a),
        files: newFiles
      };
    });
    setIsModalOpen(false);
  };

  const deleteAppt = (apptId: string) => {
    if (!window.confirm('确定要删除这次预约吗？')) return;
    updateState(prev => ({
      ...prev,
      appointments: prev.appointments.filter(a => a.id !== apptId)
    }));
    setIsModalOpen(false);
  };

  return (
    <div className="h-full flex flex-col space-y-4 max-h-full overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            排班日历
            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded uppercase tracking-widest">Weekly</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => handleDateSelect({ start: new Date() })}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm transition-all text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            快速排班
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden p-2 min-h-0">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridWeek,timeGridDay'
          }}
          locale="zh-cn"
          firstDay={1}
          slotMinTime="09:00:00"
          slotMaxTime="21:00:00"
          slotDuration="00:15:00"
          allDaySlot={false}
          editable={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={true}
          expandRows={true}
          height="100%"
          contentHeight="auto"
          stickyHeaderDates={true}
          handleWindowResize={true}
          events={events}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={(info) => {
            const apptId = info.event.id;
            updateState(prev => ({
              ...prev,
              appointments: prev.appointments.map(a => a.id === apptId ? {
                ...a,
                startAt: info.event.start?.getTime() || a.startAt,
                endAt: info.event.end?.getTime() || a.endAt,
                updatedAt: Date.now()
              } : a)
            }));
          }}
          eventResize={(info) => {
            const apptId = info.event.id;
            updateState(prev => ({
              ...prev,
              appointments: prev.appointments.map(a => a.id === apptId ? {
                ...a,
                startAt: info.event.start?.getTime() || a.startAt,
                endAt: info.event.end?.getTime() || a.endAt,
                updatedAt: Date.now()
              } : a)
            }));
          }}
        />
      </div>

      {/* Appointment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-xl font-bold">{selectedAppt ? '预约详情' : '新建预约'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {selectedAppt ? (
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">个案</p>
                    <p className="text-lg font-bold">{state.clients.find(c => c.id === selectedAppt.clientId)?.name || '未知'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" /> 日期
                    </p>
                    <p className="text-sm font-medium">{format(selectedAppt.startAt, 'yyyy-MM-dd')}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 时间
                    </p>
                    <p className="text-sm font-medium">{format(selectedAppt.startAt, 'HH:mm')} - {format(selectedAppt.endAt, 'HH:mm')}</p>
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">更新状态</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={() => updateApptStatus(selectedAppt.id, AppointmentStatus.Scheduled)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                        selectedAppt.status === AppointmentStatus.Scheduled ? 'bg-blue-50 border-blue-200 text-blue-600 ring-2 ring-blue-500/20' : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <RotateCcw className="w-4 h-4" />
                      待执行
                    </button>
                    <button 
                      onClick={() => updateApptStatus(selectedAppt.id, AppointmentStatus.Completed)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                        selectedAppt.status === AppointmentStatus.Completed ? 'bg-green-50 border-green-200 text-green-600 ring-2 ring-green-500/20' : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      已完成
                    </button>
                    <button 
                      onClick={() => updateApptStatus(selectedAppt.id, AppointmentStatus.Canceled)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                        selectedAppt.status === AppointmentStatus.Canceled ? 'bg-red-50 border-red-200 text-red-600 ring-2 ring-red-500/20' : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <XCircle className="w-4 h-4" />
                      已取消
                    </button>
                  </div>
                </div>

                <div className="pt-6 flex gap-3">
                  <button 
                    onClick={() => deleteAppt(selectedAppt.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                  >
                    关闭
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateAppointment} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">选择个案 *</label>
                  <select 
                    required
                    value={newAppt.clientId}
                    onChange={e => setNewAppt({ ...newAppt, clientId: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">-- 选择一个已有个案 --</option>
                    {state.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">开始时间</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      type="date"
                      value={format(newAppt.start, 'yyyy-MM-dd')}
                      onChange={e => {
                        const date = new Date(e.target.value);
                        date.setHours(newAppt.start.getHours());
                        date.setMinutes(newAppt.start.getMinutes());
                        setNewAppt({ ...newAppt, start: date });
                      }}
                      className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <input 
                      type="time"
                      value={format(newAppt.start, 'HH:mm')}
                      onChange={e => {
                        const [h, m] = e.target.value.split(':').map(Number);
                        const date = new Date(newAppt.start);
                        date.setHours(h);
                        date.setMinutes(m);
                        setNewAppt({ ...newAppt, start: date });
                      }}
                      className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">预计时长 (分钟)</label>
                  <input 
                    type="number"
                    value={newAppt.duration}
                    onChange={e => setNewAppt({ ...newAppt, duration: Number(e.target.value) })}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none"
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
