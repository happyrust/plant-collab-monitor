<template>
  <div class="dashboard-card animate-fade-in-up">
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
      <div>
        <p class="text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold mb-1.5">归档管理</p>
        <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">CBA 文件列表</h2>
        <p class="text-sm text-slate-700 dark:text-slate-300">浏览并下载已生成的增量更新包文件。</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <!-- 筛选切换 -->
        <div class="form-control">
          <label class="label cursor-pointer gap-2">
            <span class="label-text text-sm text-slate-600 dark:text-slate-400">只显示当前站点</span>
            <input
              type="checkbox"
              v-model="filterByCurrentSite"
              @change="applyFilter"
              class="toggle toggle-primary toggle-sm"
            />
          </label>
        </div>
        <button
          @click="loadData"
          class="btn btn-sm btn-ghost gap-2"
          :class="{'loading': loading}"
        >
          <i v-if="!loading" class="fas fa-rotate"></i>
          刷新
        </button>
      </div>
    </div>

    <div v-if="loading && files.length === 0" class="text-center py-12">
      <span class="loading loading-spinner loading-lg text-primary"></span>
      <p class="mt-4 text-slate-500 font-medium">正在加载文件列表...</p>
    </div>

    <div v-else-if="files.length === 0" class="text-center py-12 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
      <p class="text-slate-500">
        {{ filterByCurrentSite ? '当前站点暂无归档文件' : '暂无归档文件' }}
      </p>
      <p v-if="filterByCurrentSite && allFiles.length > 0" class="text-xs text-slate-400 mt-2">
        共有 {{ allFiles.length }} 个文件，但都不属于当前站点
      </p>
    </div>

    <div v-else>
      <!-- 统计信息 -->
      <div v-if="allFiles.length > 0" class="mb-4 text-sm text-slate-600 dark:text-slate-400">
        <span class="badge badge-ghost">
          共 {{ allFiles.length }} 个文件
          <span v-if="filterByCurrentSite">，当前显示 {{ files.length }} 个（仅当前站点）</span>
        </span>
        <span v-if="currentSiteConfig?.location" class="badge badge-outline ml-2">
          当前站点: {{ currentSiteConfig.location }}
          <span v-if="currentSiteConfig.location_dbs?.length > 0">
            (DB: {{ currentSiteConfig.location_dbs.join(', ') }})
          </span>
        </span>
      </div>
      
      <div class="overflow-x-auto">
        <table class="table w-full">
          <thead>
            <tr>
              <th class="bg-slate-50 text-slate-600 dark:text-slate-400 font-bold">文件名</th>
              <th class="bg-slate-50 text-slate-600 dark:text-slate-400 font-bold">DB编号</th>
              <th class="bg-slate-50 text-slate-600 dark:text-slate-400 font-bold">会话号</th>
              <th class="bg-slate-50 text-slate-600 dark:text-slate-400 font-bold">大小</th>
              <th class="bg-slate-50 text-slate-600 dark:text-slate-400 font-bold">修改时间</th>
              <th class="bg-slate-50 text-slate-600 dark:text-slate-400 font-bold">更新次数(范围)</th>
              <th class="bg-slate-50 text-slate-600 dark:text-slate-400 font-bold text-right">操作</th>
            </tr>
          </thead>
        <tbody>
          <tr v-for="file in files" :key="file.name" class="hover:bg-slate-50/50 transition-colors">
            <td class="font-mono text-sm font-medium text-slate-700 dark:text-slate-300">
              <div class="flex items-center gap-2">
                <i class="fas fa-file-archive text-amber-500"></i>
                {{ file.name }}
              </div>
            </td>
            <td class="text-slate-600 dark:text-slate-400 text-sm">
              <span v-if="file.dbnum" class="badge badge-sm badge-outline">{{ file.dbnum }}</span>
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="text-slate-600 dark:text-slate-400 text-sm">
              <span v-if="file.sesno !== null && file.sesno !== undefined" class="badge badge-sm badge-info">{{ file.sesno }}</span>
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="text-slate-600 dark:text-slate-400 text-sm">{{ formatSize(file.size) }}</td>
            <td class="text-slate-600 dark:text-slate-400 text-sm">{{ formatTime(file.modified) }}</td>
            <td class="text-slate-600 dark:text-slate-400 text-sm">
               <span v-if="file.update_count !== undefined" class="badge badge-sm badge-ghost">{{ file.update_count }}</span>
               <span v-else class="text-slate-400">-</span>
            </td>
            <td class="text-right">
              <a
                :href="file.path"
                target="_blank"
                class="btn btn-xs btn-outline btn-primary gap-1"
                download
              >
                <i class="fas fa-download"></i> 下载
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { incrementalApi, siteConfigApi } from '@/api';
import { useFormatters } from '@/composables/useFormatters';

