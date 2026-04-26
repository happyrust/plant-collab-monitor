<template>
  <div class="min-h-screen bg-gray-50 py-6 px-4">
    <div class="max-w-6xl mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6 pb-4 border-b-2 border-blue-200">
        <div>
          <h1 class="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <i class="fas fa-cog text-blue-600"></i>
            站点配置管理
          </h1>
          <p class="text-sm text-slate-600 mt-1">配置本站点的数据库连接、项目路径、MQTT 等参数</p>
        </div>
        <div class="flex gap-2">
          <button
            @click="loadConfig"
            class="btn btn-sm gap-1 bg-gray-200 text-gray-800 border border-gray-300 hover:bg-gray-300 rounded-none"
            :disabled="loading"
          >
            <i class="fas fa-sync" :class="{ 'fa-spin': loading }"></i>
            刷新
          </button>
          <button
            @click="validateConfig"
            class="btn btn-sm gap-1 bg-blue-500 text-white border-0 hover:bg-blue-600 rounded-none"
            :disabled="validating"
          >
            <i class="fas fa-check-circle"></i>
            验证配置
          </button>
          <button
            @click="saveConfig"
            class="btn btn-sm gap-1 bg-green-500 text-white border-0 hover:bg-green-600 rounded-none"
            :disabled="saving"
          >
            <i class="fas fa-save"></i>
            保存配置
          </button>
        </div>
      </div>

      <!-- Inline Banners (P2-1: 替代 legacy alert()) -->
      <div v-if="loadError || actionError || actionSuccess" class="space-y-2 mb-4">
        <div
          v-if="loadError"
          class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2"
        >
          <i class="fas fa-exclamation-circle mt-0.5"></i>
          <span class="flex-1">加载配置失败：{{ loadError }}</span>
          <button
            class="text-rose-500 hover:text-rose-700"
            title="关闭"
            @click="loadError = ''"
          ><i class="fas fa-times"></i></button>
        </div>
        <div
          v-if="actionError"
          class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2"
        >
          <i class="fas fa-exclamation-circle mt-0.5"></i>
          <span class="flex-1">{{ actionError }}</span>
          <button
            class="text-rose-500 hover:text-rose-700"
            title="关闭"
            @click="actionError = ''"
          ><i class="fas fa-times"></i></button>
        </div>
        <div
          v-if="actionSuccess"
          class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-start gap-2"
        >
          <i class="fas fa-check-circle mt-0.5"></i>
          <span class="flex-1">{{ actionSuccess }}</span>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center items-center py-20">
        <div class="loading loading-spinner loading-lg text-blue-500"></div>
      </div>

      <!-- Configuration Form -->
      <div v-else class="space-y-4">
        <!-- 项目设置 -->
        <div class="bg-white border-2 border-gray-200">
          <div class="p-5">
            <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4 pb-3 border-b-2 border-blue-100">
              <i class="fas fa-folder-open text-blue-600"></i>
              项目设置
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">项目路径</span>
                </label>
                <input
                  v-model="config.project_path"
                  type="text"
                  placeholder="D:/AVEVA/Projects/E3D2.1"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
                <label class="label py-1">
                  <span class="label-text-alt text-xs text-gray-600">PDMS/E3D 项目根目录</span>
                </label>
              </div>

              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">项目名称</span>
                </label>
                <input
                  v-model="config.project_name"
                  type="text"
                  placeholder="AvevaMarineSample"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
              </div>

              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">项目代码</span>
                </label>
                <input
                  v-model="config.project_code"
                  type="text"
                  placeholder="1516"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
              </div>

              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">模块</span>
                </label>
                <input
                  v-model="config.module"
                  type="text"
                  placeholder="DESI"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
              </div>

              <div class="form-control md:col-span-2">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">包含的项目列表</span>
                </label>
                <input
                  v-model="includedProjectsText"
                  type="text"
                  placeholder="AvevaMarineSample, AvevaCatalogue, SCB, ZDJ"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
                <label class="label py-1">
                  <span class="label-text-alt text-xs text-gray-600">多个项目用逗号分隔</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 位置和数据库 -->
        <div class="bg-white border-2 border-gray-200">
          <div class="p-5">
            <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4 pb-3 border-b-2 border-green-100">
              <i class="fas fa-map-marker-alt text-green-600"></i>
              位置和数据库
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">站点位置标识</span>
                </label>
                <input
                  v-model="config.location"
                  type="text"
                  placeholder="SJZ"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
                <label class="label py-1">
                  <span class="label-text-alt text-xs text-gray-600">用于 MQTT 和异地同步识别</span>
                </label>
              </div>

              <div ref="dbnoDropdownRef" class="form-control relative">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">数据库编号列表</span>
                </label>
                <div class="relative">
                  <input
                    v-model="locationDbsText"
                    type="text"
                    placeholder="1112, 1113, 1114"
                    class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900 pr-10"
                  />
                  <button
                    type="button"
                    @click.stop="toggleDbnoDropdown"
                    class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-sm gap-1 bg-gray-200 text-gray-800 border-2 border-gray-300 hover:bg-gray-300 rounded-none"
                    title="选择数据库编号"
                  >
                    <i class="fas fa-chevron-down" :class="{ 'fa-chevron-up': showDbnoDropdown }"></i>
                  </button>
                </div>
                <!-- 下拉列表 -->
                <div
                  v-if="showDbnoDropdown"
                  class="absolute z-50 mt-1 w-full bg-white border-2 border-gray-300 shadow-lg max-h-60 overflow-y-auto"
                >
                  <div v-if="loadingDbnos" class="p-3 text-center text-sm text-gray-600">
                    <i class="fas fa-spinner fa-spin"></i> 加载中...
                  </div>
                  <div v-else-if="availableDbnos.length === 0" class="p-3 text-center text-sm text-gray-600">
                    暂无可用数据库
                  </div>
                  <div v-else class="py-1">
                    <div
                      v-for="db in availableDbnos"
                      :key="db.db_num"
                      @click="selectDbno(db.db_num)"
                      class="px-4 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                      :class="{ 'bg-blue-100': isDbnoSelected(db.db_num) }"
                    >
                      <div class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          :checked="isDbnoSelected(db.db_num)"
                          class="checkbox checkbox-sm border-2 border-gray-400 rounded-none"
                          @click.stop="toggleDbno(db.db_num)"
                        />
                        <span class="text-sm font-medium text-gray-900">{{ db.db_num }}</span>
                        <span class="text-xs text-gray-500">- {{ db.name }}</span>
                      </div>
                      <span class="text-xs text-gray-400">{{ db.record_count }} 条记录</span>
                    </div>
                  </div>
                </div>
                <label class="label py-1">
                  <span class="label-text-alt text-xs text-gray-600">多个数据库用逗号分隔</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 数据库连接 -->
        <div class="bg-white border-2 border-gray-200">
          <div class="p-5">
            <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4 pb-3 border-b-2 border-purple-100">
              <i class="fas fa-database text-purple-600"></i>
              数据库连接参数
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">数据库 IP</span>
                </label>
                <div class="flex gap-2">
                  <input
                    v-model="config.ip"
                    type="text"
                    placeholder="127.0.0.1"
                    class="input flex-1 bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                  />
                  <button
                    type="button"
                    @click="fillLocalIP('ip')"
                    class="btn btn-sm gap-1 bg-gray-200 text-gray-800 border-2 border-gray-300 hover:bg-gray-300 rounded-none"
                    title="获取本机IP"
                  >
                    <i class="fas fa-network-wired"></i>
                    <span class="hidden sm:inline">本机IP</span>
                  </button>
                </div>
              </div>

              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">端口</span>
                </label>
                <input
                  v-model="config.port"
                  type="text"
                  placeholder="3306"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
              </div>

              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">用户名</span>
                </label>
                <input
                  v-model="config.user"
                  type="text"
                  placeholder="root"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
              </div>

              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">密码</span>
                </label>
                <input
                  v-model="config.password"
                  type="password"
                  placeholder="••••••••"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- MQTT 配置 -->
        <div class="bg-white border-2 border-gray-200">
          <div class="p-5">
            <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4 pb-3 border-b-2 border-orange-100">
              <i class="fas fa-paper-plane text-orange-600"></i>
              MQTT 配置
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">MQTT Broker 地址</span>
                </label>
                <div class="flex gap-2">
                  <input
                    v-model="config.mqtt_host"
                    type="text"
                    placeholder="192.168.31.58"
                    class="input flex-1 bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                  />
                  <button
                    type="button"
                    @click="fillLocalIP('mqtt_host')"
                    class="btn btn-sm gap-1 bg-gray-200 text-gray-800 border-2 border-gray-300 hover:bg-gray-300 rounded-none"
                    title="获取本机IP"
                  >
                    <i class="fas fa-network-wired"></i>
                    <span class="hidden sm:inline">本机IP</span>
                  </button>
                </div>
              </div>

              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">MQTT 端口</span>
                </label>
                <input
                  v-model.number="config.mqtt_port"
                  type="number"
                  placeholder="1883"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 服务器配置 -->
        <div class="bg-white border-2 border-gray-200">
          <div class="p-5">
            <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4 pb-3 border-b-2 border-red-100">
              <i class="fas fa-server text-red-600"></i>
              服务器配置
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">服务器监听地址</span>
                </label>
                <div class="flex gap-2">
                  <input
                    v-model="config.server_release_ip"
                    type="text"
                    placeholder="127.0.0.1:9099"
                    class="input flex-1 bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                  />
                  <button
                    type="button"
                    @click="fillLocalIP('server_release_ip')"
                    class="btn btn-sm gap-1 bg-gray-200 text-gray-800 border-2 border-gray-300 hover:bg-gray-300 rounded-none"
                    title="获取本机IP（保留端口）"
                  >
                    <i class="fas fa-network-wired"></i>
                    <span class="hidden sm:inline">本机IP</span>
                  </button>
                </div>
              </div>

              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">文件服务器地址</span>
                </label>
                <div class="flex gap-2">
                  <input
                    v-model="config.file_server_host"
                    type="text"
                    placeholder="http://192.168.31.58:8000/assets/archives"
                    class="input flex-1 bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                  />
                  <button
                    type="button"
                    @click="fillLocalIP('file_server_host')"
                    class="btn btn-sm gap-1 bg-gray-200 text-gray-800 border-2 border-gray-300 hover:bg-gray-300 rounded-none"
                    title="获取本机IP（保留协议和端口）"
                  >
                    <i class="fas fa-network-wired"></i>
                    <span class="hidden sm:inline">本机IP</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 模型生成配置 -->
        <div class="bg-white border-2 border-gray-200">
          <div class="p-5">
            <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4 pb-3 border-b-2 border-cyan-100">
              <i class="fas fa-cube text-cyan-600"></i>
              模型生成配置
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-control">
                <label class="label cursor-pointer justify-start gap-3 py-2">
                  <input
                    v-model="config.gen_model"
                    type="checkbox"
                    class="checkbox checkbox-sm border-2 border-gray-400 rounded-none"
                  />
                  <span class="label-text text-sm font-medium text-gray-800">生成模型数据</span>
                </label>
              </div>

              <div class="form-control">
                <label class="label cursor-pointer justify-start gap-3 py-2">
                  <input
                    v-model="config.gen_mesh"
                    type="checkbox"
                    class="checkbox checkbox-sm border-2 border-gray-400 rounded-none"
                  />
                  <span class="label-text text-sm font-medium text-gray-800">生成网格数据</span>
                </label>
              </div>

              <div class="form-control">
                <label class="label cursor-pointer justify-start gap-3 py-2">
                  <input
                    v-model="config.gen_spatial_tree"
                    type="checkbox"
                    class="checkbox checkbox-sm border-2 border-gray-400 rounded-none"
                  />
                  <span class="label-text text-sm font-medium text-gray-800">生成空间树</span>
                </label>
              </div>

              <div class="form-control">
                <label class="label cursor-pointer justify-start gap-3 py-2">
                  <input
                    v-model="config.apply_boolean_operation"
                    type="checkbox"
                    class="checkbox checkbox-sm border-2 border-gray-400 rounded-none"
                  />
                  <span class="label-text text-sm font-medium text-gray-800">应用布尔运算</span>
                </label>
              </div>

              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">网格容差比例</span>
                </label>
                <input
                  v-model.number="config.mesh_tol_ratio"
                  type="number"
                  step="0.1"
                  placeholder="3.0"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
                <label class="label py-1">
                  <span class="label-text-alt text-xs text-gray-600">数值越大，网格越粗糙但性能更好</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- 同步配置 -->
        <div class="bg-white border-2 border-gray-200">
          <div class="p-5">
            <h2 class="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4 pb-3 border-b-2 border-indigo-100">
              <i class="fas fa-sync text-indigo-600"></i>
              同步配置
            </h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="form-control">
                <label class="label cursor-pointer justify-start gap-3 py-2">
                  <input
                    v-model="config.total_sync"
                    type="checkbox"
                    class="checkbox checkbox-sm border-2 border-gray-400 rounded-none"
                  />
                  <span class="label-text text-sm font-medium text-gray-800">完全同步</span>
                </label>
              </div>

              <div class="form-control">
                <label class="label cursor-pointer justify-start gap-3 py-2">
                  <input
                    v-model="config.incr_sync"
                    type="checkbox"
                    class="checkbox checkbox-sm border-2 border-gray-400 rounded-none"
                  />
                  <span class="label-text text-sm font-medium text-gray-800">增量同步</span>
                </label>
              </div>

              <div class="form-control">
                <label class="label cursor-pointer justify-start gap-3 py-2">
                  <input
                    v-model="config.sync_live"
                    type="checkbox"
                    class="checkbox checkbox-sm border-2 border-gray-400 rounded-none"
                  />
                  <span class="label-text text-sm font-medium text-gray-800">实时同步（SurrealDB）</span>
                </label>
              </div>

              <div class="form-control md:col-span-2">
                <label class="label py-1">
                  <span class="label-text text-sm font-medium text-gray-800">允许同步推送的数据库类型</span>
                </label>
                <input
                  v-model="syncPushDbTypesText"
                  type="text"
                  placeholder="DESI, CATA, DICT"
                  class="input w-full bg-white border-2 border-gray-300 focus:border-blue-500 focus:outline-none rounded-none text-gray-900"
                />
                <label class="label py-1">
                  <span class="label-text-alt text-xs text-gray-600">多个类型用逗号分隔，空列表表示允许所有类型。默认只同步 DESI 类型</span>
                </label>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Validation Errors Modal -->
    <div v-if="validationErrors.length > 0" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="bg-white border-2 border-red-300 p-6 max-w-md w-full mx-4 shadow-lg">
        <h3 class="text-base font-semibold text-red-600 mb-4 flex items-center gap-2 pb-3 border-b-2 border-red-200">
          <i class="fas fa-exclamation-triangle"></i>
          配置验证失败
        </h3>
        <ul class="list-disc list-inside space-y-2 text-sm text-gray-800 mb-4">
          <li v-for="(error, idx) in validationErrors" :key="idx">{{ error }}</li>
        </ul>
        <div class="flex justify-end">
          <button @click="validationErrors = []" class="btn btn-sm bg-blue-500 text-white border-0 hover:bg-blue-600 rounded-none">
            知道了
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { siteConfigApi, http } from '@/api';

