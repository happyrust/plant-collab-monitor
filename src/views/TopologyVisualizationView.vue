<template>
  <div class="h-full flex flex-col bg-base-100 rounded-xl shadow-sm border border-base-200 overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-base-200 flex items-center justify-between bg-gradient-to-r from-purple-50/50 to-indigo-50/30">
      <div>
        <h3 class="font-bold text-xl flex items-center gap-3">
          <i class="fas fa-project-diagram text-purple-600"></i>
          MQTT 拓扑可视化
        </h3>
        <p class="text-xs text-slate-500 mt-1">
          实时展示节点订阅关系和消息流动
        </p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Legend -->
        <div class="flex items-center gap-4 text-xs bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm flex-wrap">
          <div class="flex items-center gap-1.5">
            <div class="w-3 h-3 rounded bg-purple-600 animate-pulse"></div>
            <span class="font-semibold">主节点</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-3 h-3 rounded-full bg-success animate-pulse"></div>
            <span>从节点在线</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-3 h-3 rounded-full bg-error"></div>
            <span>离线</span>
          </div>
          <div class="border-l border-slate-300 h-4 mx-1"></div>
          <div class="flex items-center gap-1.5">
            <div class="w-8 h-0.5 bg-emerald-500"></div>
            <span class="text-emerald-600 font-bold">已订阅</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-8 h-0.5 bg-primary"></div>
            <span class="text-blue-600">在线未订阅</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-8 h-0.5 bg-slate-400" style="stroke-dasharray: 4,2;"></div>
            <span class="text-slate-400">离线</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-8 h-0.5 bg-warning animate-pulse"></div>
            <span>消息流</span>
          </div>
        </div>
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

    <!-- Topology Canvas -->
    <div class="flex-1 relative overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
      <!-- Loading State -->
      <div v-if="loading && nodes.length === 0" class="absolute inset-0 flex items-center justify-center">
        <div class="text-center">
          <span class="loading loading-spinner loading-lg text-primary"></span>
          <p class="text-sm text-slate-500 mt-3">加载拓扑数据...</p>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="nodes.length === 0" class="absolute inset-0 flex items-center justify-center">
        <div class="text-center text-slate-400">
          <i class="fas fa-network-wired text-6xl text-slate-200 mb-6"></i>
          <p class="text-lg font-medium text-slate-500">暂无节点数据</p>
          <p class="text-sm mt-2">请确保 MQTT 节点已启动并连接</p>
        </div>
      </div>

      <!-- Topology Graph -->
      <svg
        v-else
        ref="svgCanvas"
        class="w-full h-full"
        @mousedown="startPan"
        @mousemove="onMouseMove"
        @mouseup="endPanAndDrag"
        @mouseleave="endPanAndDrag"
        @wheel="zoom"
      >
        <!-- Message flow animations -->
        <defs>
          <linearGradient id="messageFlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#fbbf24;stop-opacity:0" />
            <stop offset="50%" style="stop-color:#fbbf24;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#fbbf24;stop-opacity:0" />
          </linearGradient>

          <!-- Arrow marker - blue (online but not subscribed) -->
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>

          <!-- Arrow marker - green (subscribed) -->
          <marker
            id="arrowhead-green"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
          </marker>

          <!-- Arrow marker - gray (offline) -->
          <marker
            id="arrowhead-gray"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>

        <g :transform="`translate(${viewBox.x}, ${viewBox.y}) scale(${viewBox.scale})`">
          <!-- Subscription connections -->
          <g class="connections">
            <line
              v-for="conn in connections"
              :key="`${conn.from}-${conn.to}`"
              :x1="getNodePosition(conn.from).x"
              :y1="getNodePosition(conn.from).y"
              :x2="getNodePosition(conn.to).x"
              :y2="getNodePosition(conn.to).y"
              :stroke="conn.active ? '#fbbf24' : (conn.status === 'subscribed' ? '#10b981' : (conn.status === 'online' ? '#3b82f6' : '#94a3b8'))"
              :stroke-width="conn.active ? 3 : (conn.status === 'subscribed' ? 2.5 : 2)"
              :stroke-dasharray="conn.active ? '5,5' : (conn.status === 'offline' ? '8,4' : '0')"
              stroke-linecap="round"
              :marker-end="conn.status === 'subscribed' ? 'url(#arrowhead-green)' : (conn.status === 'online' ? 'url(#arrowhead)' : 'url(#arrowhead-gray)')"
              :class="{ 'animate-dash': conn.active }"
              :opacity="conn.status === 'offline' ? 0.5 : 1"
            >
              <animate
                v-if="conn.active"
                attributeName="stroke-dashoffset"
                from="0"
                to="10"
                dur="0.5s"
                repeatCount="indefinite"
              />
            </line>

            <!-- Connection labels -->
            <text
              v-for="conn in connections"
              :key="`label-${conn.from}-${conn.to}`"
              :x="(getNodePosition(conn.from).x + getNodePosition(conn.to).x) / 2"
              :y="(getNodePosition(conn.from).y + getNodePosition(conn.to).y) / 2 - 5"
              :class="conn.status === 'subscribed' ? 'text-xs fill-emerald-600 font-bold' : (conn.status === 'online' ? 'text-xs fill-blue-600' : 'text-xs fill-slate-400')"
              text-anchor="middle"
            >
              {{ conn.label }}
            </text>
          </g>

          <!-- Nodes -->
          <g class="nodes">
            <g
              v-for="node in nodesWithPositions"
              :key="node.location"
              :transform="`translate(${node.x}, ${node.y})`"
              class="cursor-pointer"
              @click="selectNode(node)"
              @mousedown.stop="startNodeDrag($event, node)"
            >
              <!-- 主节点：正方形 -->
              <template v-if="node.is_master_node">
                <!-- Pulse effect for online master nodes -->
                <rect
                  v-if="node.is_online"
                  x="-50"
                  y="-50"
                  width="100"
                  height="100"
                  rx="8"
                  :fill="node.location === selectedNode?.location ? '#3b82f680' : '#3b82f620'"
                  class="animate-ping"
                  style="animation-duration: 2s;"
                />

                <!-- Main master node rectangle -->
                <rect
                  x="-40"
                  y="-40"
                  width="80"
                  height="80"
                  rx="6"
                  :fill="node.is_online ? '#a855f7' : '#ef4444'"
                  :stroke="node.location === selectedNode?.location ? '#3b82f6' : '#7c3aed'"
                  :stroke-width="node.location === selectedNode?.location ? 4 : 3"
                  class="transition-all duration-300"
                  :opacity="node.is_online ? 1 : 0.6"
                />

                <!-- Master node icon (server icon) -->
                <text
                  y="5"
                  class="text-2xl fill-white"
                  text-anchor="middle"
                  font-family="Font Awesome 6 Free"
                  font-weight="900"
                >
                  &#xf233;
                </text>
              </template>

              <!-- 从节点：圆形 -->
              <template v-else>
                <!-- Pulse effect for online client nodes -->
                <circle
                  v-if="node.is_online"
                  r="45"
                  :fill="node.location === selectedNode?.location ? '#3b82f680' : '#3b82f620'"
                  class="animate-ping"
                  style="animation-duration: 2s;"
                />

                <!-- Main client node circle -->
                <circle
                  r="40"
                  :fill="node.is_online ? '#10b981' : '#ef4444'"
                  :stroke="node.location === selectedNode?.location ? '#3b82f6' : '#fff'"
                  :stroke-width="node.location === selectedNode?.location ? 4 : 2"
                  class="transition-all duration-300"
                  :opacity="node.is_online ? 1 : 0.6"
                />

                <!-- Client node icon -->
                <text
                  y="5"
                  class="text-2xl fill-white"
                  text-anchor="middle"
                  font-family="Font Awesome 6 Free"
                  font-weight="900"
                >
                  &#xf233;
                </text>
              </template>

              <!-- Node label -->
              <text
                y="65"
                class="text-sm font-bold fill-slate-800"
                text-anchor="middle"
              >
                {{ node.node_name }}
              </text>
              <text
                y="80"
                class="text-xs fill-slate-600"
                text-anchor="middle"
              >
                {{ node.location }}
              </text>

              <!-- Status badge -->
              <g :transform="`translate(25, -25)`">
                <circle r="12" :fill="node.is_online ? '#10b981' : '#ef4444'" />
                <text
                  y="4"
                  class="text-xs fill-white font-bold"
                  text-anchor="middle"
                >
                  {{ node.messages_received }}
                </text>
              </g>

              <!-- MQTT Broker 连接状态指示器（发布客户端） -->
              <g v-if="node.broker_connected_pub !== undefined && node.broker_connected_pub !== null"
                 :transform="`translate(-25, -25)`"
                 :title="node.broker_connected_pub ? '发布客户端已连接' : '发布客户端未连接'">
                <circle r="8" :fill="node.broker_connected_pub ? '#10b981' : '#ef4444'"
                        :class="node.broker_connected_pub ? 'animate-pulse' : ''" />
                <text
                  y="2"
                  class="text-[8px] fill-white font-bold"
                  text-anchor="middle"
                >
                  {{ node.broker_connected_pub ? 'P' : '×' }}
                </text>
              </g>

              <!-- MQTT Broker 连接状态指示器（订阅客户端） -->
              <g v-if="node.broker_connected_sub !== undefined && node.broker_connected_sub !== null"
                 :transform="`translate(25, 25)`"
                 :title="node.broker_connected_sub ? '订阅客户端已连接' : '订阅客户端未连接'">
                <circle r="8" :fill="node.broker_connected_sub ? '#10b981' : '#ef4444'"
                        :class="node.broker_connected_sub ? 'animate-pulse' : ''" />
                <text
                  y="2"
                  class="text-[8px] fill-white font-bold"
                  text-anchor="middle"
                >
                  {{ node.broker_connected_sub ? 'S' : '×' }}
                </text>
              </g>

              <!-- MQTT subscription indicator (legacy) -->
              <g v-if="node.subscribed_topics && node.subscribed_topics.length > 0 &&
                       (node.broker_connected_pub === undefined || node.broker_connected_sub === undefined)"
                 :transform="`translate(-25, -25)`">
                <circle r="10" fill="#3b82f6" class="animate-pulse" />
                <text
                  y="3"
                  class="text-xs fill-white"
                  text-anchor="middle"
                  font-family="Font Awesome 6 Free"
                  font-weight="900"
                >
                  &#xf012;
                </text>
              </g>

              <!-- Master node indicator -->
              <g v-if="node.is_master_node" :transform="`translate(0, -50)`">
                <circle r="8" fill="#fbbf24" />
                <text
                  y="3"
                  class="text-xs fill-white"
                  text-anchor="middle"
                  font-family="Font Awesome 6 Free"
                  font-weight="900"
                >
                  &#xf521;
                </text>
              </g>

              <!-- Offline indicator -->
              <g v-if="!node.is_online" :transform="`translate(0, 50)`">
                <circle r="6" fill="#ef4444" />
                <text
                  y="2"
                  class="text-[8px] fill-white"
                  text-anchor="middle"
                >
                  离线
                </text>
              </g>

              <!-- No MQTT subscription indicator -->
              <g v-if="node.has_mqtt_subscription === false" :transform="`translate(-25, 25)`">
                <circle r="8" fill="#94a3b8" />
                <text
                  y="2"
                  class="text-[8px] fill-white"
                  text-anchor="middle"
                >
                  未订阅
                </text>
              </g>
            </g>
          </g>
        </g>
      </svg>

      <!-- Controls -->
      <div class="absolute bottom-4 right-4 flex flex-col gap-2">
        <button
          @click="zoomIn"
          class="btn btn-sm btn-circle btn-primary shadow-lg"
          title="放大"
        >
          <i class="fas fa-plus"></i>
        </button>
        <button
          @click="zoomOut"
          class="btn btn-sm btn-circle btn-primary shadow-lg"
          title="缩小"
        >
          <i class="fas fa-minus"></i>
        </button>
        <button
          @click="resetView"
          class="btn btn-sm btn-circle btn-primary shadow-lg"
          title="重置视图"
        >
          <i class="fas fa-compress"></i>
        </button>
      </div>
    </div>

    <!-- Node Details Panel -->
    <div
      v-if="selectedNode"
      class="absolute bottom-4 left-4 w-80 bg-white rounded-xl shadow-2xl border-2 border-primary/20 p-4 max-h-96 overflow-y-auto"
    >
      <div class="flex justify-between items-start mb-3">
        <div>
          <h5 class="font-bold text-lg text-slate-800">{{ selectedNode.node_name }}</h5>
          <p class="text-xs text-slate-500">{{ selectedNode.location }}</p>
        </div>
        <button
          @click="selectedNode = null"
          class="btn btn-ghost btn-xs btn-circle"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="space-y-3">
        <!-- Status -->
        <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3">
          <span class="text-sm text-slate-600">状态</span>
          <span
            class="badge badge-sm"
            :class="selectedNode.is_online ? 'badge-success' : 'badge-error'"
          >
            {{ selectedNode.is_online ? '在线' : '离线' }}
          </span>
        </div>

        <!-- MQTT Broker 连接状态 -->
        <div class="bg-slate-50 rounded-lg p-3">
          <div class="text-sm text-slate-600 mb-2 font-bold">MQTT Broker 连接</div>
          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-600">发布客户端:</span>
              <span v-if="selectedNode.broker_connected_pub === true" class="text-success font-bold">
                <i class="fas fa-check-circle mr-1"></i>已连接
              </span>
              <span v-else-if="selectedNode.broker_connected_pub === false" class="text-error font-bold">
                <i class="fas fa-times-circle mr-1"></i>未连接
              </span>
              <span v-else class="text-slate-400">
                <i class="fas fa-question-circle mr-1"></i>未知
              </span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-slate-600">订阅客户端:</span>
              <span v-if="selectedNode.broker_connected_sub === true" class="text-success font-bold">
                <i class="fas fa-check-circle mr-1"></i>已连接
              </span>
              <span v-else-if="selectedNode.broker_connected_sub === false" class="text-error font-bold">
                <i class="fas fa-times-circle mr-1"></i>未连接
              </span>
              <span v-else class="text-slate-400">
                <i class="fas fa-question-circle mr-1"></i>未知
              </span>
            </div>
          </div>
        </div>

        <!-- Messages Received -->
        <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3">
          <span class="text-sm text-slate-600">接收消息</span>
          <span class="font-bold text-primary">{{ selectedNode.messages_received }}</span>
        </div>

        <!-- Last Heartbeat -->
        <div class="flex items-center justify-between bg-slate-50 rounded-lg p-3">
          <span class="text-sm text-slate-600">最后心跳</span>
          <span class="text-xs text-slate-600">{{ formatTime(selectedNode.last_heartbeat) }}</span>
        </div>

        <!-- Subscribed Topics -->
        <div class="bg-slate-50 rounded-lg p-3">
          <div class="text-sm text-slate-600 mb-2">订阅主题</div>
          <div class="space-y-1">
            <div
              v-for="topic in selectedNode.subscribed_topics"
              :key="topic"
              class="text-xs font-mono bg-white px-2 py-1 rounded border border-slate-200"
            >
              {{ topic }}
            </div>
          </div>
        </div>

        <!-- Recent Messages -->
        <div class="bg-slate-50 rounded-lg p-3">
          <div class="text-sm text-slate-600 mb-2">最近消息</div>
          <div class="space-y-2 max-h-32 overflow-y-auto">
            <div
              v-for="(msg, idx) in getRecentMessages(selectedNode.location)"
              :key="idx"
              class="text-xs bg-white px-3 py-2 rounded border border-slate-200"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="font-semibold text-primary">{{ msg.sender_location }}</span>
                <span class="text-slate-400">{{ formatShortTime(msg.sent_at) }}</span>
              </div>
              <div class="text-slate-600">{{ msg.file_count }} 个文件</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { mqttApi, remoteSyncApi } from '@/api';

