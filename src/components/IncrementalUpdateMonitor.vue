<template>
  <div class="space-y-6">
    <!-- 实时连接状态 -->
    <div class="flex items-center justify-end gap-2 text-sm">
      <span :class="realtimeConnected ? 'text-green-600' : 'text-red-500'">
        <i :class="realtimeConnected ? 'fas fa-wifi' : 'fas fa-wifi-slash'"></i>
        {{ realtimeConnected ? '实时连接' : '离线（轮询模式）' }}
      </span>
      <span v-if="lastEvent" class="text-slate-400 text-xs">
        最近事件: {{ lastEvent.type || 'unknown' }}
      </span>
    </div>

    <!-- 统计卡片 -->
    <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <div class="stats shadow-sm border border-base-200 bg-white text-slate-700">
        <div class="stat">
          <div class="stat-figure text-blue-600/20">
            <i class="fas fa-spinner text-3xl"></i>
          </div>
          <div class="stat-title font-medium text-slate-500">进行中</div>
          <div class="stat-value text-blue-600">{{ summary.task_stats?.in_progress || 0 }}</div>
          <div class="stat-desc">当前执行的任务</div>
        </div>
      </div>

      <div class="stats shadow-sm border border-base-200 bg-white text-slate-700">
        <div class="stat">
          <div class="stat-figure text-green-600/20">
            <i class="fas fa-check-circle text-3xl"></i>
          </div>
          <div class="stat-title font-medium text-slate-500">今日完成</div>
          <div class="stat-value text-green-600">{{ summary.task_stats?.completed_today || 0 }}</div>
          <div class="stat-desc">成功完成的任务</div>
        </div>
      </div>

      <div class="stats shadow-sm border border-base-200 bg-white text-slate-700">
        <div class="stat">
          <div class="stat-figure text-red-600/20">
            <i class="fas fa-exclamation-circle text-3xl"></i>
          </div>
          <div class="stat-title font-medium text-slate-500">今日失败</div>
          <div class="stat-value text-red-600">{{ summary.task_stats?.failed_today || 0 }}</div>
          <div class="stat-desc">失败的任务数量</div>
        </div>
      </div>

      <div class="stats shadow-sm border border-base-200 bg-white text-slate-700">
        <div class="stat">
          <div class="stat-figure text-purple-600/20">
            <i class="fas fa-chart-pie text-3xl"></i>
          </div>
          <div class="stat-title font-medium text-slate-500">成功率</div>
          <div class="stat-value text-purple-600">{{ (summary.performance_metrics?.success_rate || 0).toFixed(1) }}%</div>
          <div class="stat-desc">总体成功率</div>
        </div>
      </div>
    </section>

    <!-- 失败任务队列 -->
    <div class="bg-white rounded-xl border border-base-200 shadow-sm p-6">
      <div class="flex justify-between items-center mb-4">
        <div>
          <h3 class="font-bold text-lg text-slate-800 flex items-center gap-2">
            <i class="fas fa-exclamation-triangle text-amber-500"></i>
            失败任务队列
          </h3>
          <p class="text-sm text-slate-500 mt-1">
            待重试: <span class="font-semibold text-amber-600">{{ summary.failed_task_stats?.pending_retry || 0 }}</span> |
            已耗尽: <span class="font-semibold text-red-600">{{ summary.failed_task_stats?.exhausted || 0 }}</span> |
            总计: <span class="font-semibold">{{ summary.failed_task_stats?.total || 0 }}</span>
          </p>
        </div>
        <div class="flex gap-2">
          <button @click="showFailedTasksModal = true" class="btn btn-sm btn-outline">
            <i class="fas fa-list mr-1"></i> 查看详情
          </button>
          <button @click="handleCleanupExhausted" class="btn btn-sm btn-error" :disabled="!summary.failed_task_stats?.exhausted">
            <i class="fas fa-trash mr-1"></i> 清理已耗尽
          </button>
        </div>
      </div>
    </div>

    <!-- 活跃任务列表 -->
    <div class="bg-white rounded-xl border border-base-200 shadow-sm p-6">
      <h3 class="font-bold text-lg mb-4 text-slate-800 flex items-center gap-2">
        <i class="fas fa-tasks text-blue-500"></i>
        活跃任务
        <span v-if="activeTasks.length > 0" class="badge badge-primary badge-sm">{{ activeTasks.length }}</span>
      </h3>
      <div v-if="activeTasks.length === 0" class="text-center py-8 text-slate-500">
        <i class="fas fa-inbox text-4xl mb-2 opacity-20"></i>
        <p>当前没有活跃任务</p>
      </div>
      <div v-else class="space-y-3">
        <div v-for="task in activeTasks" :key="task.task_id" class="border rounded-lg p-4 hover:bg-slate-50 transition">
          <div class="flex items-center justify-between mb-2">
            <div class="flex-1">
              <div class="font-medium text-slate-800">{{ task.task_name }}</div>
              <div class="text-xs text-slate-500 mt-1">{{ task.file_path }}</div>
            </div>
            <span class="badge" :class="getStatusBadgeClass(task.status)">
              {{ task.status }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex-1 bg-slate-200 rounded-full h-2">
              <div class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                   :style="`width: ${task.progress}%`"></div>
            </div>
            <span class="text-xs text-slate-600 font-medium">{{ task.progress.toFixed(0) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 增量历史记录列表 -->
    <div class="bg-white rounded-xl border border-base-200 shadow-sm p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-lg text-slate-800 flex items-center gap-2">
          <i class="fas fa-history text-purple-500"></i>
          增量同步历史
        </h3>
        <button @click="loadIncrementHistory" class="btn btn-sm btn-outline">
          <i class="fas fa-sync mr-1"></i> 刷新
        </button>
      </div>

      <div v-if="incrementHistory.length === 0" class="text-center py-8 text-slate-500">
        <i class="fas fa-inbox text-4xl mb-2 opacity-20"></i>
        <p>暂无增量同步历史</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="table table-zebra w-full">
          <thead>
            <tr>
              <th>时间</th>
              <th>Session范围</th>
              <th>新增</th>
              <th>修改</th>
              <th>删除</th>
              <th>数据库编号</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in incrementHistory" :key="record.id" class="hover">
              <td>{{ formatTimestamp(record.timestamp) }}</td>
              <td><span class="badge badge-sm">{{ record.session_range || '-' }}</span></td>
              <td><span class="text-green-600 font-semibold">{{ record.total_added || 0 }}</span></td>
              <td><span class="text-blue-600 font-semibold">{{ record.total_modified || 0 }}</span></td>
              <td><span class="text-red-600 font-semibold">{{ record.total_deleted || 0 }}</span></td>
              <td>{{ record.db_num || '-' }}</td>
              <td>
                <button @click="viewIncrementDetails(record)" class="btn btn-xs btn-primary">
                  <i class="fas fa-eye mr-1"></i>查看详情
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 增量详情模态框 -->
    <div v-if="showIncrementDetailsModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
         @click.self="showIncrementDetailsModal = false">
      <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-6xl max-h-[80vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-slate-800">
            增量元素详情 - {{ selectedIncrement?.session_range }}
          </h3>
          <button @click="showIncrementDetailsModal = false" class="btn btn-sm btn-circle btn-ghost">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- 统计卡片 -->
        <div class="grid grid-cols-3 gap-4 mb-4">
          <div class="stat border rounded-lg">
            <div class="stat-title">新增</div>
            <div class="stat-value text-green-600 text-2xl">{{ incrementElements.stats?.total_added || 0 }}</div>
          </div>
          <div class="stat border rounded-lg">
            <div class="stat-title">修改</div>
            <div class="stat-value text-blue-600 text-2xl">{{ incrementElements.stats?.total_modified || 0 }}</div>
          </div>
          <div class="stat border rounded-lg">
            <div class="stat-title">删除</div>
            <div class="stat-value text-red-600 text-2xl">{{ incrementElements.stats?.total_deleted || 0 }}</div>
          </div>
        </div>

        <!-- 元素列表 -->
        <div v-if="loadingElements" class="text-center py-12">
          <i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
          <p class="mt-2 text-slate-600">加载中...</p>
        </div>

        <div v-else-if="incrementElements.elements && incrementElements.elements.length === 0" class="text-center py-12 text-slate-500">
          <i class="fas fa-inbox text-4xl mb-2 opacity-20"></i>
          <p>没有元素数据</p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="table table-compact w-full">
            <thead>
              <tr>
                <th>REFNO</th>
                <th>类型</th>
                <th>名称</th>
                <th>Session号</th>
                <th>数据库编号</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="element in incrementElements.elements" :key="element.refno" class="hover">
                <td><code class="text-xs">{{ element.refno }}</code></td>
                <td><span class="badge badge-sm badge-primary">{{ element.noun }}</span></td>
                <td>{{ element.name || '-' }}</td>
                <td>{{ element.sesno || '-' }}</td>
                <td>{{ element.db_num }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页控制 -->
        <div class="flex justify-between items-center mt-4" v-if="incrementElements.total > 0">
          <div class="text-sm text-slate-600">
            共 {{ incrementElements.total }} 个元素
          </div>
          <div class="flex gap-2">
            <button @click="loadElementsPage(currentElementPage - 1)" :disabled="currentElementPage === 1" class="btn btn-sm">
              上一页
            </button>
            <span class="px-4 py-2">第 {{ currentElementPage }} 页</span>
            <button @click="loadElementsPage(currentElementPage + 1)" :disabled="currentElementPage * elementsPerPage >= incrementElements.total" class="btn btn-sm">
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 失败任务详情模态框 -->
    <div v-if="showFailedTasksModal" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
         @click.self="showFailedTasksModal = false">
      <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-slate-800">失败任务详情</h3>
          <button @click="showFailedTasksModal = false" class="btn btn-sm btn-circle btn-ghost">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- 过滤器 -->
        <div class="flex gap-2 mb-4">
          <select v-model="failedTasksFilter.status" @change="loadFailedTasks" class="select select-sm select-bordered">
            <option value="">所有状态</option>
            <option value="pending">待重试</option>
            <option value="exhausted">已耗尽</option>
          </select>
        </div>

        <!-- 失败任务列表 -->
        <div v-if="failedTasks.length === 0" class="text-center py-12 text-slate-500">
          <i class="fas fa-check-circle text-4xl mb-2 text-green-500 opacity-20"></i>
          <p>没有失败任务</p>
        </div>
        <div v-else class="space-y-3">
          <div v-for="task in failedTasks" :key="task.id" class="border rounded-lg p-4 hover:bg-slate-50">
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1">
                <div class="font-medium text-slate-800">{{ getTaskTypeLabel(task.task_type) }}</div>
                <div class="text-sm text-red-600 mt-1">{{ task.error }}</div>
              </div>
              <div class="flex items-center gap-2">
                <span class="badge badge-warning badge-sm">{{ task.retry_count }}/{{ task.max_retries }}</span>
                <button @click="handleRetryTask(task.id)" class="btn btn-xs btn-primary">
                  <i class="fas fa-redo mr-1"></i>重试
                </button>
              </div>
            </div>
            <div class="text-xs text-slate-500 space-y-1">
              <div>首次失败: {{ formatTimestamp(task.first_failed_at) }}</div>
              <div v-if="task.next_retry_at">下次重试: {{ formatTimestamp(task.next_retry_at) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useApi } from '../composables/useApi';
import { useFormatters } from '../composables/useFormatters';

const { fetchDashboardSummary, fetchActiveTasks, fetchFailedTasks, retryFailedTask, cleanupExhaustedTasks, fetchIncrementElements } = useApi();
const { formatRelativeTime } = useFormatters();

const summary = ref({});
const activeTasks = ref([]);
const failedTasks = ref([]);
const showFailedTasksModal = ref(false);
const failedTasksFilter = ref({ status: '' });

// 增量历史记录相关
const incrementHistory = ref([]);
const showIncrementDetailsModal = ref(false);
const selectedIncrement = ref(null);
const incrementElements = ref({ stats: {}, elements: [], total: 0 });
const loadingElements = ref(false);
const currentElementPage = ref(1);
const elementsPerPage = 100;

// SSE 实时事件
let eventSource = null;
const realtimeConnected = ref(false);
const lastEvent = ref(null);

let refreshInterval = null;

const loadData = async () => {
  try {
    const [summaryData, tasksData] = await Promise.all([
      fetchDashboardSummary(),
      fetchActiveTasks()
    ]);
    summary.value = summaryData;
    activeTasks.value = tasksData;
  } catch (error) {
    console.error('加载监控数据失败:', error);
  }
};

const loadFailedTasks = async () => {
  try {
    const filters = {};
    if (failedTasksFilter.value.status === 'pending') {
      filters.pending_only = true;
    } else if (failedTasksFilter.value.status === 'exhausted') {
      filters.exhausted_only = true;
    }
    failedTasks.value = await fetchFailedTasks(filters);
  } catch (error) {
    console.error('加载失败任务失败:', error);
  }
};

const handleRetryTask = async (taskId) => {
  try {
    await retryFailedTask(taskId);
    await loadFailedTasks();
    await loadData();
    alert('任务已加入重试队列');
  } catch (error) {
    console.error('重试任务失败:', error);
    alert('重试失败');
  }
};

const handleCleanupExhausted = async () => {
  if (!confirm('确定要清理所有已耗尽的失败任务吗？')) {
    return;
  }
  try {
    const result = await cleanupExhaustedTasks();
    await loadData();
    alert(result.message || '清理成功');
  } catch (error) {
    console.error('清理失败:', error);
    alert('清理失败');
  }
};

const getStatusBadgeClass = (status) => {
  const classes = {
    'Pending': 'badge-ghost',
    'Running': 'badge-primary',
    'Completed': 'badge-success',
    'Failed': 'badge-error',
    'Cancelled': 'badge-warning'
  };
  return classes[status] || 'badge-ghost';
};

const getTaskTypeLabel = (taskType) => {
  if (typeof taskType === 'object') {
    const key = Object.keys(taskType)[0];
    const labels = {
      'DatabaseQuery': '数据库查询失败',
      'Compression': 'CBA压缩失败',
      'IncrementUpdate': '增量更新失败',
      'MqttPublish': 'MQTT推送失败'
    };
    return labels[key] || '未知类型';
  }
  return taskType;
};

const formatTimestamp = (ts) => {
  if (!ts) return '-';
  return formatRelativeTime(ts * 1000);
};

// 加载增量历史记录
const loadIncrementHistory = async () => {
  try {
    // 这里使用loadSyncHistory API(它查询e3d_sync表)
    const { loadSyncHistory } = useApi();
    const result = await loadSyncHistory(1, 20);
    if (result && result.records) {
      incrementHistory.value = result.records.map((record, index) => ({
        ...record,
        id: record.id || `sync-${index}`, // 生成唯一ID
      }));
    }
  } catch (error) {
    console.error('加载增量历史失败:', error);
  }
};

// 查看增量详情
const viewIncrementDetails = async (record) => {
  selectedIncrement.value = record;
  showIncrementDetailsModal.value = true;
  currentElementPage.value = 1;

  // 从record.id中提取sync_id (格式可能是 "e3d_sync:xxxxx" 或直接是数字)
  let syncId = record.id;
  if (typeof syncId === 'string' && syncId.includes(':')) {
    syncId = syncId.split(':')[1];
  }

  await loadIncrementElements(syncId);
};

// 加载增量元素列表
const loadIncrementElements = async (syncId) => {
  if (!syncId) {
    console.error('Invalid syncId:', syncId);
    return;
  }

  loadingElements.value = true;
  try {
    const offset = (currentElementPage.value - 1) * elementsPerPage;
    const result = await fetchIncrementElements(syncId, {
      limit: elementsPerPage,
      offset: offset
    });
    incrementElements.value = result;
  } catch (error) {
    console.error('加载增量元素失败:', error);
    incrementElements.value = { stats: {}, elements: [], total: 0 };
  } finally {
    loadingElements.value = false;
  }
};

// 加载指定页的元素
const loadElementsPage = async (page) => {
  if (page < 1) return;
  currentElementPage.value = page;

  let syncId = selectedIncrement.value?.id;
  if (typeof syncId === 'string' && syncId.includes(':')) {
    syncId = syncId.split(':')[1];
  }
  await loadIncrementElements(syncId);
};

// 初始化 SSE 实时事件连接
const initSSE = () => {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource('/api/sync/events/stream');

  eventSource.onopen = () => {
    console.log('✅ SSE 实时连接已建立');
    realtimeConnected.value = true;
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('📨 收到实时事件:', data);
      lastEvent.value = data;

      // 根据事件类型处理
      if (data.type === 'SyncCompleted' || data.type === 'SyncFailed' || data.type === 'IncrementDetected') {
        // 收到同步完成或失败事件，立即刷新数据
        loadData();
        loadIncrementHistory();
      }
    } catch (e) {
      console.error('解析SSE事件失败:', e);
    }
  };

  eventSource.onerror = (error) => {
    console.error('❌ SSE 连接错误:', error);
    realtimeConnected.value = false;
    // 5秒后尝试重连
    setTimeout(initSSE, 5000);
  };
};

onMounted(() => {
  loadData();
  loadIncrementHistory(); // 加载增量历史
  initSSE(); // 初始化SSE实时连接
  // 每30秒作为备用刷新（SSE断开时保底）
  refreshInterval = setInterval(() => {
    loadData();
    loadIncrementHistory();
  }, 30000);
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
});

// 监听模态框打开时加载失败任务
watch(() => showFailedTasksModal.value, (newVal) => {
  if (newVal) {
    loadFailedTasks();
  }
});
</script>