const loading = ref(false);
const saving = ref(false);
const validating = ref(false);
const validationErrors = ref([]);
const showDbnoDropdown = ref(false);
const loadingDbnos = ref(false);
const availableDbnos = ref([]);
const dbnoDropdownRef = ref(null);

// P2-1: inline banner 替代 legacy alert()，与 SettingsView 风格一致
const loadError = ref('');
const actionError = ref('');
const actionSuccess = ref('');
let successTimer = null;

function flashSuccess(msg) {
  actionSuccess.value = msg;
  actionError.value = '';
  if (successTimer) clearTimeout(successTimer);
  successTimer = setTimeout(() => {
    actionSuccess.value = '';
    successTimer = null;
  }, 5000);
}

function setActionError(msg) {
  actionError.value = msg;
  actionSuccess.value = '';
  if (successTimer) {
    clearTimeout(successTimer);
    successTimer = null;
  }
}

const config = ref({
  // 项目设置
  project_path: '',
  included_projects: [],
  project_name: '',
  project_code: '',
  module: '',

  // 位置和数据库
  location: '',
  location_dbs: [],

  // 数据库连接参数
  ip: '',
  user: '',
  password: '',
  port: '',

  // MQTT 配置
  mqtt_host: '',
  mqtt_port: 1883,

  // 服务器配置
  server_release_ip: '',
  file_server_host: '',

  // 模型生成配置
  gen_model: false,
  gen_mesh: false,
  gen_spatial_tree: false,
  apply_boolean_operation: false,
  mesh_tol_ratio: 3.0,

  // 同步配置
  total_sync: false,
  incr_sync: false,
  sync_live: false,
  sync_push_db_types: [],
});

