export type SyncStatus =
  | 'Idle'
  | 'Scanning'
  | 'ChangesDetected'
  | 'Syncing'
  | 'Completed'
  | 'Error'
  | string;

export type ChangeType = 'Added' | 'Modified' | 'Deleted' | string;

export interface Formatters {
  formatTime: (time: unknown) => string;
  formatSize: (bytes: unknown) => string;
  formatDuration: (seconds: unknown) => string;
  getStatusClass: (status: SyncStatus | null | undefined) => string;
  getStatusText: (status: SyncStatus | null | undefined) => string;
  getStatusIcon: (status: SyncStatus | null | undefined) => string;
  getChangeTypeClass: (type: ChangeType | null | undefined) => string;
  getChangeTypeLabel: (type: ChangeType | null | undefined) => string;
  getChangeTypeIcon: (type: ChangeType | null | undefined) => string;
}

const STATUS_CLASS_MAP: Readonly<Record<string, string>> = {
  Idle: 'status-idle',
  Scanning: 'status-scanning',
  ChangesDetected: 'status-changes-detected',
  Syncing: 'status-syncing',
  Completed: 'status-completed',
  Error: 'status-error',
};

const STATUS_TEXT_MAP: Readonly<Record<string, string>> = {
  Idle: '空闲',
  Scanning: '扫描中',
  ChangesDetected: '发现变更',
  Syncing: '同步中',
  Completed: '已完成',
  Error: '错误',
};

const STATUS_ICON_MAP: Readonly<Record<string, string>> = {
  Idle: 'fas fa-circle',
  Scanning: 'fas fa-spinner fa-spin',
  ChangesDetected: 'fas fa-exclamation-triangle',
  Syncing: 'fas fa-sync fa-spin',
  Completed: 'fas fa-check-circle',
  Error: 'fas fa-times-circle',
};

const CHANGE_CLASS_MAP: Readonly<Record<string, string>> = {
  Added: 'change-added',
  Modified: 'change-modified',
  Deleted: 'change-deleted',
};

const CHANGE_LABEL_MAP: Readonly<Record<string, string>> = {
  Added: '新增',
  Modified: '修改',
  Deleted: '删除',
};

const CHANGE_ICON_MAP: Readonly<Record<string, string>> = {
  Added: '➕',
  Modified: '✏️',
  Deleted: '🗑️',
};

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function useFormatters(): Formatters {
  const formatTime: Formatters['formatTime'] = (time) => {
    if (!time && time !== 0) return '--';
    const date = new Date(time as string | number);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSize: Formatters['formatSize'] = (bytes) => {
    const n = toNumber(bytes);
    if (n === null || n === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(n) / Math.log(k));
    const idx = Math.min(i, sizes.length - 1);
    return Math.round((n / Math.pow(k, idx)) * 100) / 100 + ' ' + sizes[idx];
  };

  const formatDuration: Formatters['formatDuration'] = (seconds) => {
    const n = toNumber(seconds);
    if (n === null) return '--';
    if (n < 60) return `${n} 秒`;
    if (n < 3600) return `${Math.floor(n / 60)} 分钟`;
    return `${Math.floor(n / 3600)} 小时 ${Math.floor((n % 3600) / 60)} 分钟`;
  };

  const getStatusClass: Formatters['getStatusClass'] = (status) =>
    (status && STATUS_CLASS_MAP[status as string]) || 'status-idle';

  const getStatusText: Formatters['getStatusText'] = (status) =>
    (status && STATUS_TEXT_MAP[status as string]) || (status ?? '') as string;

  const getStatusIcon: Formatters['getStatusIcon'] = (status) =>
    (status && STATUS_ICON_MAP[status as string]) || 'fas fa-circle';

  const getChangeTypeClass: Formatters['getChangeTypeClass'] = (type) =>
    (type && CHANGE_CLASS_MAP[type as string]) || '';

  const getChangeTypeLabel: Formatters['getChangeTypeLabel'] = (type) =>
    (type && CHANGE_LABEL_MAP[type as string]) || (type ?? '') as string;

  const getChangeTypeIcon: Formatters['getChangeTypeIcon'] = (type) =>
    (type && CHANGE_ICON_MAP[type as string]) || '';

  return {
    formatTime,
    formatSize,
    formatDuration,
    getStatusClass,
    getStatusText,
    getStatusIcon,
    getChangeTypeClass,
    getChangeTypeLabel,
    getChangeTypeIcon,
  };
}
