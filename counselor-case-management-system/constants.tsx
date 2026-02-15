
import React from 'react';

export const STATUS_COLORS: Record<string, string> = {
  Potential: 'bg-blue-100 text-blue-800 border-blue-200',
  Active: 'bg-green-100 text-green-800 border-green-200',
  Paused: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Closed: 'bg-gray-100 text-gray-800 border-gray-200',
  Referred: 'bg-purple-100 text-purple-800 border-purple-200',
};

export const APPOINTMENT_COLORS: Record<string, string> = {
  Scheduled: '#3b82f6', // blue-500
  Completed: '#10b981', // green-500
  Canceled: '#ef4444',  // red-500
};

export const DEFAULT_NOTE_TEMPLATE = `
# 咨询记录

## 目标
- 

## 过程与干预
- 

## 风险评估
- 

## 反思与作业
- 
`.trim();

export const INITIAL_STATE = {
  clients: [],
  appointments: [],
  recurringSeries: [],
  files: [],
  settings: {
    icsPort: 17777,
    icsEnabled: true,
    noteTemplate: DEFAULT_NOTE_TEMPLATE,
    globalHourAdjustment: 0,
  }
};