// 将数组转为逗号分隔的字符串（用于输入框）
const includedProjectsText = computed({
  get: () => config.value.included_projects.join(', '),
  set: (val) => {
    config.value.included_projects = val.split(',').map(s => s.trim()).filter(s => s);
  }
});

const locationDbsText = computed({
  get: () => config.value.location_dbs.join(', '),
  set: (val) => {
    config.value.location_dbs = val.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
  }
});

const syncPushDbTypesText = computed({
  get: () => config.value.sync_push_db_types.join(', '),
  set: (val) => {
    config.value.sync_push_db_types = val.split(',').map(s => s.trim()).filter(s => s);
  }
});

// 检测是否是 Windows 路径
// 兼容配置文件中的各种格式：D:/path, D:\path, D:\\path
function isWindowsPath(path) {
  if (!path) return false;
  // Windows 绝对路径：以盘符开头（如 D:/ 或 D:\ 或 D:\\）
  // 注意：TOML 中的 D:\\path 会被解析为 D:\path（单个反斜杠）
  if (/^[A-Za-z]:[/\\]/.test(path)) {
    return true;
  }
  // Windows UNC 路径（\\server\share 或 //server/share）
  // 注意：TOML 中的 \\\\server\\share 会被解析为 \\server\share
  if (/^[/\\]{2}/.test(path)) {
    return true;
  }
  return false;
}