const nodes = ref([]);
const messages = ref([]);
const selectedNode = ref(null);
const loading = ref(false);

const viewBox = ref({
  x: 0,
  y: 0,
  scale: 1
});

// SVG 引用（用于坐标换算）
const svgCanvas = ref(null);

// 手动拖拽后的节点位置覆盖（以 location 为键）
const nodePositions = ref({});

// 正在拖拽的状态
const isDragging = ref(false);
const draggingNode = ref(null);
const dragOffset = ref({ dx: 0, dy: 0 });

function saveNodePositions() {
  try {
    localStorage.setItem('topology-node-positions', JSON.stringify(nodePositions.value));
  } catch (e) {
    console.warn('保存节点位置失败:', e);
  }
}

function loadNodePositions() {
  try {
    const raw = localStorage.getItem('topology-node-positions');
    if (raw) {
      nodePositions.value = JSON.parse(raw) || {};
    }
  } catch (e) {
    console.warn('读取节点位置失败:', e);
  }
}

const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });

// 计算节点位置（圆形布局）- 合并 MQTT 节点和拓扑配置节点
const nodesWithPositions = computed(() => {
  const centerX = 400;
  const centerY = 300;
  const radius = 200;

  // 构建节点映射（以 location 为键）
  const nodeMap = new Map();

  // 1. 从 MQTT 节点状态获取（优先级最高，包含实时状态）
  nodes.value.forEach(n => {
    nodeMap.set(n.location, {
      ...n,
      // 确保有默认值
      node_name: n.node_name || n.location,
      is_master_node: n.is_master_node || false,
      has_mqtt_subscription: n.has_mqtt_subscription !== false  // 默认为 true
    });
  });

  console.log('🔍 MQTT 节点映射:', Array.from(nodeMap.keys()));

  // 2. 从拓扑配置补充（确保所有配置的节点都显示）
  // 添加环境节点（主节点）
  if (topology.value.environments) {
    topology.value.environments.forEach(env => {
      const loc = env.location || env.id;
      if (!nodeMap.has(loc)) {
        console.log('➕ 添加环境节点（未在 MQTT 中）:', loc, env.name);
        nodeMap.set(loc, {
          location: loc,
          node_name: env.name,
          is_online: false,
          is_master_node: true,
          messages_received: 0,
          subscribed_topics: [],
          has_mqtt_subscription: false,
          broker_connected_pub: null,
          broker_connected_sub: null
        });
      } else {
        // 更新名称和主节点标记
        const existing = nodeMap.get(loc);
        if (!existing.node_name || existing.node_name === loc) {
          existing.node_name = env.name;
        }
        existing.is_master_node = true;
        console.log('🔄 更新环境节点:', loc, '-> 主节点');
      }
    });
  }

  // 添加站点节点（从节点）
  if (topology.value.sites) {
    topology.value.sites.forEach(site => {
      const loc = site.location || site.id;
      if (!loc) return;  // 跳过无效位置

      if (!nodeMap.has(loc)) {
        console.log('➕ 添加站点节点（未在 MQTT 中）:', loc, site.name);
        nodeMap.set(loc, {
          location: loc,
          node_name: site.name,
          is_online: false,
          is_master_node: false,
          messages_received: 0,
          subscribed_topics: [],
          has_mqtt_subscription: false,
          broker_connected_pub: null,
          broker_connected_sub: null
        });
      } else {
        // 更新名称
        const existing = nodeMap.get(loc);
        if (!existing.node_name || existing.node_name === loc) {
          existing.node_name = site.name;
        }
        console.log('🔄 更新站点节点:', loc, existing.node_name);
      }
    });
  }

  // 转换为数组并计算位置
  const allNodes = Array.from(nodeMap.values());
  console.log('📊 最终节点列表:', allNodes.length, '个节点', allNodes.map(n => `${n.location}(${n.is_master_node ? '主' : '从'})`));

  // 分离主节点和从节点，主节点放在中心，从节点环绕
  const masterNodes = allNodes.filter(n => n.is_master_node);
  const clientNodes = allNodes.filter(n => !n.is_master_node);

  const positionedNodes = [];

  // 主节点放在中心
  if (masterNodes.length === 1) {
    positionedNodes.push({
      ...masterNodes[0],
      x: centerX,
      y: centerY
    });
  } else if (masterNodes.length > 1) {
    // 多个主节点，小圆环绕
    masterNodes.forEach((node, index) => {
      const angle = (index * 2 * Math.PI) / masterNodes.length - Math.PI / 2;
      positionedNodes.push({
        ...node,
        x: centerX + (radius * 0.3) * Math.cos(angle),
        y: centerY + (radius * 0.3) * Math.sin(angle)
      });
    });
  }

  // 从节点环绕在外圈
  clientNodes.forEach((node, index) => {
    const angle = (index * 2 * Math.PI) / clientNodes.length - Math.PI / 2;
    positionedNodes.push({
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  });

  // 应用手动拖拽后的坐标覆盖（localStorage 持久化）
  const overrides = nodePositions.value || {};
  const withOverride = positionedNodes.map(n => {
    const o = overrides[n.location];
    return o ? { ...n, x: o.x, y: o.y } : n;
  });

  return withOverride;
});

// 拓扑配置数据（环境和站点）
const topology = ref({ environments: [], sites: [], connections: [] });

// 计算订阅连接 - 显示所有配置的拓扑连接，用颜色区分订阅状态
const connections = computed(() => {
  const conns = [];
  const connKeys = new Set();

  // 构建节点位置到MQTT状态的映射
  const nodeStatusMap = new Map();
  nodes.value.forEach(n => {
    nodeStatusMap.set(n.location, n);
  });

  console.log('🔗 开始计算连接关系...');

  // 1. 首先从拓扑配置获取所有主从连接（这是配置的拓扑结构）
  // 环境节点作为主节点，站点作为从节点
  if (topology.value.environments && topology.value.sites) {
    topology.value.environments.forEach(env => {
      const envLocation = env.location || env.id;

      // 找到属于这个环境的所有站点
      const envSites = topology.value.sites.filter(site => site.env_id === env.id);
      console.log(`🌐 环境 ${envLocation} 有 ${envSites.length} 个站点`);

      envSites.forEach(site => {
        const siteLocation = site.location || site.id;
        if (!siteLocation) return;

        const key = `${envLocation}-${siteLocation}`;

        if (!connKeys.has(key)) {

function toLocalCoords(event) {
  const svg = svgCanvas.value;
  if (!svg) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  const x = (event.clientX - rect.left - viewBox.value.x) / viewBox.value.scale;
  const y = (event.clientY - rect.top - viewBox.value.y) / viewBox.value.scale;
  return { x, y };
}

function startNodeDrag(event, node) {
  isDragging.value = true;
  draggingNode.value = node;
  const p = toLocalCoords(event);
  dragOffset.value = { dx: node.x - p.x, dy: node.y - p.y };
}

function onMouseMove(event) {
  if (isDragging.value && draggingNode.value) {
    const p = toLocalCoords(event);
    const nx = p.x + dragOffset.value.dx;
    const ny = p.y + dragOffset.value.dy;
    nodePositions.value = {
      ...nodePositions.value,
      [draggingNode.value.location]: { x: nx, y: ny }
    };
  } else {
    // 回退到平移逻辑
    pan(event);
  }
}

function endPanAndDrag() {
  if (isDragging.value) {
    isDragging.value = false;
    draggingNode.value = null;
    saveNodePositions();
  }
  endPan();
}

          connKeys.add(key);

          // 检查从节点的MQTT订阅状态
          const siteNode = nodeStatusMap.get(siteLocation);
          const isSubscribed = siteNode && siteNode.is_online &&
            (siteNode.broker_connected_sub === true || siteNode.has_mqtt_subscription);
          const isOnline = siteNode && siteNode.is_online;

          console.log(`  ├─ ${envLocation} → ${siteLocation}: ${isSubscribed ? '已订阅' : (isOnline ? '在线未订阅' : '离线')}`);

          conns.push({
            from: envLocation,
            to: siteLocation,
            active: false,
            subscribed: isSubscribed,  // MQTT 已订阅
            online: isOnline,          // 节点在线
            label: isSubscribed ? '✓' : (isOnline ? '○' : '✗'),
            // 连接状态：subscribed=已订阅(绿色), online=在线未订阅(蓝色), offline=离线(灰色)
            status: isSubscribed ? 'subscribed' : (isOnline ? 'online' : 'offline')
          });
        }
      });
    });
  }

  // 2. 从MQTT节点关系补充连接（处理没有在拓扑配置中但有MQTT通信的情况）
  // 获取所有节点的主从标记
  const allNodesWithRole = nodesWithPositions.value;
  const masterNodes = allNodesWithRole.filter(n => n.is_master_node);
  const clientNodes = allNodesWithRole.filter(n => !n.is_master_node);

  console.log(`📡 MQTT 节点: ${masterNodes.length} 个主节点, ${clientNodes.length} 个从节点`);

  masterNodes.forEach(master => {
    clientNodes.forEach(client => {
      const key = `${master.location}-${client.location}`;
      if (!connKeys.has(key)) {
        connKeys.add(key);

        const clientMqttNode = nodeStatusMap.get(client.location);
        const isSubscribed = clientMqttNode && clientMqttNode.is_online &&
          (clientMqttNode.broker_connected_sub === true || clientMqttNode.has_mqtt_subscription);

        console.log(`  ├─ ${master.location} → ${client.location}: ${isSubscribed ? '已订阅' : (client.is_online ? '在线未订阅' : '离线')} (MQTT)`);

        conns.push({
          from: master.location,
          to: client.location,
          active: false,
          subscribed: isSubscribed,
          online: client.is_online,
          label: isSubscribed ? '✓' : (client.is_online ? '○' : '✗'),
          status: isSubscribed ? 'subscribed' : (client.is_online ? 'online' : 'offline')
        });
      }
    });
  });

  // 3. 从消息记录更新活跃状态
  messages.value.forEach(msg => {
    if (!msg.receivers) return;
    msg.receivers.forEach(receiver => {
      const key = `${msg.sender_location}-${receiver.location}`;
      const conn = conns.find(c => `${c.from}-${c.to}` === key);
      if (conn) {
        conn.active = receiver.status === 'processing' || receiver.status === 'received';
        if (receiver.received) {
          conn.label = '✓';
        }
      }
    });
  });

  console.log(`✅ 总共 ${conns.length} 条连接`);
  return conns;
});

function getNodePosition(location) {
  const node = nodesWithPositions.value.find(n => n.location === location);
  return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
}

function getRecentMessages(location) {
  return messages.value
    .filter(msg => {
      return msg.sender_location === location ||
             msg.receivers.some(r => r.location === location);
    })
    .slice(0, 5);
}

async function loadData() {
  loading.value = true;
  try {
    // 并行加载所有数据（每路独立 settle，避免一路失败拖垮整个视图）
    const [nodesResult, messagesResult, topologyResult] = await Promise.allSettled([
      mqttApi.nodes(),
      mqttApi.messages(),
      remoteSyncApi.topology(),
    ]);

    // 加载节点状态
    if (nodesResult.status === 'fulfilled') {
      const nodesData = nodesResult.value || {};
      if (nodesData.success || Array.isArray(nodesData.nodes)) {
        nodes.value = nodesData.nodes || [];
      } else if (Array.isArray(nodesData)) {
        nodes.value = nodesData;
      }
      console.log('📡 加载 MQTT 节点:', nodes.value.length, '个节点');
    } else {
      console.warn('⚠️ 加载 MQTT 节点失败:', nodesResult.reason);
    }

    // 加载消息投递状态
    if (messagesResult.status === 'fulfilled') {
      const messagesData = messagesResult.value || {};
      if (messagesData.success || Array.isArray(messagesData.messages)) {
        messages.value = (messagesData.messages || []).slice(0, 50);
      } else if (Array.isArray(messagesData)) {
        messages.value = messagesData.slice(0, 50);
      }
      console.log('📨 加载消息记录:', messages.value.length, '条消息');
    } else {
      console.warn('⚠️ 加载消息记录失败:', messagesResult.reason);
    }

    // 加载拓扑配置
    if (topologyResult.status === 'fulfilled') {
      const topologyData = topologyResult.value || {};
      const data = topologyData.data || topologyData;
      if (data && (data.environments || data.sites || data.connections)) {
        topology.value = {
          environments: data.environments || [],
          sites: data.sites || [],
          connections: data.connections || [],
        };
        console.log('🗺️ 加载拓扑配置:', {
          environments: topology.value.environments.length,
          sites: topology.value.sites.length,
          connections: topology.value.connections.length,
        });
      } else {
        topology.value = { environments: [], sites: [], connections: [] };
        console.warn('⚠️ 未找到拓扑配置，将仅显示 MQTT 节点');
      }
    } else {
      topology.value = { environments: [], sites: [], connections: [] };
      console.warn('⚠️ 加载拓扑配置失败:', topologyResult.reason);
    }
  } catch (error) {
    console.error('❌ 加载拓扑数据失败:', error);
    topology.value = { environments: [], sites: [], connections: [] };
  } finally {
    loading.value = false;
  }
}

function selectNode(node) {
  selectedNode.value = node;
}

// Pan & Zoom controls
function startPan(event) {
  isPanning.value = true;
  panStart.value = { x: event.clientX - viewBox.value.x, y: event.clientY - viewBox.value.y };
}

function pan(event) {
  if (!isPanning.value) return;
  viewBox.value.x = event.clientX - panStart.value.x;
  viewBox.value.y = event.clientY - panStart.value.y;
}

function endPan() {
  isPanning.value = false;
}

function zoom(event) {
  event.preventDefault();
  const delta = event.deltaY > 0 ? 0.9 : 1.1;
  viewBox.value.scale = Math.max(0.5, Math.min(2, viewBox.value.scale * delta));
}

function zoomIn() {
  viewBox.value.scale = Math.min(2, viewBox.value.scale * 1.2);
}

function zoomOut() {
  viewBox.value.scale = Math.max(0.5, viewBox.value.scale * 0.8);
}

function resetView() {
  viewBox.value = { x: 0, y: 0, scale: 1 };
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
    } else {
      return date.toLocaleTimeString('zh-CN');
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

onMounted(() => {
  loadData();
  refreshInterval = setInterval(loadData, 5000);
});

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});
</script>

<style scoped>
.animate-dash {
  animation: dash 1s linear infinite;
}

@keyframes dash {
  to {
    stroke-dashoffset: -10;
  }
}

.animate-ping {
  animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}

@keyframes ping {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  75%, 100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

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

svg {
  cursor: grab;
}

svg:active {
  cursor: grabbing;
}
</style>
