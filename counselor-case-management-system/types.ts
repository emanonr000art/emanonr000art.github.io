
export enum ClientStatus {
  Potential = 'Potential',
  Active = 'Active',
  Paused = 'Paused',
  Closed = 'Closed',
  Referred = 'Referred'
}

export enum AppointmentStatus {
  Scheduled = 'Scheduled',
  Completed = 'Completed',
  Canceled = 'Canceled'
}

export enum FileCategory {
  SessionNote = 'SessionNote',
  Supervision = 'Supervision',
  Assessment = 'Assessment'
}

export interface Client {
  id: string;
  name: string;
  status: ClientStatus;
  tags: string[];
  notes?: string;
  manualSessionAdjustment: number; // For overriding/adjusting session counts
  createdAt: number;
  updatedAt: number;
}

export interface Appointment {
  id: string;
  clientId: string;
  startAt: number;
  endAt: number;
  status: AppointmentStatus;
  recurringSeriesId?: string;
  originalInstanceAt?: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RecurringSeries {
  id: string;
  clientId: string;
  rrule: string; // RFC5545
  dtstart: number;
  durationMin: number;
  untilAt?: number;
  count?: number;
  createdAt: number;
  updatedAt: number;
}

export interface FileEntry {
  id: string;
  clientId: string;
  category: FileCategory;
  title: string;
  ext: string;
  content: string; // Base64 for binary, plain text for MD
  relatedAppointmentId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppState {
  clients: Client[];
  appointments: Appointment[];
  recurringSeries: RecurringSeries[];
  files: FileEntry[];
  settings: {
    icsPort: number;
    icsEnabled: boolean;
    noteTemplate: string;
    globalHourAdjustment: number; // For overriding/adjusting total system hours
  };
}