// 将 Windows 路径格式转换为显示格式（\\ -> /）
// 只在是 Windows 路径时才转换
function normalizePathForDisplay(path) {
  if (!path) return path;
  // 只在是 Windows 路径时才转换反斜杠
  if (isWindowsPath(path)) {
    return path.replace(/\\/g, '/');
  }
  return path;
}

// 将显示格式转换为 Windows 路径格式（/ -> \\）
// 只在是 Windows 路径时才转换
function normalizePathForSave(path) {
  if (!path) return path;
  
  // 排除 URL 路径（http://, https://, ftp:// 等）
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(path)) {
    return path;
  }
  
  // 只在是 Windows 路径时才转换
  if (isWindowsPath(path)) {
    // Windows 绝对路径：以盘符开头（如 D:/ 或 D:\）
    if (/^[A-Za-z]:[/\\]/.test(path)) {
      return path.replace(/\//g, '\\');
    }
    // Windows UNC 路径（\\server\share 或 //server/share）
    if (/^[/\\]{2}/.test(path)) {
      return path.replace(/\//g, '\\');
    }
  }
  
  // 非 Windows 路径保持原样
  return path;
}

async function loadConfig() {
  loading.value = true;
  loadError.value = '';
  try {
    const data = await siteConfigApi.get();
    if (data?.status === 'success' || data?.config) {
      config.value = data.config;
      if (config.value?.project_path) {
        config.value.project_path = normalizePathForDisplay(config.value.project_path);
      }
    } else {
      loadError.value = data?.message || '未返回有效配置';
    }
  } catch (error) {
    console.error('加载配置失败:', error?.message || error);
    loadError.value = error?.message || String(error);
  } finally {
    loading.value = false;
  }
}

async function validateConfig() {
  validating.value = true;
  validationErrors.value = [];
  setActionError('');

  try {
    const configToValidate = {
      ...config.value,
      project_path: normalizePathForSave(config.value.project_path)
    };

    const data = await siteConfigApi.validate(configToValidate);
    if (data?.status === 'success') {
      flashSuccess(data.message || '校验通过');
    } else {
      validationErrors.value = data?.errors || [data?.message || '校验失败'];
    }
  } catch (error) {
    console.error('验证配置失败:', error?.message || error);
    setActionError('验证失败：' + (error?.message || String(error)));
  } finally {
    validating.value = false;
  }
}

async function saveConfig() {
  if (!confirm('确定要保存配置吗？某些配置需要重启服务器后生效。')) {
    return;
  }

  saving.value = true;
  setActionError('');
  try {
    const configToSave = {
      ...config.value,
      project_path: normalizePathForSave(config.value.project_path)
    };

    const data = await siteConfigApi.save(configToSave);
    if (data?.status === 'success') {
      flashSuccess(data.message || '保存成功');
      config.value.project_path = normalizePathForDisplay(configToSave.project_path);
    } else {
      setActionError(data?.message || '保存失败');
    }
  } catch (error) {
    console.error('保存配置失败:', error?.message || error);
    setActionError('保存失败：' + (error?.message || String(error)));
  } finally {
    saving.value = false;
  }
}

// 获取服务器IP地址（从后端API）
const getServerIP = async () => {
  try {
    const data = await siteConfigApi.serverIp();
    if (data?.status === 'success' && data?.ip) {
      return data.ip;
    }
  } catch (error) {
    console.error('获取服务器IP失败:', error?.message || error);
  }
  // 如果API失败，fallback到127.0.0.1
  return '127.0.0.1';
};

// 填充本机IP到指定字段
const fillLocalIP = async (field) => {
  const serverIP = await getServerIP();
  const port = window.location.port;
  const protocol = window.location.protocol;
  
  switch (field) {
    case 'ip':
      // 数据库IP：直接填充IP地址
      config.value.ip = serverIP;
      break;
      
    case 'mqtt_host':
      // MQTT Broker地址：直接填充IP地址
      config.value.mqtt_host = serverIP;
      break;
      
    case 'server_release_ip':
      // 服务器监听地址：格式为 IP:PORT
      // 如果已有值，尝试保留端口；否则使用当前端口
      if (config.value.server_release_ip) {
        const match = config.value.server_release_ip.match(/:(\d+)$/);
        const existingPort = match ? match[1] : (port || '9099');
        config.value.server_release_ip = `${serverIP}:${existingPort}`;
      } else {
        config.value.server_release_ip = `${serverIP}:${port || '9099'}`;
      }
      break;
      
    case 'file_server_host':
      // 文件服务器地址：格式为 http://IP:PORT/path
      // 如果已有值，尝试保留协议、端口和路径；否则构建完整URL
      if (config.value.file_server_host) {
        try {
          const url = new URL(config.value.file_server_host);
          // 保留协议、端口和路径，只替换hostname
          url.hostname = serverIP;
          config.value.file_server_host = url.toString();
        } catch (e) {
          // 如果不是有效URL，尝试从字符串中提取信息
          const currentValue = config.value.file_server_host;
          // 尝试匹配 http://IP:PORT/path 或 IP:PORT/path 格式
          const urlMatch = currentValue.match(/^(https?:\/\/)?([^:\/]+)(:(\d+))?(\/.*)?$/);
          if (urlMatch) {
            const existingProtocol = urlMatch[1] || protocol + '//';
            const existingPort = urlMatch[4] || (port || '8080');
            const existingPath = urlMatch[5] || '/assets/archives';
            config.value.file_server_host = `${existingProtocol}${serverIP}:${existingPort}${existingPath}`;
          } else {
            // 如果无法解析，构建新的URL
            const defaultPort = port || '8080';
            config.value.file_server_host = `${protocol}//${serverIP}:${defaultPort}/assets/archives`;
          }
        }
      } else {
        // 如果没有值，构建默认URL
        const defaultPort = port || '8080';
        config.value.file_server_host = `${protocol}//${serverIP}:${defaultPort}/assets/archives`;
      }
      break;
  }
};

// 切换数据库编号下拉列表
const toggleDbnoDropdown = async () => {
  showDbnoDropdown.value = !showDbnoDropdown.value;
  if (showDbnoDropdown.value && availableDbnos.value.length === 0) {
    await loadAvailableDbnos();
  }
};

// 加载可用的数据库编号列表
const loadAvailableDbnos = async () => {
  loadingDbnos.value = true;
  try {
    // /api/databases 暂未纳入 site-config api 模块，临时用 http 直调；
    // 后续若纳入异地协同领域，应迁入 incrementalApi 或新建 databasesApi。
    const data = await http.get('/api/databases');
    availableDbnos.value = Array.isArray(data) ? data : [];
    availableDbnos.value.sort((a, b) => a.db_num - b.db_num);
  } catch (error) {
    console.error('获取数据库列表失败:', error?.message || error);
  } finally {
    loadingDbnos.value = false;
  }
};

// 检查数据库编号是否已选中
const isDbnoSelected = (dbNum) => {
  return config.value.location_dbs.includes(dbNum);
};

// 切换数据库编号选择状态
const toggleDbno = (dbNum) => {
  const index = config.value.location_dbs.indexOf(dbNum);
  if (index > -1) {
    config.value.location_dbs.splice(index, 1);
  } else {
    config.value.location_dbs.push(dbNum);
    config.value.location_dbs.sort((a, b) => a - b);
  }
};

// 选择数据库编号（点击整行）
const selectDbno = (dbNum) => {
  toggleDbno(dbNum);
};

// 点击外部关闭下拉列表
const handleClickOutside = (event) => {
  if (dbnoDropdownRef.value && !dbnoDropdownRef.value.contains(event.target)) {
    showDbnoDropdown.value = false;
  }
};

onMounted(() => {
  loadConfig();
  // 监听点击事件，点击外部时关闭下拉列表
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  if (successTimer) {
    clearTimeout(successTimer);
    successTimer = null;
  }
});
</script>

<style scoped>
/* 自定义样式 */
</style>
