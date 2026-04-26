<template>
  <div class="h-full flex flex-col bg-base-100 rounded-xl shadow-sm border border-base-200 overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-base-200 flex items-center justify-between bg-base-50/50">
      <h3 class="font-bold text-xl flex items-center gap-3">
        <i class="fas fa-cog text-primary"></i>
        全局配置
      </h3>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <form @submit.prevent="handleSave" class="max-w-3xl mx-auto space-y-8">
        
        <!-- 站点标识说明（使用 DbOption.location，无需在此配置） -->
        <div class="bg-blue-50 p-4 rounded-xl border border-blue-200">
          <div class="flex items-start gap-3">
            <i class="fas fa-info-circle text-blue-500 mt-0.5"></i>
            <div>
              <p class="text-sm text-blue-800 font-medium">站点标识</p>
              <p class="text-xs text-blue-600 mt-1">
                当前站点标识由配置文件 DbOption.toml 中的 <code class="bg-blue-100 px-1 rounded">location</code> 字段统一管理，
                请在"站点配置管理"页面修改。
              </p>
            </div>
          </div>
        </div>

        <!-- Auto Detection Section -->
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl border border-base-200 shadow-sm">
          <h4 class="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
            <i class="fas fa-search text-blue-500"></i> 自动检测
          </h4>
          
          <div class="form-control mb-6">
            <label class="label cursor-pointer justify-start gap-4">
              <input
                type="checkbox"
                v-model="formData.autoDetect"
                class="toggle toggle-primary"
              />
              <div>
                <span class="label-text font-semibold text-base">启用自动检测</span>
                <p class="text-xs text-slate-500 mt-0.5">
                  定期扫描所有纳管站点的文件变更
                </p>
              </div>
            </label>
          </div>

          <div class="form-control max-w-md pl-14">
            <label class="label">
              <span class="label-text font-medium">检测间隔（分钟）</span>
              <span class="badge badge-ghost">{{ formData.detectionInterval }} min</span>
            </label>
            <input
              type="range"
              v-model.number="formData.detectionInterval"
              min="1"
              max="60"
              class="range range-primary range-sm"
              :disabled="!formData.autoDetect"
            />
            <div class="w-full flex justify-between text-xs px-1 mt-1 text-slate-400">
              <span>1m</span>
              <span>15m</span>
              <span>30m</span>
              <span>60m</span>
            </div>
          </div>
        </div>

        <!-- Sync Settings Section -->
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl border border-base-200 shadow-sm">
          <h4 class="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
            <i class="fas fa-sync text-green-500"></i> 同步策略
          </h4>
          
          <div class="form-control mb-6">
            <label class="label cursor-pointer justify-start gap-4">
              <input
                type="checkbox"
                v-model="formData.autoSync"
                class="toggle toggle-success"
              />
              <div>
                <span class="label-text font-semibold text-base">启用自动同步</span>
                <p class="text-xs text-slate-500 mt-0.5">
                  检测到变更后自动触发同步任务
                </p>
              </div>
            </label>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pl-14">
            <div class="form-control">
              <label class="label">
                <span class="label-text font-medium">批量同步大小</span>
              </label>
              <div class="join">
                <input
                  type="number"
                  v-model.number="formData.batchSyncSize"
                  min="1"
                  max="100"
                  class="input input-bordered input-sm join-item w-24"
                  :disabled="!formData.autoSync"
                />
                <span class="btn btn-sm join-item no-animation bg-base-200 border-base-300">个文件</span>
              </div>
              <span class="text-xs text-error mt-1" v-if="errors.batchSyncSize">{{ errors.batchSyncSize }}</span>
            </div>

            <div class="form-control">
              <label class="label">
                <span class="label-text font-medium">最大并发站点数</span>
              </label>
              <div class="join">
                <input
                  type="number"
                  v-model.number="formData.maxConcurrentSyncs"
                  min="1"
                  max="10"
                  class="input input-bordered input-sm join-item w-24"
                />
                <span class="btn btn-sm join-item no-animation bg-base-200 border-base-300">个站点</span>
              </div>
              <span class="text-xs text-error mt-1" v-if="errors.maxConcurrentSyncs">{{ errors.maxConcurrentSyncs }}</span>
            </div>
          </div>
        </div>

        <!-- Notification & Logs Section -->
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl border border-base-200 shadow-sm">
          <h4 class="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
            <i class="fas fa-bell text-amber-500"></i> 通知与日志
          </h4>
          
          <div class="form-control mb-6">
            <label class="label cursor-pointer justify-start gap-4">
              <input
                type="checkbox"
                v-model="formData.enableNotifications"
                class="toggle toggle-warning"
              />
              <div>
                <span class="label-text font-semibold text-base">启用桌面通知</span>
                <p class="text-xs text-slate-500 mt-0.5">
                  任务完成或出错时发送浏览器通知
                </p>
              </div>
            </label>
          </div>

          <div class="form-control max-w-xs pl-14">
            <label class="label">
              <span class="label-text font-medium">日志保留策略</span>
            </label>
            <select
              v-model.number="formData.logRetentionDays"
              class="select select-bordered select-sm w-full"
            >
              <option :value="7">保留最近 7 天</option>
              <option :value="14">保留最近 14 天</option>
              <option :value="30">保留最近 30 天</option>
              <option :value="90">保留最近 90 天</option>
            </select>
          </div>
        </div>

        <!-- Status banners -->
        <div v-if="loadError" class="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          加载失败：{{ loadError }}
        </div>
        <div v-if="saveError" class="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          保存失败：{{ saveError }}
        </div>
        <div v-if="saveSuccess" class="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          配置已保存
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-3 pt-4 border-t border-base-200">
          <button type="button" @click="loadConfig" class="btn btn-ghost" :disabled="loading || saving">
            <i class="fas fa-sync mr-2" :class="{ 'fa-spin': loading }"></i>重新加载
          </button>
          <button type="button" @click="handleReset" class="btn btn-ghost" :disabled="saving">
            <i class="fas fa-undo mr-2"></i>重置更改
          </button>
          <button type="submit" class="btn btn-primary min-w-[120px]" :disabled="saving || loading">
            <i v-if="!saving" class="fas fa-save mr-2"></i>
            <span v-if="saving" class="loading loading-spinner loading-sm mr-2"></span>
            {{ saving ? '正在保存...' : '保存配置' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { syncApi } from '@/api';

interface SettingsFormData {
  autoDetect: boolean;
  detectionInterval: number;
  autoSync: boolean;
  batchSyncSize: number;
  enableNotifications: boolean;
  logRetentionDays: number;
  maxConcurrentSyncs: number;
}

type SettingsErrors = Partial<Record<keyof SettingsFormData, string>>;

const DEFAULTS: Readonly<SettingsFormData> = Object.freeze({
  autoDetect: false,
  detectionInterval: 30,
  autoSync: false,
  batchSyncSize: 10,
  enableNotifications: false,
  logRetentionDays: 30,
  maxConcurrentSyncs: 3,
});

const formData = ref<SettingsFormData>({ ...DEFAULTS });
const lastLoadedSnapshot = ref<SettingsFormData>({ ...DEFAULTS });
const errors = ref<SettingsErrors>({});

const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const saveError = ref('');
const saveSuccess = ref(false);

// 后端字段（snake_case）↔ 前端字段（camelCase）映射
const FIELD_MAP: Record<keyof SettingsFormData, string> = {
  autoDetect: 'auto_detect',
  detectionInterval: 'detection_interval_minutes',
  autoSync: 'auto_sync',
  batchSyncSize: 'batch_sync_size',
  enableNotifications: 'enable_notifications',
  logRetentionDays: 'log_retention_days',
  maxConcurrentSyncs: 'max_concurrent_syncs',
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function fromBackend(raw: unknown): SettingsFormData {
  if (!isPlainObject(raw)) return { ...DEFAULTS };
  // 后端返回可能直接是 config 对象，也可能套一层 { config: {...} }
  const src: Record<string, unknown> = isPlainObject(raw.config) ? raw.config : raw;
  const out: SettingsFormData = { ...DEFAULTS };
  (Object.entries(FIELD_MAP) as [keyof SettingsFormData, string][]).forEach(([uiKey, beKey]) => {
    const candidate = src[uiKey] !== undefined ? src[uiKey] : src[beKey];
    if (candidate === undefined) return;
    // 数值字段：保留 number；布尔字段：保留 boolean。其余忽略，使用默认值。
    const defaultVal = DEFAULTS[uiKey];
    if (typeof defaultVal === 'number' && typeof candidate === 'number') {
      out[uiKey] = candidate as never;
    } else if (typeof defaultVal === 'boolean' && typeof candidate === 'boolean') {
      out[uiKey] = candidate as never;
    }
  });
  return out;
}

function toBackend(form: SettingsFormData): Record<string, unknown> {
  // 同时发送 snake_case + camelCase，向后端兼容（后端忽略多余字段）
  const out: Record<string, unknown> = {};
  (Object.entries(FIELD_MAP) as [keyof SettingsFormData, string][]).forEach(([uiKey, beKey]) => {
    out[beKey] = form[uiKey];
    out[uiKey] = form[uiKey];
  });
  return out;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

async function loadConfig(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  saveSuccess.value = false;
  try {
    const data = await syncApi.config();
    const normalized = fromBackend(data);
    formData.value = normalized;
    lastLoadedSnapshot.value = { ...normalized };
  } catch (err) {
    loadError.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

function validate(): boolean {
  errors.value = {};
  let isValid = true;
  if (formData.value.batchSyncSize < 1 || formData.value.batchSyncSize > 100) {
    errors.value.batchSyncSize = '批量大小必须在 1-100 之间';
    isValid = false;
  }
  if (formData.value.maxConcurrentSyncs < 1 || formData.value.maxConcurrentSyncs > 10) {
    errors.value.maxConcurrentSyncs = '并发数必须在 1-10 之间';
    isValid = false;
  }
  return isValid;
}

async function handleSave(): Promise<void> {
  saveSuccess.value = false;
  saveError.value = '';
  if (!validate()) return;

  saving.value = true;
  try {
    if (formData.value.enableNotifications && 'Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    }
    await syncApi.updateConfig(toBackend(formData.value));
    lastLoadedSnapshot.value = { ...formData.value };
    saveSuccess.value = true;
  } catch (err) {
    saveError.value = errorMessage(err);
  } finally {
    saving.value = false;
  }
}

function handleReset(): void {
  formData.value = { ...lastLoadedSnapshot.value };
  errors.value = {};
  saveSuccess.value = false;
  saveError.value = '';
}

onMounted(loadConfig);
</script>
