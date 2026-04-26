<template>
  <div class="dashboard-card animate-fade-in-up">
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
      <div>
        <p class="text-[10px] uppercase tracking-[0.35em] text-slate-500 font-bold mb-1.5">归档管理</p>
        <h2 class="text-xl font-bold text-slate-900 mb-1">CBA 文件列表</h2>
        <p class="text-sm text-slate-700">浏览并下载已生成的增量更新包文件。</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <!-- 筛选切换 -->
        <div class="form-control">
          <label class="label cursor-pointer gap-2">
            <span class="label-text text-sm text-slate-600">只显示当前站点</span>
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

    <div v-else-if="files.length === 0" class="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
      <p class="text-slate-500">
        {{ filterByCurrentSite ? '当前站点暂无归档文件' : '暂无归档文件' }}
      </p>
      <p v-if="filterByCurrentSite && allFiles.length > 0" class="text-xs text-slate-400 mt-2">
        共有 {{ allFiles.length }} 个文件，但都不属于当前站点
      </p>
    </div>

    <div v-else>
      <!-- 统计信息 -->
      <div v-if="allFiles.length > 0" class="mb-4 text-sm text-slate-600">
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
              <th class="bg-slate-50 text-slate-600 font-bold">文件名</th>
              <th class="bg-slate-50 text-slate-600 font-bold">DB编号</th>
              <th class="bg-slate-50 text-slate-600 font-bold">会话号</th>
              <th class="bg-slate-50 text-slate-600 font-bold">大小</th>
              <th class="bg-slate-50 text-slate-600 font-bold">修改时间</th>
              <th class="bg-slate-50 text-slate-600 font-bold">更新次数(范围)</th>
              <th class="bg-slate-50 text-slate-600 font-bold text-right">操作</th>
            </tr>
          </thead>
        <tbody>
          <tr v-for="file in files" :key="file.name" class="hover:bg-slate-50/50 transition-colors">
            <td class="font-mono text-sm font-medium text-slate-700">
              <div class="flex items-center gap-2">
                <i class="fas fa-file-archive text-amber-500"></i>
                {{ file.name }}
              </div>
            </td>
            <td class="text-slate-600 text-sm">
              <span v-if="file.dbnum" class="badge badge-sm badge-outline">{{ file.dbnum }}</span>
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="text-slate-600 text-sm">
              <span v-if="file.sesno !== null && file.sesno !== undefined" class="badge badge-sm badge-info">{{ file.sesno }}</span>
              <span v-else class="text-slate-400">-</span>
            </td>
            <td class="text-slate-600 text-sm">{{ formatSize(file.size) }}</td>
            <td class="text-slate-600 text-sm">{{ formatTime(file.modified) }}</td>
            <td class="text-slate-600 text-sm">
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

<script setup>
import { ref, onMounted } from 'vue';
import { incrementalApi, siteConfigApi } from '@/api';
import { useFormatters } from '@/composables/useFormatters';

const { formatTime } = useFormatters();

const files = ref([]);
const allFiles = ref([]); // 存储所有文件
const loading = ref(false);
const filterByCurrentSite = ref(true); // 默认只显示当前站点
const currentSiteConfig = ref(null); // 当前站点配置

const formatSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 尝试解析更新次数（假设从文件名中提取，例如 session range 的跨度）
const parseUpdateCount = (fileName) => {
    // 示例格式：update_1112_100-105.cba
    // 提取 100-105，计算 105-100+1 = 6
    try {
        const match = fileName.match(/(\d+)-(\d+)/);
        if (match) {
            const start = parseInt(match[1]);
            const end = parseInt(match[2]);
            if (!isNaN(start) && !isNaN(end) && end >= start) {
                return end - start + 1; // 包含 start 和 end
            }
        }
        
        // 或者如果文件名包含版本号 v5
        const verMatch = fileName.match(/v(\d+)/);
        if (verMatch) {
             return parseInt(verMatch[1]);
        }
    } catch (e) {
        return undefined;
    }
    return undefined;
};

// 加载当前站点配置
const loadCurrentSiteConfig = async () => {
  try {
    const data = await siteConfigApi.get();
    const config = data?.config || data || {};
    currentSiteConfig.value = {
      location: config.location || '',
      location_dbs: config.location_dbs || []
    };
  } catch (err) {
    console.error('加载站点配置失败:', err?.message || err);
    currentSiteConfig.value = {
      location: '',
      location_dbs: []
    };
  }
};

// 从文件名提取 dbnum（例如：ams1112_0001.cba -> 1112）
// 文件名格式通常是：项目名 + dbnum + 其他信息，例如 ams1112_0001.cba
const extractDbnumFromFileName = (fileName) => {
  // 移除 .cba 扩展名
  let name = fileName.replace(/\.cba$/i, '');
  
  // 尝试多种模式匹配 dbnum
  // 1. 匹配项目名后的4位数字（最常见）：ams1112_0001 -> 1112
  const pattern1 = /[a-zA-Z]+(\d{4,})/;
  let match = name.match(pattern1);
  if (match) {
    const dbnum = parseInt(match[1]);
    if (!isNaN(dbnum) && dbnum > 0 && dbnum < 100000) {
      return dbnum;
    }
  }
  
  // 2. 匹配下划线后的4位数字：xxx_1112_xxx -> 1112
  const pattern2 = /_(\d{4,})/;
  match = name.match(pattern2);
  if (match) {
    const dbnum = parseInt(match[1]);
    if (!isNaN(dbnum) && dbnum > 0 && dbnum < 100000) {
      return dbnum;
    }
  }
  
  // 3. 匹配文件名开头的4位数字：1112_xxx -> 1112
  const pattern3 = /^(\d{4,})/;
  match = name.match(pattern3);
  if (match) {
    const dbnum = parseInt(match[1]);
    if (!isNaN(dbnum) && dbnum > 0 && dbnum < 100000) {
      return dbnum;
    }
  }
  
  return null;
};

// 判断文件是否属于当前站点
const isFileBelongsToCurrentSite = (fileName) => {
  if (!currentSiteConfig.value || !currentSiteConfig.value.location_dbs || currentSiteConfig.value.location_dbs.length === 0) {
    // 如果没有配置 location_dbs，显示所有文件
    return true;
  }
  
  const dbnum = extractDbnumFromFileName(fileName);
  if (dbnum === null) {
    // 如果无法提取 dbnum，默认显示
    return true;
  }
  
  // 检查 dbnum 是否在 location_dbs 中
  return currentSiteConfig.value.location_dbs.includes(dbnum);
};

// 应用筛选条件
const applyFilter = () => {
  if (filterByCurrentSite.value) {
    files.value = allFiles.value.filter(f => isFileBelongsToCurrentSite(f.name));
  } else {
    files.value = allFiles.value;
  }
};

const loadData = async () => {
  loading.value = true;
  try {
    // 先加载站点配置
    if (!currentSiteConfig.value) {
      await loadCurrentSiteConfig();
    }
    
    const res = await incrementalApi.archives();
    if (res?.success && Array.isArray(res?.files)) {
      // 保存所有文件
      // 优先使用 API 返回的 dbnum（来自数据库），如果没有则从文件名提取
      allFiles.value = res.files.map(f => ({
        ...f,
        update_count: parseUpdateCount(f.name),
        dbnum: f.dbnum !== null && f.dbnum !== undefined ? f.dbnum : extractDbnumFromFileName(f.name)
      }));

      // 应用筛选条件
      applyFilter();
    }
  } catch (e) {
    console.error('加载归档失败:', e?.message || e);
  } finally {
    loading.value = false;
  }
};

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
