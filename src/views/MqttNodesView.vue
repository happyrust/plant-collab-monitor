<template>
  <div class="h-full flex flex-col bg-base-100 rounded-xl shadow-sm border border-base-200 overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-base-200 bg-gradient-to-r from-green-50/50 to-emerald-50/30">
      <!-- 标题行 -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="font-bold text-xl flex items-center gap-3">
            <i class="fas fa-broadcast-tower text-green-600"></i>
            MQTT 节点实时监控
          </h3>
          <p class="text-xs text-slate-500 mt-1">
            追踪各站点的 MQTT 订阅状态和消息接收情况
          </p>
        </div>
        <div class="flex items-center gap-3">
          <span
            v-if="sse.status.value === 'open'"
            class="text-xs text-emerald-600 inline-flex items-center gap-1"
            title="SSE 实时通道已连接：订阅启停/主从切换变更秒级到达"
          >
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            实时
          </span>
          <span
            v-else-if="sse.status.value === 'connecting'"
            class="text-xs text-amber-600 inline-flex items-center gap-1"
          >
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            连接中
          </span>
          <span
            v-else-if="sse.status.value === 'error'"
            class="text-xs text-rose-600 inline-flex items-center gap-1"
            title="SSE 重连中（兜底 30s 轮询仍在工作）"
          >
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            重连中
            <span v-if="sse.reconnectAttempt.value > 0" class="text-rose-500/70">#{{ sse.reconnectAttempt.value }}</span>
            <span v-if="retrySeconds > 0" class="text-rose-500/70">· {{ retrySeconds }}s 后重试</span>
          </span>
          <button
            @click="loadData"
            class="btn btn-sm btn-primary gap-2"
            :disabled="loading"
          >
            <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
            刷新
          </button>
        </div>
      </div>

      <!-- 控制区域：分成两行，清晰分组 -->
      <div class="flex flex-col gap-3">
        <!-- 第一行：节点角色和服务状态 -->
        <div class="flex items-center gap-3 flex-wrap">
          <!-- 节点角色 -->
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-base-300 shadow-sm">
            <span class="text-xs text-slate-600 dark:text-slate-400 font-medium">节点角色:</span>
            <span class="text-sm font-bold px-2 py-0.5 rounded" :class="mqttStatus.is_master_node ? 'text-purple-600 bg-purple-50' : 'text-blue-600 bg-blue-50'">
              {{ mqttStatus.is_master_node ? '主节点' : '从节点' }}
            </span>
            <button
              v-if="!mqttStatus.is_master_node"
              @click="setAsMasterNode"
              class="btn btn-xs btn-ghost gap-1 ml-1"
              :disabled="roleLoading"
              title="设为主节点"
            >
              <i class="fas fa-crown text-yellow-500"></i>
            </button>
            <button
              v-else
              @click="setAsClientNode"
              class="btn btn-xs btn-ghost gap-1 ml-1"
              :disabled="roleLoading"
              title="设为从节点"
            >
              <i class="fas fa-users text-blue-500"></i>
            </button>
          </div>

          <!-- MQTT Server 状态 - 仅主节点显示 -->
          <div v-if="mqttStatus.is_master_node" class="flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm bg-purple-50 border-purple-200">
            <div 
              class="flex items-center gap-2"
              :title="mqttStatus.is_server_running && mqttStatus.mqtt_server_port ? `MQTT Broker 监听地址: 0.0.0.0:${mqttStatus.mqtt_server_port}` : 'MQTT Broker 未启动'"
            >
              <div
                class="w-2.5 h-2.5 rounded-full"
                :class="mqttStatus.is_server_running ? 'bg-purple-600 animate-pulse' : 'bg-slate-300'"
              ></div>
              <span class="text-xs font-semibold text-purple-700">Broker:</span>
              <span class="text-xs font-bold" :class="mqttStatus.is_server_running ? 'text-purple-700' : 'text-purple-600'">
                {{ mqttStatus.is_server_running ? '运行中' : '未启动' }}
              </span>
            </div>
            <button
              v-if="!mqttStatus.is_server_running"
              @click="startMqttServer"
              class="btn btn-xs btn-primary gap-1 ml-2"
              :disabled="mqttLoading"
              title="启动 MQTT Broker"
            >
              <i class="fas fa-server"></i>
              启动
            </button>
            <button
              v-else
              @click="stopMqttServer"
              class="btn btn-xs btn-error gap-1 ml-2"
              :disabled="mqttLoading"
            >
              <i class="fas fa-stop"></i>
              停止
            </button>
            <!-- 日志查看按钮 -->
            <button
              v-if="mqttStatus.is_server_running"
              @click="showLogs = !showLogs"
              class="btn btn-xs btn-ghost gap-1 ml-2"
              title="查看 Broker 日志"
            >
              <i class="fas fa-file-alt" :class="{ 'text-blue-500': showLogs }"></i>
            </button>
          </div>

          <!-- MQTT 订阅状态 -->
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-base-300 shadow-sm">
            <div class="flex items-center gap-2">
              <div
                class="w-2.5 h-2.5 rounded-full"
                :class="mqttStatus.is_subscription_running ? 'bg-success animate-pulse' : 'bg-slate-300'"
              ></div>
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">订阅:</span>
              <span class="text-xs font-bold" :class="mqttStatus.is_subscription_running ? 'text-success' : 'text-slate-500'">
                {{ mqttStatus.is_subscription_running ? '已订阅' : '未订阅' }}
              </span>
            </div>
            <!-- 订阅控制按钮 - 主节点和从节点都可以操作 -->
            <button
              v-if="!mqttStatus.is_subscription_running"
              @click="startMqttSubscription"
              class="btn btn-xs btn-success gap-1 ml-2"
              :disabled="mqttLoading"
            >
              <i class="fas fa-play" :class="{ 'fa-spin': mqttLoading }"></i>
              启动订阅
            </button>
            <button
              v-else
              @click="stopMqttSubscription"
              class="btn btn-xs btn-error gap-1 ml-2"
              :disabled="mqttLoading"
            >
              <i class="fas fa-stop"></i>
              停止订阅
            </button>
            <!-- 从节点显示连接状态 -->
            <div v-if="!mqttStatus.is_master_node && mqttStatus.connection_status" class="flex items-center gap-2 ml-2">
              <div
                class="w-2 h-2 rounded-full"
                :class="mqttStatus.connection_status.connected ? 'bg-success animate-pulse' : 'bg-error'"
              ></div>
              <span class="text-xs" :class="mqttStatus.connection_status.connected ? 'text-success font-semibold' : 'text-error'">
                {{ mqttStatus.connection_status.connected ? '已连接主节点' : '未连接主节点' }}
              </span>
              <span v-if="mqttStatus.connection_status.master_location" class="text-xs text-gray-500 dark:text-slate-400">
                ({{ mqttStatus.connection_status.master_location }})
              </span>
            </div>
          </div>

        <!-- 从节点连接信息卡片 -->
        <div v-if="!mqttStatus.is_master_node && mqttStatus.connection_status" 
             class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-2">
                <i class="fas fa-link text-blue-600"></i>
                <span class="text-sm font-semibold text-blue-800">主节点连接状态</span>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <div
                  class="w-2 h-2 rounded-full"
                  :class="mqttStatus.connection_status.connected ? 'bg-success animate-pulse' : 'bg-error'"
                ></div>
                <span :class="mqttStatus.connection_status.connected ? 'text-success font-semibold' : 'text-error'">
                  {{ mqttStatus.connection_status.connected ? '已连接' : '未连接' }}
                </span>
              </div>
            </div>
            <span class="text-xs text-blue-600 flex items-center gap-1">
              <i class="fas fa-info-circle"></i>
              <span>可在左侧导航栏查看"MQTT 拓扑可视化"</span>
            </span>
          </div>
          <!-- 诊断信息提示 -->
          <div v-if="mqttStatus.connection_status.diagnostic_message && !mqttStatus.connection_status.connected" 
               class="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            <div class="flex items-start gap-2">
              <i class="fas fa-exclamation-triangle mt-0.5"></i>
              <span>{{ mqttStatus.connection_status.diagnostic_message }}</span>
            </div>
          </div>
          <div v-if="mqttStatus.connection_status.master_location" class="mt-2 text-xs text-blue-700 space-y-1">
            <div class="flex items-center gap-2">
              <i class="fas fa-map-marker-alt w-3"></i>
              <span>主节点位置: <span class="font-mono font-semibold">{{ mqttStatus.connection_status.master_location }}</span></span>
            </div>
            <div class="flex items-center gap-2">
              <i class="fas fa-server w-3"></i>
              <span>Broker 地址: <span class="font-mono">{{ mqttStatus.connection_status.master_host }}:{{ mqttStatus.connection_status.master_port }}</span></span>
            </div>
            <div class="flex items-center gap-2">
              <i class="fas fa-circle w-3" :class="mqttStatus.connection_status.master_online ? 'text-success' : 'text-error'"></i>
              <span>主节点状态: <span :class="mqttStatus.connection_status.master_online ? 'text-success font-semibold' : 'text-error'">
                {{ mqttStatus.connection_status.master_online ? '在线' : '离线' }}
              </span></span>
            </div>
          </div>
        </div>
        </div>

        <!-- 第二行：统计信息 -->
        <div class="flex items-center gap-3">
          <div class="stats stats-horizontal shadow-sm bg-white dark:bg-slate-800 border border-base-200">
            <div class="stat py-2 px-4">
              <div class="stat-title text-xs text-slate-600 dark:text-slate-400">在线节点</div>
              <div class="stat-value text-2xl text-success font-bold">{{ summary.online }}</div>
            </div>
            <div class="stat py-2 px-4 border-l border-base-200">
              <div class="stat-title text-xs text-slate-600 dark:text-slate-400">离线节点</div>
              <div class="stat-value text-2xl text-error font-bold">{{ summary.offline }}</div>
            </div>
            <div class="stat py-2 px-4 border-l border-base-200">
              <div class="stat-title text-xs text-slate-600 dark:text-slate-400">总节点数</div>
              <div class="stat-value text-2xl text-slate-700 dark:text-slate-300 font-bold">{{ summary.total }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MQTT Server 日志面板 -->
    <div v-if="showLogs && mqttStatus.is_server_running"
         class="px-6 py-4 border-b border-base-200 bg-slate-900 text-slate-100 transition-all">
      <div class="flex items-center justify-between mb-3">
        <h4 class="font-semibold text-sm flex items-center gap-2">
          <i class="fas fa-terminal text-green-400"></i>
          MQTT Broker 日志
        </h4>
        <div class="flex items-center gap-2">
          <button
            @click="loadLogs"
            class="btn btn-xs btn-ghost text-slate-300 hover:text-white"
            :disabled="logsLoading"
          >
            <i class="fas fa-sync" :class="{ 'fa-spin': logsLoading }"></i>
            刷新日志
          </button>
          <button
            @click="clearLogs"
            class="btn btn-xs btn-ghost text-slate-300 hover:text-white"
          >
            <i class="fas fa-trash"></i>
            清空
          </button>
          <button
            @click="showLogs = false"
            class="btn btn-xs btn-ghost text-slate-300 hover:text-white"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="bg-slate-950 rounded-lg p-4 overflow-auto max-h-64 font-mono text-xs">
        <div v-if="logs.length === 0" class="text-slate-500 text-center py-8">
          <i class="fas fa-inbox text-3xl mb-2"></i>
          <p>暂无日志</p>
        </div>
        <div v-for="(log, index) in logs" :key="index"
             class="py-1 hover:bg-slate-800/50 transition-colors"
             :class="getLogClass(log)">
          <span class="text-slate-500 mr-2">[{{ log.time }}]</span>
          <span :class="getLogLevelClass(log.level)">{{ log.level }}</span>
          <span class="ml-2">{{ log.message }}</span>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left: Node List -->
      <div class="w-2/5 border-r border-base-200 flex flex-col">
        <div class="px-4 py-3 border-b border-base-200 bg-slate-50/50">
          <h4 class="font-bold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <i class="fas fa-server"></i>
            {{ mqttStatus.is_master_node ? '已连接从节点' : '订阅的主节点' }} ({{ nodes.length }})
          </h4>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="loading && nodes.length === 0" class="text-center py-16">
            <span class="loading loading-spinner loading-lg text-primary"></span>
            <p class="text-sm text-slate-500 mt-3">加载中...</p>
          </div>
          <div v-else-if="nodes.length === 0" class="text-center py-16 text-slate-400">
            <i class="fas fa-server text-5xl text-slate-200 mb-4"></i>
            <p>暂无订阅节点</p>
            <p class="text-xs mt-2">节点启动后会自动显示</p>
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="node in nodes"
              :key="node.location"
              @click="selectNode(node)"
              :class="[
                'card cursor-pointer transition-all duration-200 border-2',
                selectedNode?.location === node.location
                  ? 'bg-primary/10 border-primary shadow-md'
                  : 'bg-white dark:bg-slate-800 border-slate-200 hover:border-blue-200 hover:shadow'
              ]"
            >
              <div class="card-body p-4">
                <div class="flex justify-between items-start mb-2">
                  <div class="flex items-center gap-2">
                    <div
                      class="w-3 h-3 rounded-full"
                      :class="node.is_online ? 'bg-success animate-pulse' : 'bg-error'"
                    ></div>
                    <h5 class="font-bold text-slate-800">{{ node.node_name }}</h5>
                    <!-- 主节点标识 -->
                    <span v-if="node.is_subscribed_master" class="badge badge-xs badge-primary">主节点</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span
                      class="badge badge-sm"
                      :class="node.is_online ? 'badge-success' : 'badge-error'"
                    >
                      {{ node.is_online ? '在线' : '离线' }}
                    </span>
                    <!-- 删除按钮 -->
                    <button
                      v-if="node.can_delete"
                      @click.stop="removeNode(node)"
                      class="btn btn-xs btn-ghost text-error hover:bg-error/10"
                      :disabled="removeLoading"
                      :title="mqttStatus.is_master_node ? '移除此节点' : '取消订阅此主节点'"
                    >
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                </div>
                <div class="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div class="flex items-center gap-2">
                    <i class="fas fa-map-marker-alt w-4"></i>
                    <span class="font-mono">{{ node.location }}</span>
                  </div>
                  <!-- 显示 MQTT 地址（仅从节点订阅的主节点） -->
                  <div v-if="node.mqtt_host" class="flex items-center gap-2">
                    <i class="fas fa-server w-4"></i>
                    <span class="font-mono text-blue-600">{{ node.mqtt_host }}:{{ node.mqtt_port || 1883 }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <i class="fas fa-envelope w-4"></i>
                    <span>{{ node.messages_received }} 条消息</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <i class="far fa-clock w-4"></i>
                    <span>{{ formatTime(node.last_heartbeat) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Message Delivery Status -->
      <div class="flex-1 flex flex-col">
        <div class="px-4 py-3 border-b border-base-200 bg-slate-50/50 flex justify-between items-center">
          <h4 class="font-bold text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <i class="fas fa-paper-plane"></i>
            消息投递状态
          </h4>
          <div v-if="selectedNode" class="text-xs text-slate-500">
            当前查看: <span class="font-semibold text-primary">{{ selectedNode.node_name }}</span>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="!selectedNode" class="flex flex-col items-center justify-center h-full text-slate-400">
            <i class="fas fa-hand-point-left text-6xl text-slate-200 mb-6 animate-pulse"></i>
            <p class="text-lg font-medium text-slate-500">请选择左侧节点查看详情</p>
          </div>
          <div v-else-if="messages.length === 0" class="text-center py-16 text-slate-400">
            <i class="fas fa-inbox text-5xl text-slate-200 mb-4"></i>
            <p>该节点暂无消息投递记录</p>
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="msg in filteredMessages"
              :key="msg.message_id"
              class="card bg-white dark:bg-slate-800 shadow-sm border border-slate-200"
            >
              <div class="card-body p-4">
                <div class="flex justify-between items-start mb-3">
                  <div>
                    <div class="flex items-center gap-2 mb-1">
                      <i class="fas fa-broadcast-tower text-blue-500"></i>
                      <span class="font-semibold text-slate-800">来自: {{ msg.sender_location }}</span>
                      <span v-if="msg.session_range" class="badge badge-sm badge-info">
                        {{ msg.session_range }}
                      </span>
                    </div>
                    <p class="text-xs text-slate-500">
                      <i class="far fa-clock mr-1"></i>
                      {{ formatTime(msg.sent_at) }}
                    </p>
                  </div>
                  <div class="text-xs">
                    <span class="badge badge-sm badge-ghost">
                      <i class="fas fa-file-archive mr-1"></i>
                      {{ msg.file_count }} 文件
                    </span>
                  </div>
                </div>

                <!-- Receivers -->
                <div class="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <div class="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">接收状态:</div>
                  <div class="flex flex-wrap gap-2">
                    <div
                      v-for="receiver in msg.receivers"
                      :key="receiver.location"
                      class="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                      :class="getReceiverClass(receiver)"
                    >
                      <i :class="getReceiverIcon(receiver)"></i>
                      <span class="font-mono font-semibold">{{ receiver.location }}</span>
                      <span v-if="receiver.received_at" class="text-[10px] opacity-75">
                        {{ formatShortTime(receiver.received_at) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { mqttApi, syncApi } from '@/api';
import { useSse } from '@/composables/useSse';
import { useAdminAuthStore } from '@/stores/adminAuth';
import { useAppStatusStore } from '@/stores/appStatus';

const adminAuth = useAdminAuthStore();
const appStatus = useAppStatusStore();
const nodes = ref([]);
const messages = ref([]);
const selectedNode = ref(null);
const loading = ref(false);
const mqttLoading = ref(false);
const roleLoading = ref(false);
const removeLoading = ref(false);
const showLogs = ref(false);
const logsLoading = ref(false);
const logs = ref([]);

const summary = ref({
  total: 0,
  online: 0,
  offline: 0
});

const mqttStatus = ref({
  is_subscription_running: false,
  is_server_running: false,
  mqtt_server_port: null,
  location: '',
  is_master_node: false,
  node_role: 'client',
  connection_status: null,
  master_info: null
});

const filteredMessages = computed(() => {
  if (!selectedNode.value) return messages.value;

  return messages.value.filter(msg => {
    if (msg.sender_location === selectedNode.value.location) return true;
    return msg.receivers.some(r => r.location === selectedNode.value.location);
  });
});

async function loadData() {
  loading.value = true;
  try {
    const [statusResult, nodesResult, messagesResult] = await Promise.allSettled([
      mqttApi.subscriptionStatus(),
      mqttApi.nodes(),
      mqttApi.messages(),
    ]);

    if (statusResult.status === 'fulfilled') {
      const statusData = statusResult.value || {};
      if (statusData.status === 'success') {
        mqttStatus.value = {
          is_subscription_running: statusData.is_subscription_running || false,
          is_server_running: statusData.is_server_running || false,
          mqtt_server_port: statusData.mqtt_server_port || null,
          location: statusData.location || '',
          is_master_node: statusData.is_master_node || false,
          node_role: statusData.node_role || 'client',
          connection_status: statusData.connection_status || null,
          master_info: statusData.master_info || null,
        };
      }
    } else {
      console.warn('加载订阅状态失败:', statusResult.reason);
    }

    if (nodesResult.status === 'fulfilled') {
      const nodesData = nodesResult.value || {};
      if (nodesData.success || Array.isArray(nodesData.nodes)) {
        nodes.value = nodesData.nodes || [];
        summary.value = nodesData.summary || { total: nodes.value.length, online: 0, offline: 0 };
      }
    } else {
      console.warn('加载 MQTT 节点失败:', nodesResult.reason);
    }

    if (messagesResult.status === 'fulfilled') {
      const messagesData = messagesResult.value || {};
      if (messagesData.success || Array.isArray(messagesData.messages)) {
        messages.value = (messagesData.messages || []).slice(0, 100);
      }
    } else {
      console.warn('加载 MQTT 消息失败:', messagesResult.reason);
    }
  } catch (error) {
    console.error('加载 MQTT 监控数据失败:', error?.message || error);
  } finally {
    loading.value = false;
  }
}

async function loadLogs() {
  logsLoading.value = true;
  try {
    const data = await mqttApi.brokerLogs();

    if (data?.status === 'success' && Array.isArray(data?.logs)) {
      logs.value = data.logs;
    } else {
      // 后端未实现 / 返回非预期：保持空，由 UI 的 "暂无日志" 占位呈现，禁止伪造日志
      logs.value = [];
    }
  } catch (error) {
    console.error('加载日志失败:', error?.message || error);
    logs.value = [];
  } finally {
    logsLoading.value = false;
  }
}

function clearLogs() {
  logs.value = [];
}

function getLogClass(log) {
  if (log.level === 'ERROR') return 'text-red-400';
  if (log.level === 'WARN') return 'text-yellow-400';
  if (log.level === 'INFO') return 'text-green-400';
  return 'text-slate-300';
}

function getLogLevelClass(level) {
  if (level === 'ERROR') return 'text-red-500 font-bold';
  if (level === 'WARN') return 'text-yellow-500 font-bold';
  if (level === 'INFO') return 'text-green-500 font-bold';
  return 'text-slate-400 font-bold';
}

function isOk(data) {
  return data && (data.status === 'success' || data.success === true);
}

function pickMessage(data, fallback) {
  return (data && (data.message || data.error)) || fallback;
}

async function startMqttSubscription() {
  mqttLoading.value = true;
  try {
    const data = await mqttApi.subscriptionStart({});
    if (isOk(data)) {
      alert('✅ ' + pickMessage(data, '订阅已启动'));
      await loadData();
    } else {
      alert('❌ ' + pickMessage(data, '启动失败'));
    }
  } catch (error) {
    console.error('启动 MQTT 订阅失败:', error?.message || error);
    alert('❌ 启动失败: ' + (error?.message || error));
  } finally {
    mqttLoading.value = false;
  }
}

async function stopMqttSubscription() {
  if (!confirm('确定要停止 MQTT 订阅吗？停止后将不再接收远程消息。')) {
    return;
  }

  mqttLoading.value = true;
  try {
    const data = await mqttApi.subscriptionStop();
    if (isOk(data)) {
      alert('✅ ' + pickMessage(data, '订阅已停止'));
      await loadData();
    } else {
      alert('❌ ' + pickMessage(data, '停止失败'));
    }
  } catch (error) {
    console.error('停止 MQTT 订阅失败:', error?.message || error);
    alert('❌ 停止失败: ' + (error?.message || error));
  } finally {
    mqttLoading.value = false;
  }
}

async function startMqttServer() {
  if (!mqttStatus.value.is_master_node) {
    alert('❌ 只有主节点可以启动 MQTT Broker！请先设置为主节点。');
    return;
  }

  mqttLoading.value = true;
  try {
    const data = await syncApi.mqttStart({ port: 1883 });
    if (isOk(data)) {
      alert('✅ ' + pickMessage(data, 'Broker 已启动'));
      await loadData();
    } else {
      alert('❌ ' + pickMessage(data, '启动失败'));
    }
  } catch (error) {
    console.error('启动 MQTT Broker 失败:', error?.message || error);
    alert('❌ 启动失败: ' + (error?.message || error));
  } finally {
    mqttLoading.value = false;
  }
}

async function stopMqttServer() {
  if (!confirm('确定要停止 MQTT Broker 吗？')) {
    return;
  }

  mqttLoading.value = true;
  try {
    const data = await syncApi.mqttStop();
    if (isOk(data)) {
      alert('✅ ' + pickMessage(data, 'Broker 已停止'));
      showLogs.value = false;
      await loadData();
    } else {
      alert('❌ ' + pickMessage(data, '停止失败'));
    }
  } catch (error) {
    console.error('停止 MQTT Broker 失败:', error?.message || error);
    alert('❌ 停止失败: ' + (error?.message || error));
  } finally {
    mqttLoading.value = false;
  }
}

async function setAsMasterNode() {
  if (!confirm('确定要将当前节点设为主节点吗？主节点可以启动 MQTT Broker。')) {
    return;
  }

  roleLoading.value = true;
  try {
    const data = await mqttApi.setMaster({});
    if (isOk(data)) {
      alert('✅ ' + pickMessage(data, '已设为主节点'));
      await loadData();
    } else {
      alert('❌ ' + pickMessage(data, '设置失败'));
    }
  } catch (error) {
    console.error('设置主节点失败:', error?.message || error);
    alert('❌ 设置失败: ' + (error?.message || error));
  } finally {
    roleLoading.value = false;
  }
}

async function setAsClientNode() {
  if (!confirm('确定要将当前节点设为从节点吗？从节点只能作为 MQTT 客户端订阅消息。')) {
    return;
  }

  roleLoading.value = true;
  try {
    const data = await mqttApi.setClient({});
    if (isOk(data)) {
      alert('✅ ' + pickMessage(data, '已设为从节点'));
      await loadData();
    } else {
      alert('❌ ' + pickMessage(data, '设置失败'));
    }
  } catch (error) {
    console.error('设置从节点失败:', error?.message || error);
    alert('❌ 设置失败: ' + (error?.message || error));
  } finally {
    roleLoading.value = false;
  }
}

async function removeNode(node) {
  const confirmMsg = mqttStatus.value.is_master_node
    ? `确定要从监控列表中移除节点 "${node.node_name}" 吗？`
    : `确定要取消订阅主节点 "${node.node_name}" 吗？取消后将不再接收该主节点的消息。`;

  if (!confirm(confirmMsg)) {
    return;
  }

  removeLoading.value = true;
  try {
    const data = await mqttApi.removeNode(node.location);
    if (isOk(data)) {
      alert('✅ ' + pickMessage(data, '已移除节点'));
      if (selectedNode.value?.location === node.location) {
        selectedNode.value = null;
      }
      await loadData();
    } else {
      alert('❌ ' + pickMessage(data, '移除失败'));
    }
  } catch (error) {
    console.error('移除节点失败:', error?.message || error);
    alert('❌ 移除失败: ' + (error?.message || error));
  } finally {
    removeLoading.value = false;
  }
}

function selectNode(node) {
  selectedNode.value = node;
}

function getReceiverClass(receiver) {
  switch (receiver.status) {
    case 'completed':
      return 'bg-success/20 text-success border border-success/30';
    case 'received':
    case 'processing':
      return 'bg-info/20 text-info border border-info/30';
    case 'failed':
      return 'bg-error/20 text-error border border-error/30';
    default:
      return 'bg-slate-100 text-slate-600 dark:text-slate-400 border border-slate-200';
  }
}

function getReceiverIcon(receiver) {
  switch (receiver.status) {
    case 'completed':
      return 'fas fa-check-circle';
    case 'received':
      return 'fas fa-envelope-open';
    case 'processing':
      return 'fas fa-spinner fa-spin';
    case 'failed':
      return 'fas fa-exclamation-circle';
    default:
      return 'far fa-clock';
  }
}

function formatTime(timestamp) {
  if (!timestamp) return '未知';

  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60 * 1000) {
      return '刚刚';
    } else if (diff < 60 * 60 * 1000) {
      return `${Math.floor(diff / 60000)} 分钟前`;
    } else if (diff < 24 * 60 * 60 * 1000) {
      return `${Math.floor(diff / 3600000)} 小时前`;
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  } catch (e) {
    return timestamp;
  }
}

function formatShortTime(timestamp) {
  if (!timestamp) return '';

  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

let refreshInterval = null;
let logsInterval = null;

// SSE 实时通道：订阅 plant-model-gen 后端 commit 5463e41 推送的
// MqttSubscriptionStatusChanged 事件，触发后立即 reload，避免等下一次轮询
// 字段口径与 GET /api/mqtt/subscription/status 完全一致，无需差量解析
const sse = useSse('/api/sync/events/stream', {
  getToken: () => adminAuth.token,
  onMessage(e) {
    try {
      const event = JSON.parse(e.data);
      appStatus.trackEvent();
      if (event?.type === 'MqttSubscriptionStatusChanged') {
        loadData();
      }
    } catch {
      // ignore non-JSON heartbeat
    }
  },
});

const nowMs = ref(Date.now());
let nowTicker = null;
const retrySeconds = computed(() => {
  const t = sse.nextRetryAt.value;
  if (!t) return 0;
  return Math.max(0, Math.ceil((t - nowMs.value) / 1000));
});

watch(showLogs, (newValue) => {
  if (newValue && mqttStatus.value.is_server_running) {
    loadLogs();
  }
});

onMounted(() => {
  loadData();
  refreshInterval = setInterval(loadData, 30000);
  logsInterval = setInterval(() => {
    if (showLogs.value && mqttStatus.value.is_server_running) {
      loadLogs();
    }
  }, 3000);
  nowTicker = window.setInterval(() => { nowMs.value = Date.now(); }, 1000);
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  if (logsInterval) {
    clearInterval(logsInterval);
  }
  if (nowTicker) {
    clearInterval(nowTicker);
    nowTicker = null;
  }
});
</script>

<style scoped>
.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
