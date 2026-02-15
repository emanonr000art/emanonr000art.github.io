
import { AppState, Client, Appointment, FileEntry, RecurringSeries, ClientStatus, AppointmentStatus, FileCategory } from './types';
import { INITIAL_STATE } from './constants';

const STORAGE_KEY = 'counselor_management_data';

export const loadData = (): AppState => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return INITIAL_STATE;
  try {
    const parsed = JSON.parse(saved);
    // Basic migration / validation
    if (parsed.settings && parsed.settings.globalHourAdjustment === undefined) {
      parsed.settings.globalHourAdjustment = 0;
    }
    if (parsed.clients) {
      parsed.clients = parsed.clients.map((c: any) => ({
        ...c,
        manualSessionAdjustment: c.manualSessionAdjustment || 0
      }));
    }
    return { ...INITIAL_STATE, ...parsed };
  } catch (e) {
    console.error("Failed to load state", e);
    return INITIAL_STATE;
  }
};

export const saveData = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

// Helper to generate unique IDs
export const uuid = () => Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

// Statistics Helpers
export const getClientStats = (state: AppState, clientId: string) => {
  const client = state.clients.find(c => c.id === clientId);
  const appts = state.appointments.filter(a => a.clientId === clientId);
  const completed = appts.filter(a => a.status === AppointmentStatus.Completed);
  const now = Date.now();
  const next = appts
    .filter(a => a.status === AppointmentStatus.Scheduled && a.startAt > now)
    .sort((a, b) => a.startAt - b.startAt)[0];
  const last = completed
    .sort((a, b) => b.startAt - a.startAt)[0];

  const adjustment = client?.manualSessionAdjustment || 0;

  return {
    totalSessions: completed.length + adjustment,
    totalHours: completed.length + adjustment, // PRD: 1 session = 1 hour
    lastSession: last?.startAt,
    nextSession: next?.startAt,
  };
};