interface ArchiveFile {
  name: string;
  size?: number;
  modified?: string | number;
  path?: string;
  dbnum?: number | null;
  sesno?: number | null;
  update_count?: number;
  [key: string]: unknown;
}

interface SiteConfigSnapshot {
  location: string;
  location_dbs: number[];
}

const { formatTime } = useFormatters();

const files = ref<ArchiveFile[]>([]);
const allFiles = ref<ArchiveFile[]>([]);
const loading = ref(false);
const filterByCurrentSite = ref(true);
const currentSiteConfig = ref<SiteConfigSnapshot | null>(null);

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

function formatSize(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 尝试解析更新次数（从文件名 session range 跨度，或 v<num> 版本号提取）
function parseUpdateCount(fileName: string): number | undefined {
  try {
    const match = fileName.match(/(\d+)-(\d+)/);
    if (match) {
      const start = parseInt(match[1]);
      const end = parseInt(match[2]);
      if (!isNaN(start) && !isNaN(end) && end >= start) {
        return end - start + 1;
      }
    }
    const verMatch = fileName.match(/v(\d+)/);
    if (verMatch) {
      return parseInt(verMatch[1]);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function loadCurrentSiteConfig(): Promise<void> {
  try {
    const data: unknown = await siteConfigApi.get();
    const obj = (data && typeof data === 'object' ? (data as Record<string, unknown>) : {});
    const cfgRaw = (obj.config && typeof obj.config === 'object' ? obj.config : obj) as Record<string, unknown>;
    const dbs = Array.isArray(cfgRaw.location_dbs)
      ? (cfgRaw.location_dbs.filter((v) => typeof v === 'number') as number[])
      : [];
    currentSiteConfig.value = {
      location: typeof cfgRaw.location === 'string' ? cfgRaw.location : '',
      location_dbs: dbs,
    };
  } catch (err) {
    console.error('加载站点配置失败:', errorMessage(err));
    currentSiteConfig.value = { location: '', location_dbs: [] };
  }
}

// 从文件名提取 dbnum（例如：ams1112_0001.cba -> 1112）
function extractDbnumFromFileName(fileName: string): number | null {
  const name = fileName.replace(/\.cba$/i, '');
  const patterns = [/[a-zA-Z]+(\d{4,})/, /_(\d{4,})/, /^(\d{4,})/];
  for (const p of patterns) {
    const match = name.match(p);
    if (match) {
      const n = parseInt(match[1]);
      if (!isNaN(n) && n > 0 && n < 100000) return n;
    }
  }
  return null;
}

function isFileBelongsToCurrentSite(fileName: string): boolean {
  const cfg = currentSiteConfig.value;
  if (!cfg || cfg.location_dbs.length === 0) return true;
  const dbnum = extractDbnumFromFileName(fileName);
  if (dbnum === null) return true;
  return cfg.location_dbs.includes(dbnum);
}

function applyFilter(): void {
  files.value = filterByCurrentSite.value
    ? allFiles.value.filter((f) => isFileBelongsToCurrentSite(f.name))
    : allFiles.value;
}

async function loadData(): Promise<void> {
  loading.value = true;
  try {
    if (!currentSiteConfig.value) {
      await loadCurrentSiteConfig();
    }

    const res: unknown = await incrementalApi.archives();
    if (
      res &&
      typeof res === 'object' &&
      (res as { success?: unknown }).success &&
      Array.isArray((res as { files?: unknown }).files)
    ) {
      const rawFiles = (res as { files: unknown[] }).files as Array<Record<string, unknown>>;
      allFiles.value = rawFiles.map((f) => {
        const name = typeof f.name === 'string' ? f.name : '';
        return {
          ...(f as ArchiveFile),
          update_count: parseUpdateCount(name),
          dbnum:
            f.dbnum !== null && f.dbnum !== undefined && typeof f.dbnum === 'number'
              ? f.dbnum
              : extractDbnumFromFileName(name),
        } as ArchiveFile;
      });
      applyFilter();
    }
  } catch (e) {
    console.error('加载归档失败:', errorMessage(e));
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.dashboard-card {
  background: #fff;
  border-radius: 1.25rem;
  border: 2px solid #e2e8f0;
  padding: 1.75rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}
</style>
