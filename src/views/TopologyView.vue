<template>
  <div class="h-full flex flex-col bg-base-100 rounded-xl shadow-sm border border-base-200 overflow-hidden">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-base-200 flex items-center justify-between bg-base-50/50">
      <h3 class="font-bold text-xl flex items-center gap-3 text-slate-800">
        <i class="fas fa-network-wired text-primary"></i>
        异地拓扑管理
      </h3>
      <div class="flex items-center gap-3">
        <div class="hidden xl:block text-xs text-slate-500">
          配置各个环境（Environments）及其包含的站点（Sites）
        </div>
        <!-- 运行时状态（watcher + MQTT 订阅）· 30s 轮询；data-tour 供 /guide 的高亮导览定位 -->
        <div class="flex items-center gap-2" data-testid="remote-runtime-status" data-tour="runtime-pill">
          <span
            :class="[
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
              runtimeActive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
            ]"
            :title="runtimeTitle"
          >
            <span :class="['w-1.5 h-1.5 rounded-full', runtimeActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400']"></span>
            <template v-if="runtime === null">运行时 · 未知</template>
            <template v-else-if="runtimeActive">运行时 · 已激活 {{ activeEnvName }}</template>
            <template v-else-if="runtime.running === true">运行时 · 运行中 · 未激活环境</template>
            <template v-else>运行时 · 未激活</template>
          </span>
          <button
            v-if="runtimeActive || runtime?.running === true"
            @click="handleStopRuntime"
            class="btn btn-xs btn-outline btn-error gap-1"
            :disabled="stoppingRuntime"
            title="停止后端 watcher + MQTT 订阅"
            data-tour="stop-runtime"
          >
            <i class="fas fa-stop"></i>
            {{ stoppingRuntime ? '停止中...' : '停止运行时' }}
          </button>
          <button
            @click="loadRuntimeStatus"
            class="btn btn-xs btn-ghost"
            :disabled="runtimeLoading"
            title="刷新运行时状态"
          >
            <i class="fas fa-sync-alt" :class="{ 'fa-spin': runtimeLoading }"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden p-4 lg:p-6 gap-4 lg:gap-6">
      <!-- Left: Environments -->
      <div class="w-full lg:w-2/5 shrink-0 flex flex-col bg-gradient-to-br from-blue-50/50 to-indigo-50/30 rounded-xl border-2 border-blue-100 p-5 shadow-sm min-h-[400px] lg:min-h-0" data-tour="env-list">
        <div class="flex justify-between items-center mb-5 shrink-0">
          <div>
            <h4 class="font-bold text-lg text-slate-800 flex items-center gap-2">
              <i class="fas fa-layer-group text-blue-600"></i>
              环境列表
            </h4>
            <p class="text-xs text-slate-500 mt-1">共 {{ envs.length }} 个环境</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="handleImportEnvFromDbOption"
              class="btn btn-sm btn-outline gap-2"
              :disabled="importingEnv"
              title="读取后端当前进程的 DbOption.toml，生成一个环境（不改写配置、不激活运行时）"
              data-tour="import-env"
            >
              <i :class="importingEnv ? 'fas fa-spinner fa-spin' : 'fas fa-file-import'"></i>
              <span class="hidden sm:inline">从 DbOption 导入</span>
            </button>
            <button @click="handleOpenAddEnv" class="btn btn-sm btn-primary gap-2 shadow-md hover:shadow-lg transition-shadow" data-tour="create-env">
              <i class="fas fa-plus"></i>
              <span class="hidden sm:inline">新建</span>
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto space-y-3 pr-2">
          <div v-if="loadingEnvs && envs.length === 0" class="flex flex-col items-center justify-center py-16">
            <span class="loading loading-spinner loading-lg text-primary"></span>
            <p class="text-sm text-slate-500 mt-3">加载中...</p>
          </div>
          <div v-else-if="envs.length === 0" class="text-center py-16 text-slate-500 bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <i class="fas fa-folder-open text-4xl text-slate-300 mb-3"></i>
            <p class="font-medium text-slate-600 dark:text-slate-400">暂无环境配置</p>
            <p class="text-xs mt-2 text-slate-400">点击右上角「新建」手填，或「从 DbOption 导入」直接取后端当前配置</p>
          </div>
          <div
            v-for="env in envs"
            :key="env.id"
            @click="selectEnv(env)"
            :class="[
              'card bg-white dark:bg-slate-800 shadow-sm cursor-pointer hover:shadow-lg transition-all duration-200 border-2',
              selectedEnv?.id === env.id
                ? 'border-primary ring-2 ring-primary/20 shadow-primary/10'
                : 'border-slate-200 hover:border-blue-200'
            ]"
          >
            <div class="card-body p-5">
              <div class="flex justify-between items-start mb-2">
                <h5 class="font-bold text-base truncate text-slate-800 flex items-center gap-2">
                  <i class="fas fa-server text-primary text-sm"></i>
                  {{ env.name }}
                  <span
                    v-if="isActiveEnv(env)"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800"
                    title="当前后端运行时正在使用该环境"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    已激活
                  </span>
                </h5>
                <button
                  @click.stop="handleDeleteEnv(env.id)"
                  class="btn btn-ghost btn-xs text-error opacity-40 hover:opacity-100 transition-opacity"
                  title="删除环境"
                >
                  <i class="fas fa-trash"></i>
                </button>
              </div>
              <div class="text-xs text-slate-600 dark:text-slate-400 space-y-2 mt-2 bg-slate-50 rounded-lg p-3 border border-slate-100">
                <p class="flex items-center gap-2" title="文件服务地址">
                  <i class="fas fa-hdd w-4 text-center text-blue-500"></i>
                  <span class="truncate font-mono text-[11px]">{{ env.file_server_host || '未配置文件服务' }}</span>
                </p>
                <p class="flex items-center gap-2" title="MQTT 地址">
                  <i class="fas fa-signal w-4 text-center text-green-500"></i>
                  <span class="truncate font-mono text-[11px]">{{ env.mqtt_host ? `${env.mqtt_host}:${env.mqtt_port}` : '未配置 MQTT' }}</span>
                </p>
              </div>

              <!-- 部署动作：连通性诊断 + 推到运行时；data-tour 只标在选中的那张卡上，供 /guide 高亮导览定位 -->
              <div class="mt-3 flex flex-wrap items-center gap-1.5" @click.stop>
                <button
                  @click.stop="handleTestMqtt(env)"
                  class="btn btn-xs btn-ghost gap-1"
                  :disabled="isEnvBusy(env.id)"
                  title="TCP 探测该环境的 mqtt_host:mqtt_port"
                  :data-tour="tourAnchor(env, 'env-test-mqtt')"
                >
                  <i class="fas fa-signal text-green-600" :class="{ 'fa-fade': envBusy[String(env.id)] === 'test-mqtt' }"></i>
                  测 MQTT
                </button>
                <button
                  @click.stop="handleTestHttp(env)"
                  class="btn btn-xs btn-ghost gap-1"
                  :disabled="isEnvBusy(env.id)"
                  title="HTTP 探测该环境的 file_server_host"
                  :data-tour="tourAnchor(env, 'env-test-http')"
                >
                  <i class="fas fa-hdd text-blue-600" :class="{ 'fa-fade': envBusy[String(env.id)] === 'test-http' }"></i>
                  测文件服务
                </button>
                <button
                  @click.stop="handleApplyEnv(env)"
                  class="btn btn-xs btn-outline gap-1"
                  :disabled="isEnvBusy(env.id)"
                  title="把该环境写入后端 DbOption.toml（不重启运行态）"
                  :data-tour="tourAnchor(env, 'env-apply')"
                >
                  <i class="fas fa-file-export"></i>
                  应用
                </button>
                <button
                  @click.stop="handleActivateEnv(env)"
                  class="btn btn-xs btn-primary gap-1"
                  :disabled="isEnvBusy(env.id) || isActiveEnv(env)"
                  :title="isActiveEnv(env) ? '该环境已是当前运行态' : '把连接参数写入 DbOption.toml 并起 / 重建中继运行态（MQTT 订阅 + 源文件轮询）'"
                  :data-tour="tourAnchor(env, 'env-activate')"
                >
                  <i class="fas fa-play"></i>
                  {{ envBusy[String(env.id)] === 'activate' ? '激活中...' : '激活' }}
                </button>
              </div>
              <div
                v-if="envActionResults[String(env.id)]"
                :class="[
                  'mt-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed break-all',
                  envActionResults[String(env.id)]?.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300'
                ]"
              >
                <i :class="['fas mr-1', envActionResults[String(env.id)]?.ok ? 'fa-check-circle' : 'fa-exclamation-triangle']"></i>
                {{ envActionResults[String(env.id)]?.text }}
                <span class="opacity-60 ml-1">{{ envActionResults[String(env.id)]?.at }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Sites -->
      <div class="flex-1 flex flex-col bg-gradient-to-br from-green-50/40 to-emerald-50/20 rounded-xl border-2 border-green-100 relative overflow-hidden shadow-sm min-h-[400px] lg:min-h-0" data-tour="sites-panel">
        <div v-if="!selectedEnv" class="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-slate-800/80 backdrop-blur-sm z-10 text-slate-400">
          <i class="fas fa-hand-point-left text-6xl mb-6 text-slate-200 animate-pulse"></i>
          <p class="text-lg font-medium text-slate-500">请先在左侧选择一个环境</p>
          <p class="text-sm text-slate-400 mt-2">选择环境后可查看其包含的站点</p>
        </div>

        <div class="p-5 border-b-2 border-green-100 flex justify-between items-center bg-white dark:bg-slate-800/60">
          <div>
            <h4 class="font-bold text-lg text-slate-800 flex items-center gap-2">
              <i class="fas fa-sitemap text-green-600"></i>
              站点列表
            </h4>
            <p class="text-xs text-slate-500 mt-1" v-if="selectedEnv">
              当前环境: <span class="font-semibold text-primary px-2 py-0.5 bg-blue-50 rounded">{{ selectedEnv.name }}</span>
              <span class="ml-2 text-slate-400">• {{ sites.length }} 个站点</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="checkAllSitesStatus"
              class="btn btn-sm btn-ghost gap-2"
              :disabled="loadingSites || sites.length === 0 || checkingStatus"
              title="刷新站点状态"
            >
              <i class="fas fa-sync-alt" :class="{ 'fa-spin': checkingStatus }"></i>
              刷新状态
            </button>
            <button
              @click="handleOpenAddSite"
              class="btn btn-sm btn-success gap-2 shadow-md hover:shadow-lg transition-shadow text-white"
              :disabled="!selectedEnv"
              :data-tour="selectedEnv ? 'add-site' : null"
            >
              <i class="fas fa-plus"></i>
              添加站点
            </button>
          </div>
        </div>

        <div class="overflow-x-auto flex-1 p-4">
          <div v-if="loadingSites" class="flex flex-col items-center justify-center py-16">
            <span class="loading loading-spinner loading-lg text-success"></span>
            <p class="text-sm text-slate-500 mt-3">加载站点中...</p>
          </div>
          <table v-else class="table w-full">
            <thead>
              <tr class="bg-gradient-to-r from-green-100/50 to-emerald-100/30 border-b-2 border-green-200">
                <th class="rounded-l-lg text-slate-700 dark:text-slate-300 font-bold">
                  <i class="fas fa-tag mr-2 text-green-600"></i>站点名称
                </th>
                <th class="text-slate-700 dark:text-slate-300 font-bold">
                  <i class="fas fa-link mr-2 text-blue-600"></i>HTTP 地址
                </th>
                <th class="hidden 2xl:table-cell text-slate-700 dark:text-slate-300 font-bold">
                  <i class="fas fa-comment mr-2 text-amber-600"></i>备注
                </th>
                <th class="text-slate-700 dark:text-slate-300 font-bold">角色</th>
                <th class="text-slate-700 dark:text-slate-300 font-bold">状态</th>
                <th class="rounded-r-lg text-right text-slate-700 dark:text-slate-300 font-bold">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="sites.length === 0">
                <td colspan="6" class="text-center py-20">
                  <div class="flex flex-col items-center text-slate-400">
                    <i class="fas fa-inbox text-5xl text-slate-200 mb-4"></i>
                    <p class="font-medium text-slate-500">该环境下暂无站点</p>
                    <p class="text-xs mt-2">点击右上角"添加站点"按钮创建新站点</p>
                  </div>
                </td>
              </tr>
              <tr
                v-for="(site, index) in sites"
                :key="site.id"
                @click="handleViewSiteDetails(site)"
                class="hover:bg-green-50/30 transition-colors border-b border-green-100/50 cursor-pointer"
              >
                <td class="font-semibold text-slate-800">
                  <div class="flex items-center gap-2">
                    <div :class="['w-2 h-2 rounded-full', isCurrentSite(site) ? 'bg-emerald-500' : 'bg-green-500']"></div>
                    <i v-if="isCurrentSite(site)" class="fas fa-home text-emerald-600 text-base animate-pulse" title="当前站点"></i>
                    {{ site.name }}
                    <span v-if="isCurrentSite(site)" class="text-xs text-emerald-600 font-medium ml-1">(当前站点)</span>
                  </div>
                </td>
                <td>
                  <code class="text-xs text-slate-600 dark:text-slate-400 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200 inline-block">
                    {{ site.http_host || '-' }}
                  </code>
                </td>
                <td class="hidden 2xl:table-cell text-sm text-slate-600 dark:text-slate-400 truncate max-w-[250px]" :title="site.notes || ''">
                  {{ site.notes || '-' }}
                </td>
                <td>
                  <span
                    v-if="isCurrentSite(site)"
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-200"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    主站
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border bg-blue-50 text-blue-700 border-blue-200"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    从站
                  </span>
                </td>
                <td>
                  <div class="flex items-center gap-2">
                    <div
                      v-if="site.online_status === 'checking'"
                      class="loading loading-spinner loading-xs text-slate-400"
                    ></div>
                    <div
                      v-else-if="site.online_status === 'online'"
                      class="flex items-center gap-1.5"
                    >
                      <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      <span class="text-xs text-green-600 font-semibold">在线</span>
                    </div>
                    <div
                      v-else-if="site.online_status === 'offline'"
                      class="flex items-center gap-1.5"
                    >
                      <div class="w-2 h-2 rounded-full bg-red-500"></div>
                      <span class="text-xs text-red-600 font-semibold">离线</span>
                    </div>
                    <div
                      v-else
                      class="flex items-center gap-1.5"
                    >
                      <div class="w-2 h-2 rounded-full bg-slate-400"></div>
                      <span class="text-xs text-slate-500">未知</span>
                    </div>
                  </div>
                  <!-- 后端侧 HTTP 诊断结果（POST /api/remote-sync/sites/{id}/test-http）· 完整信息在 title -->
                  <div
                    v-if="siteTestResults[String(site.id)]"
                    :class="[
                      'mt-1 text-[11px] whitespace-nowrap cursor-help',
                      siteTestResults[String(site.id)]?.ok ? 'text-emerald-600' : 'text-rose-600'
                    ]"
                    :title="`后端探测：${siteTestResults[String(site.id)]?.text}`"
                    data-testid="site-test-http-result"
                  >
                    <i :class="['fas mr-1', siteTestResults[String(site.id)]?.ok ? 'fa-check-circle' : 'fa-exclamation-triangle']"></i>
                    {{ siteTestResults[String(site.id)]?.summary }}
                  </div>
                </td>
                <td class="text-right whitespace-nowrap">
                  <button
                    @click.stop="handleTestSiteHttp(site)"
                    class="btn btn-ghost btn-xs text-blue-600 hover:bg-blue-50 tooltip tooltip-left"
                    data-tip="由后端探测该站点 HTTP 可达性"
                    :disabled="siteTesting[String(site.id)]"
                    :data-tour="index === 0 ? 'site-test-http' : null"
                  >
                    <i class="fas fa-stethoscope" :class="{ 'fa-fade': siteTesting[String(site.id)] }"></i>
                  </button>
                  <button
                    @click.stop="handleOpenEditSite(site)"
                    class="btn btn-ghost btn-xs text-slate-600 hover:bg-slate-100 tooltip tooltip-left"
                    data-tip="编辑站点"
                    :data-tour="index === 0 ? 'site-edit' : null"
                  >
                    <i class="fas fa-pen"></i>
                  </button>
                  <button
                    v-if="!isCurrentSite(site)"
                    @click.stop="handleDeleteSite(site.id)"
                    class="btn btn-ghost btn-xs text-error hover:bg-error/10 tooltip tooltip-left"
                    data-tip="删除站点"
                  >
                    <i class="fas fa-trash"></i>
                  </button>
                  <span
                    v-else
                    class="tooltip tooltip-left"
                    data-tip="主站点不能删除"
                  >
                    <button
                      class="btn btn-ghost btn-xs text-slate-400 cursor-not-allowed"
                      disabled
                    >
                      <i class="fas fa-trash"></i>
                    </button>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Add Env Modal -->
    <dialog class="modal" :class="{ 'modal-open': showAddEnv }">
      <div class="modal-box max-w-2xl">
        <button @click="showAddEnv = false" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
        <div class="flex items-center gap-3 mb-6">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-lg">
            <i class="fas fa-layer-group text-xl"></i>
          </div>
          <div>
            <h3 class="font-bold text-xl text-slate-800">添加新环境</h3>
            <p class="text-sm text-slate-500">配置一个新的部署环境</p>
          </div>
        </div>
        <form @submit.prevent="handleSubmitEnv">
          <div class="form-control w-full mb-4">
            <label class="label">
              <span class="label-text font-semibold text-slate-700 dark:text-slate-300">
                <i class="fas fa-tag mr-2 text-blue-600"></i>环境名称 <span class="text-error">*</span>
              </span>
            </label>
            <input
              v-model="envForm.name"
              type="text"
              class="input input-bordered w-full focus:input-primary"
              required
              placeholder="例如: 北京总部、上海分部"
            />
          </div>
          <div class="form-control w-full mb-4">
            <label class="label">
              <span class="label-text font-semibold text-slate-700 dark:text-slate-300">
                <i class="fas fa-hdd mr-2 text-blue-600"></i>文件服务地址
              </span>
            </label>
            <input
              v-model="envForm.file_server_host"
              type="url"
              class="input input-bordered w-full focus:input-primary font-mono text-sm"
              placeholder="http://192.168.1.10:3000"
            />
            <label class="label">
              <span class="label-text-alt text-slate-500">用于文件同步的 HTTP 服务地址</span>
            </label>
          </div>
          <div class="form-control w-full mb-4">
            <label class="label">
              <span class="label-text font-semibold text-slate-700 dark:text-slate-300">
                <i class="fas fa-map-marker-alt mr-2 text-blue-600"></i>位置
              </span>
            </label>
            <input
              v-model="envForm.location"
              type="text"
              class="input input-bordered w-full focus:input-primary"
              placeholder="如: 上海园区"
            />
          </div>
          <div class="form-control w-full mb-4">
            <label class="label">
              <span class="label-text font-semibold text-slate-700 dark:text-slate-300">
                <i class="fas fa-database mr-2 text-indigo-600"></i>location_dbs <span class="text-error">*</span>
              </span>
            </label>
            <input
              v-model="envForm.location_dbs"
              type="text"
              class="input input-bordered w-full focus:input-primary font-mono text-sm"
              required
              placeholder="7999,8001,8002"
            />
            <label class="label">
              <span class="label-text-alt text-slate-500">逗号分隔的 dbnum 列表</span>
            </label>
          </div>
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold text-slate-700 dark:text-slate-300">
                  <i class="fas fa-signal mr-2 text-green-600"></i>MQTT 主机
                </span>
              </label>
              <input
                v-model="envForm.mqtt_host"
                type="text"
                class="input input-bordered w-full focus:input-primary font-mono text-sm"
                placeholder="192.168.1.10"
              />
            </div>
            <div class="form-control w-full">
              <label class="label">
                <span class="label-text font-semibold text-slate-700 dark:text-slate-300">MQTT 端口</span>
              </label>
              <input
                v-model.number="envForm.mqtt_port"
                type="number"
                class="input input-bordered w-full focus:input-primary"
                placeholder="1883"
              />
            </div>
          </div>
          <div class="alert alert-info shadow-sm mt-4">
            <i class="fas fa-info-circle"></i>
            <span class="text-sm">MQTT 用于实时消息推送，可选配置</span>
          </div>
          <div class="modal-action mt-6">
            <button type="button" class="btn btn-ghost" @click="showAddEnv = false">取消</button>
            <button type="submit" class="btn btn-primary gap-2 shadow-md" :disabled="submitting">
              <i class="fas fa-check"></i>
              {{ submitting ? '保存中...' : '保存环境' }}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click="showAddEnv = false">close</button>
      </form>
    </dialog>

    <!-- Add Site Modal -->
    <dialog class="modal" :class="{ 'modal-open': showAddSite }">
      <div class="modal-box max-w-2xl shadow-2xl border border-slate-200/50 bg-white dark:bg-slate-800/95 backdrop-blur-sm">
        <!-- 关闭按钮 -->
        <button 
          @click="showAddSite = false" 
          class="btn btn-sm btn-circle btn-ghost absolute right-3 top-3 hover:bg-slate-100 transition-colors duration-200 z-10"
        >
          <i class="fas fa-times text-slate-400 hover:text-slate-600 dark:text-slate-400"></i>
        </button>

        <!-- 标题区域 -->
        <div class="flex items-center gap-4 mb-8 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 via-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-green-500/30">
            <i class="fas fa-sitemap text-2xl"></i>
          </div>
          <div class="flex-1">
            <h3 class="font-bold text-2xl text-slate-800 mb-1">{{ editingSiteId !== null ? '编辑站点' : '添加新站点' }}</h3>
            <p class="text-sm text-slate-500 flex items-center gap-1" v-if="selectedEnv">
              <i class="fas fa-layer-group text-xs"></i>
              {{ editingSiteId !== null ? '所属环境' : '添加到环境' }}: <span class="font-semibold text-primary">{{ selectedEnv.name }}</span>
            </p>
          </div>
        </div>

        <form @submit.prevent="handleSubmitSite" class="space-y-6">
          <!-- 快速导入区域 -->
          <div class="bg-slate-50 border border-slate-200 rounded-lg">
            <div class="p-5">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-8 h-8 rounded bg-blue-500 flex items-center justify-center text-white">
                  <i class="fas fa-bolt text-xs"></i>
                </div>
                <div>
                  <span class="font-semibold text-sm text-slate-800">快速导入站点配置</span>
                  <p class="text-xs text-slate-500 mt-0.5">自动获取站点信息，快速完成配置</p>
                </div>
              </div>
              <div class="form-control w-full">
                <div class="flex gap-0">
                  <span class="bg-slate-100 text-slate-600 dark:text-slate-400 border border-r-0 border-slate-300 px-3 flex items-center rounded-l">
                    <i class="fas fa-server text-xs"></i>
                  </span>
                  <input
                    v-model="siteImportInput"
                    type="text"
                    class="input input-bordered w-full focus:input-primary font-mono text-sm border-l-0 border-r-0 rounded-none"
                    placeholder="输入 IP:PORT，例如: 192.168.1.20:8080"
                    @keyup.enter="handleImportSiteConfig"
                  />
                  <button
                    type="button"
                    @click="handleImportSiteConfig"
                    class="btn btn-primary gap-2 rounded-l-none border-l-0"
                    :disabled="!siteImportInput || importingSiteConfig"
                  >
                    <i class="fas fa-download" v-if="!importingSiteConfig"></i>
                    <span class="loading loading-spinner loading-sm" v-if="importingSiteConfig"></span>
                    {{ importingSiteConfig ? '导入中...' : '导入配置' }}
                  </button>
                </div>
                <label class="label pt-2">
                  <span class="label-text-alt text-slate-500 flex items-center gap-1">
                    <i class="fas fa-info-circle text-xs"></i>
                    输入站点的 IP:PORT，系统将自动获取站点配置信息
                  </span>
                </label>
              </div>
              <transition name="fade">
                <div v-if="importSiteError" class="alert alert-error mt-3 py-2">
                  <i class="fas fa-exclamation-triangle"></i>
                  <span class="text-sm">{{ importSiteError }}</span>
                </div>
              </transition>
            </div>
          </div>

          <!-- 分隔线 -->
          <div class="relative my-6">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-slate-200 dark:border-slate-700"></div>
            </div>
            <div class="relative flex justify-center">
              <span class="bg-white dark:bg-slate-800 px-4 text-xs font-medium text-slate-400 flex items-center gap-2">
                <i class="fas fa-ellipsis-h"></i>
                或手动填写
                <i class="fas fa-ellipsis-h"></i>
              </span>
            </div>
          </div>

                    <!-- 表单字段 -->
          <div class="space-y-5">
            <!-- 站点名称 -->
            <div class="form-control w-full">
              <label class="label pb-2">
                <span class="label-text font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                    <i class="fas fa-tag text-green-600 text-xs"></i>
                  </div>
                  <span>站点名称</span>
                  <span class="text-error text-sm">*</span>
                </span>
              </label>
              <input
                v-model="siteForm.name"
                type="text"
                class="input input-bordered w-full focus:input-success focus:ring-2 focus:ring-green-500/20 transition-all h-12 text-base"
                required
                placeholder="例如: 1号服务器、备份节点"
              />
              <label class="label pt-1">
                <span class="label-text-alt text-slate-400">为站点设置一个易于识别的名称</span>
              </label>
            </div>

            <div class="form-control w-full">
              <label class="label pb-2">
                <span class="label-text font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <i class="fas fa-map-marker-alt text-emerald-600 text-xs"></i>
                  </div>
                  <span>位置</span>
                </span>
              </label>
              <input
                v-model="siteForm.location"
                type="text"
                class="input input-bordered w-full focus:input-success focus:ring-2 focus:ring-emerald-500/20 transition-all h-12 text-base"
                placeholder="如: 徐汇A区"
              />
              <label class="label pt-1">
                <span class="label-text-alt text-slate-400">站点的地理位置或机房信息</span>
              </label>
            </div>

            <div class="form-control w-full">
              <label class="label pb-2">
                <span class="label-text font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <i class="fas fa-database text-indigo-600 text-xs"></i>
                  </div>
                  <span>负责 dbnums</span>
                  <span class="text-error text-sm">*</span>
                </span>
              </label>
              <input
                v-model="siteForm.dbnums"
                type="text"
                class="input input-bordered w-full focus:input-success focus:ring-2 focus:ring-indigo-500/20 transition-all h-12 text-base font-mono"
                required
                placeholder="7999,8001,8002"
              />
              <label class="label pt-1">
                <span class="label-text-alt text-slate-400">逗号分隔，标记该站点负责的数据库编号</span>
              </label>
            </div>

            <!-- HTTP 服务地址 -->
            <div class="form-control w-full">
              <label class="label pb-2">
                <span class="label-text font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <i class="fas fa-link text-blue-600 text-xs"></i>
                  </div>
                  <span>HTTP 服务地址</span>
                  <span class="text-error text-sm">*</span>
                </span>
              </label>
              <div class="relative">
                <input
                  v-model="siteForm.http_host"
                  type="url"
                  class="input input-bordered w-full focus:input-success focus:ring-2 focus:ring-blue-500/20 transition-all h-12 text-base font-mono pl-10"
                  required
                  placeholder="http://192.168.1.20:8080"
                />
                <i class="fas fa-globe absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              </div>
              <label class="label pt-1">
                <span class="label-text-alt text-slate-400 flex items-center gap-1">
                  <i class="fas fa-info-circle text-xs"></i>
                  指向站点的 HTTP API 可访问地址
                </span>
              </label>
            </div>

            <!-- 备注 -->
            <div class="form-control w-full">
              <label class="label pb-2">
                <span class="label-text font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <i class="fas fa-comment text-amber-600 text-xs"></i>
                  </div>
                  <span>备注</span>
                </span>
              </label>
              <textarea
                v-model="siteForm.notes"
                class="textarea textarea-bordered w-full focus:textarea-success focus:ring-2 focus:ring-amber-500/20 transition-all min-h-24 text-base resize-none"
                placeholder="可选的备注信息，例如：负责人、机房位置等"
              ></textarea>
              <label class="label pt-1">
                <span class="label-text-alt text-slate-400">补充部署或环境的说明信息</span>
              </label>
            </div>
          </div>
<div class="modal-action mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
            <button 
              type="button" 
              class="btn btn-ghost gap-2 hover:bg-slate-100 transition-colors" 
              @click="showAddSite = false"
            >
              <i class="fas fa-times"></i>
              取消
            </button>
            <button 
              type="submit" 
              class="btn btn-success gap-2 shadow-lg hover:shadow-xl text-white bg-gradient-to-r from-green-500 to-emerald-600 border-0 hover:from-green-600 hover:to-emerald-700 transition-all duration-200" 
              :disabled="submitting"
            >
              <i class="fas fa-check" v-if="!submitting"></i>
              <span class="loading loading-spinner loading-sm" v-if="submitting"></span>
              {{ submitting ? '保存中...' : (editingSiteId !== null ? '保存修改' : '保存站点') }}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop bg-black/50 backdrop-blur-sm" @click="showAddSite = false">
        <button>close</button>
      </form>
    </dialog>

    <!-- Site Details Modal -->
    <dialog class="modal" :class="{ 'modal-open': showSiteDetails }">
      <div class="modal-box max-w-4xl">
        <button @click="showSiteDetails = false" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
        <div class="flex items-center gap-3 mb-6">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
            <i class="fas fa-info-circle text-xl"></i>
          </div>
          <div>
            <h3 class="font-bold text-xl text-slate-800">站点详细信息</h3>
            <p class="text-sm text-slate-500" v-if="selectedSite">{{ selectedSite.name }}</p>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loadingSiteDetails" class="flex flex-col justify-center items-center py-16">
          <span class="loading loading-spinner loading-lg text-primary"></span>
          <p class="text-sm text-slate-500 mt-4">正在获取站点信息...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="siteDetailsError" class="alert alert-error shadow-sm">
          <i class="fas fa-exclamation-triangle text-xl"></i>
          <div>
            <h4 class="font-bold">无法获取站点信息</h4>
            <p class="text-sm">{{ siteDetailsError }}</p>
          </div>
        </div>

        <!-- Details Content -->
        <div v-else-if="siteDetails" class="space-y-6">
          <!-- Basic Info Section -->
          <div class="card bg-gradient-to-br from-blue-50 to-indigo-50/30 border-2 border-blue-100">
            <div class="card-body p-5">
              <h4 class="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                <i class="fas fa-server text-blue-600"></i>
                基本信息
              </h4>
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <p class="text-xs text-slate-500 mb-1">站点名称</p>
                  <p class="font-semibold text-slate-800">{{ selectedSite?.name || '-' }}</p>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <p class="text-xs text-slate-500 mb-1">HTTP 地址</p>
                  <code class="text-sm text-blue-600">{{ selectedSite?.http_host || '-' }}</code>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <p class="text-xs text-slate-500 mb-1">位置标识</p>
                  <p class="font-semibold text-slate-800">{{ selectedSite?.location || '-' }}</p>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <p class="text-xs text-slate-500 mb-1">数据库编号</p>
                  <p class="font-semibold text-slate-800">{{ selectedSite?.dbnums || '-' }}</p>
                </div>
              </div>
              <div v-if="selectedSite?.notes" class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 mt-4">
                <p class="text-xs text-slate-500 mb-1">备注</p>
                <p class="text-sm text-slate-600 dark:text-slate-400">{{ selectedSite.notes }}</p>
              </div>
            </div>
          </div>

          <!-- API Response Section -->
          <div class="card bg-gradient-to-br from-green-50 to-emerald-50/30 border-2 border-green-100">
            <div class="card-body p-5">
              <h4 class="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                <i class="fas fa-database text-green-600"></i>
                API 响应数据
              </h4>
              <div class="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                <pre class="text-xs text-green-400 font-mono">{{ JSON.stringify(siteDetails, null, 2) }}</pre>
              </div>
            </div>
          </div>

          <!-- Status Section (if available) -->
          <div v-if="siteDetails.status" class="card bg-gradient-to-br from-amber-50 to-yellow-50/30 border-2 border-amber-100">
            <div class="card-body p-5">
              <h4 class="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                <i class="fas fa-heartbeat text-amber-600"></i>
                运行状态
              </h4>
              <div class="grid grid-cols-3 gap-4">
                <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 text-center">
                  <p class="text-xs text-slate-500 mb-1">连接状态</p>
                  <div class="flex items-center justify-center gap-2 mt-2">
                    <div :class="['w-3 h-3 rounded-full', siteDetails.status.online ? 'bg-green-500' : 'bg-red-500']"></div>
                    <p class="font-semibold text-slate-800">{{ siteDetails.status.online ? '在线' : '离线' }}</p>
                  </div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 text-center">
                  <p class="text-xs text-slate-500 mb-1">运行时长</p>
                  <p class="font-semibold text-slate-800 mt-2">{{ siteDetails.status.uptime || '-' }}</p>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 text-center">
                  <p class="text-xs text-slate-500 mb-1">版本</p>
                  <p class="font-semibold text-slate-800 mt-2">{{ siteDetails.status.version || '-' }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-action mt-6">
          <button type="button" class="btn btn-primary" @click="showSiteDetails = false">关闭</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button @click="showSiteDetails = false">close</button>
      </form>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  remoteSyncApi,
  siteConfigApi,
  isRemoteSyncActionOk,
  type RemoteSyncActionResponse,
  type RemoteSyncRuntimeStatus,
} from '@/api';
import { useGuideTourStore } from '@/stores/guideTour';
import { getGuideTour } from '@/guide/collabGuide';
import { recordEnvProbe, recordSiteProbe } from '@/guide/probeMemory';

type ApiObject = Record<string, unknown> & {
  status?: string;
  success?: boolean;
  error?: string;
  message?: string;
  items?: unknown[];
  config?: ApiObject;
  ip?: string;
  project_name?: string;
  project_code?: string;
  location?: string;
  location_dbs?: unknown;
  file_server_host?: string;
  mqtt_host?: string;
  mqtt_port?: number;
  notes?: string;
};
type ConfirmDialogType = 'warning' | 'error' | 'info' | 'success';
type SiteOnlineStatus = 'unknown' | 'checking' | 'online' | 'offline';
type EnvActionKind = 'test-mqtt' | 'test-http' | 'apply' | 'activate';

interface ActionResult {
  ok: boolean;
  /** 完整可读文本（message · addr/url · code · latency） */
  text: string;
  /** 表格等窄处用的一行摘要 */
  summary?: string;
  at: string;
}

interface RemoteEnv extends ApiObject {
  id: string | number;
  name?: string;
  location?: string;
  /** plant-web-server：该 env 是否为当前激活环境 */
  active?: boolean;
}

interface RemoteSite extends ApiObject {
  id: string | number;
  env_id?: string | number;
  name?: string;
  location?: string;
  http_host?: string;
  online_status?: SiteOnlineStatus;
}

interface EnvForm extends Record<string, unknown> {
  name: string;
  file_server_host: string;
  mqtt_host: string;
  mqtt_port: number;
  location: string;
  location_dbs: string;
}

interface SiteForm extends Record<string, unknown> {
  name: string;
  location: string;
  http_host: string;
  dbnums: string;
  notes: string;
}

interface CurrentSiteConfig extends ApiObject {
  name: string;
  location: string;
  http_host: string;
  file_server_host: string;
  mqtt_host: string;
  mqtt_port: number;
  location_dbs: string;
  notes: string;
}

interface SiteDetails extends Record<string, unknown> {
  status?: {
    online?: boolean;
    uptime?: string;
    version?: string;
  };
}

const dialog = useDialog();
const message = useMessage();

function formatError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : '';
}

function confirmDialog(title: string, content: string, type: ConfirmDialogType = 'warning') {
  return new Promise<boolean>((resolve) => {
    dialog[type]({
      title,
      content,
      positiveText: '确定',
      negativeText: '取消',
      onPositiveClick: () => { resolve(true); },
      onNegativeClick: () => { resolve(false); },
      onClose: () => { resolve(false); },
      onMaskClick: () => { resolve(false); },
    });
  });
}

const emit = defineEmits<{
  (e: 'site-added'): void;
}>();
// 后端 admin-gated remote-sync API 由 axios interceptor 自动注入 admin token
const fetchRemoteEnvs = async () => remoteSyncApi.listEnvs() as unknown as Promise<ApiObject>;
const createRemoteEnv = async (payload: EnvForm) => remoteSyncApi.createEnv(payload) as unknown as Promise<ApiObject>;
const deleteRemoteEnv = (id: string | number) => remoteSyncApi.deleteEnv(id);
const fetchRemoteSites = async (envId: string | number) => remoteSyncApi.listSites(envId) as unknown as Promise<ApiObject>;
const createRemoteSite = (envId: string | number, payload: SiteForm | Record<string, unknown>) =>
  remoteSyncApi.createSite(envId, payload) as unknown as Promise<ApiObject>;
const deleteRemoteSite = (id: string | number) => remoteSyncApi.deleteSite(id);

const envs = ref<RemoteEnv[]>([]);
const sites = ref<RemoteSite[]>([]);
const selectedEnv = ref<RemoteEnv | null>(null);
const loadingEnvs = ref(false);
const loadingSites = ref(false);
const submitting = ref(false);
const checkingStatus = ref(false);
// 「从 DbOption 导入」进行中
const importingEnv = ref(false);

// UI States
const showAddEnv = ref(false);
const showAddSite = ref(false);
const showSiteDetails = ref(false);

// Forms
const envForm = ref<EnvForm>({ name: '', file_server_host: '', mqtt_host: '', mqtt_port: 1883, location: '', location_dbs: '' });
const siteForm = ref<SiteForm>({ name: '', location: '', http_host: '', dbnums: '', notes: '' });
const siteImportInput = ref('');
const importingSiteConfig = ref(false);
const importSiteError = ref<string | null>(null);

// Site Details
const selectedSite = ref<RemoteSite | null>(null);
const siteDetails = ref<SiteDetails | null>(null);
const loadingSiteDetails = ref(false);
const siteDetailsError = ref<string | null>(null);

// Site edit（复用添加站点弹窗；非 null 时提交走 updateSite）
const editingSiteId = ref<string | number | null>(null);

// 部署动作：env 级诊断 / 应用 / 激活
const envBusy = ref<Record<string, EnvActionKind | undefined>>({});
const envActionResults = ref<Record<string, ActionResult>>({});

// 站点级 HTTP 诊断（后端发起，区别于浏览器直连的 online_status）
const siteTesting = ref<Record<string, boolean>>({});
const siteTestResults = ref<Record<string, ActionResult>>({});

// 运行时状态（watcher + MQTT 订阅）
const runtime = ref<RemoteSyncRuntimeStatus | null>(null);
const runtimeLoading = ref(false);
const stoppingRuntime = ref(false);
let runtimeTimer: ReturnType<typeof setInterval> | null = null;

// Current site config cache
const currentSiteConfig = ref<CurrentSiteConfig | null>(null);

/**
 * 当前激活的 env id（兼容两种后端）：
 * - plant-model-gen：`runtime/status` 直接给 `active + env_id`
 * - plant-web-server：`runtime/status` 只有 `running`，激活的 env 记在 `envs[].active`
 */
const activeEnvId = computed<string | null>(() => {
  const rt = runtime.value;
  if (rt && typeof rt.active === 'boolean') {
    return rt.active && rt.env_id ? String(rt.env_id) : null;
  }
  const flagged = envs.value.find((e) => e.active === true);
  return flagged ? String(flagged.id) : null;
});

/** 运行时是否处于「已激活」态 */
const runtimeActive = computed(() => {
  const rt = runtime.value;
  if (!rt) return false;
  if (typeof rt.active === 'boolean') return rt.active;
  return rt.running === true && activeEnvId.value !== null;
});

const activeEnvName = computed(() => {
  const id = activeEnvId.value;
  if (!id) return '';
  const env = envs.value.find((e) => String(e.id) === id);
  return env?.name || id;
});

const runtimeTitle = computed(() => {
  const rt = runtime.value;
  if (!rt) return '尚未获取到后端运行时状态';
  if (!runtimeActive.value) {
    return rt.running === true
      ? '后端运行时在跑，但没有已激活的环境；在环境卡片上点「激活」'
      : '后端 watcher + MQTT 订阅未启动；在环境卡片上点「激活」可启动';
  }
  const parts = [`env_id: ${activeEnvId.value ?? '-'}`];
  if ('mqtt_connected' in rt) {
    const mqtt = rt.mqtt_connected;
    parts.push(`MQTT: ${mqtt === null || mqtt === undefined ? '未知' : String(mqtt)}`);
  }
  if (typeof rt.active_task_count === 'number') parts.push(`活动任务: ${rt.active_task_count}`);
  if (rt.mode) parts.push(`mode: ${rt.mode}`);
  return parts.join(' · ');
});

const isActiveEnv = (env: RemoteEnv) =>
  runtimeActive.value && activeEnvId.value === String(env.id);

const isEnvBusy = (envId: string | number) => Boolean(envBusy.value[String(envId)]);

// /guide 的高亮导览：卡片级按钮只在选中的那张卡上打 data-tour，导览永远指向用户正在看的那张
const tourAnchor = (env: RemoteEnv, name: string): string | null =>
  selectedEnv.value?.id === env.id ? name : null;

// 从 /guide 「去页面操作」跳过来时带 ?tour=<步骤 id>：等首屏数据渲染出来再起导览，然后把 query 摘掉（刷新不重播）
const route = useRoute();
const router = useRouter();
const guideTour = useGuideTourStore();
const startTourFromQuery = () => {
  const id = route.query.tour;
  if (typeof id !== 'string') return;
  const steps = getGuideTour(id);
  const { tour: _tour, ...rest } = route.query;
  void router.replace({ query: rest });
  if (!steps) return;
  window.setTimeout(() => guideTour.start(id, steps), 500);
};

const nowLabel = () => new Date().toLocaleTimeString();

/** 把后端 action / diagnostic 响应压成一行可读文本（兼容两种后端形状） */
function describeActionResponse(res: RemoteSyncActionResponse | null | undefined) {
  if (!res) return '后端未返回内容';
  const parts: string[] = [];
  if (res.message) {
    parts.push(String(res.message));
  } else if (typeof res.reachable === 'boolean') {
    parts.push(res.reachable ? '目标可达' : '目标不可达');
  } else if (res.stopped === true) {
    parts.push('已停止');
  } else if (typeof res.status === 'string') {
    parts.push(res.status);
  } else if (typeof res.success === 'boolean') {
    parts.push(res.success ? '成功' : '失败');
  }
  if (res.addr) parts.push(String(res.addr));
  if (res.host && !res.addr) parts.push(res.port ? `${res.host}:${res.port}` : String(res.host));
  if (res.url) parts.push(String(res.url));
  if (typeof res.code === 'number') parts.push(`HTTP ${res.code}`);
  if (typeof res.latency_ms === 'number') parts.push(`${res.latency_ms} ms`);
  return parts.join(' · ');
}

/** 失败时给 toast 用的原因 */
function actionFailureReason(res: RemoteSyncActionResponse | null | undefined) {
  if (!res) return '后端未返回内容';
  if (res.message) return String(res.message);
  if (res.reachable === false) return '目标不可达';
  return '未知原因';
}

const loadRuntimeStatus = async () => {
  runtimeLoading.value = true;
  try {
    runtime.value = await remoteSyncApi.runtimeStatus();
  } catch (e) {
    runtime.value = null;
    console.warn('获取运行时状态失败:', formatError(e));
  } finally {
    runtimeLoading.value = false;
  }
};

async function runEnvAction(
  env: RemoteEnv,
  kind: EnvActionKind,
  label: string,
  call: () => Promise<RemoteSyncActionResponse>,
) {
  const key = String(env.id);
  envBusy.value = { ...envBusy.value, [key]: kind };
  // 两项探测的结果同时记进 /guide 共用的 sessionStorage 记忆，向导第 4 步据此判「完成」
  const probeKind = kind === 'test-mqtt' ? 'mqtt' : kind === 'test-http' ? 'http' : null;
  try {
    const res = await call();
    const ok = isRemoteSyncActionOk(res);
    const at = nowLabel();
    envActionResults.value = {
      ...envActionResults.value,
      [key]: { ok, text: `${label}：${describeActionResponse(res)}`, at },
    };
    if (probeKind) recordEnvProbe(key, probeKind, { ok, text: describeActionResponse(res), at });
    if (ok) {
      message.success(`${env.name || '环境'}：${label}成功`);
    } else {
      message.error(`${env.name || '环境'}：${label}失败 — ${actionFailureReason(res)}`);
    }
    return ok;
  } catch (e) {
    const msg = formatError(e);
    console.error(`${label}失败:`, msg);
    const at = nowLabel();
    envActionResults.value = {
      ...envActionResults.value,
      [key]: { ok: false, text: `${label}：请求失败 — ${msg}`, at },
    };
    if (probeKind) recordEnvProbe(key, probeKind, { ok: false, text: `请求失败 — ${msg}`, at });
    message.error(`${label}失败: ${msg}`);
    return false;
  } finally {
    const next = { ...envBusy.value };
    delete next[key];
    envBusy.value = next;
  }
}

const handleTestMqtt = (env: RemoteEnv) =>
  runEnvAction(env, 'test-mqtt', '测 MQTT', () => remoteSyncApi.testMqttEnv(env.id));

const handleTestHttp = (env: RemoteEnv) =>
  runEnvAction(env, 'test-http', '测文件服务', () => remoteSyncApi.testHttpEnv(env.id));

const handleApplyEnv = async (env: RemoteEnv) => {
  const ok = await confirmDialog(
    '确认应用环境配置',
    `将把环境「${env.name || env.id}」应用为后端当前配置：plant-web-server 只把它标记为当前环境并记一条 apply 任务，不写 DbOption.toml、不动运行态——要让连接参数落盘生效请用「激活」；旧 plant-model-gen 后端会把 mqtt_host / mqtt_port / file_server_host / location / location_dbs 写入 DbOption.toml，但不重启运行态。`,
    'warning',
  );
  if (!ok) return;
  await runEnvAction(env, 'apply', '应用配置', () => remoteSyncApi.applyEnv(env.id));
};

const handleActivateEnv = async (env: RemoteEnv) => {
  // 用 runtimeActive（兼容两种后端）而不是 runtime.active：plant-web-server 没有 active 字段
  const current = runtimeActive.value ? `当前已激活的运行态（${activeEnvName.value}）会先被停止。` : '';
  const ok = await confirmDialog(
    '确认激活环境',
    `将把环境「${env.name || env.id}」设为后端当前运行环境：plant-web-server 会把 mqtt_host / mqtt_port / file_server_host / location / location_dbs 写进本站 DbOption.toml（环境上没有的键不动），再起 / 重建中继运行态（MQTT 订阅 + 源文件轮询），立即生效；旧 plant-model-gen 后端会写入 DbOption.toml 并在进程内重启 watcher + MQTT 订阅。${current}`,
    'warning',
  );
  if (!ok) return;
  await runEnvAction(env, 'activate', '激活环境', () => remoteSyncApi.activateEnv(env.id));
  // plant-web-server 把激活态记在 envs[].active 上，所以 env 列表也要刷
  await Promise.all([loadRuntimeStatus(), loadEnvs()]);
};

const handleStopRuntime = async () => {
  const ok = await confirmDialog(
    '确认停止运行时',
    `将终止后端 watcher + MQTT 订阅${activeEnvName.value ? `（当前环境：${activeEnvName.value}）` : ''}。增量文件监听与跨站点消息接收会随之停止，直到再次激活某个环境。`,
    'warning',
  );
  if (!ok) return;
  stoppingRuntime.value = true;
  try {
    const res = await remoteSyncApi.stopRuntime();
    if (isRemoteSyncActionOk(res)) {
      message.success(res.message || '已停止运行时');
    } else {
      message.error(`停止运行时失败: ${actionFailureReason(res)}`);
    }
  } catch (e) {
    message.error('停止运行时失败: ' + formatError(e));
  } finally {
    stoppingRuntime.value = false;
  }
  await Promise.all([loadRuntimeStatus(), loadEnvs()]);
};

const handleTestSiteHttp = async (site: RemoteSite) => {
  const key = String(site.id);
  siteTesting.value = { ...siteTesting.value, [key]: true };
  try {
    const res = await remoteSyncApi.testHttpSite(site.id);
    const ok = isRemoteSyncActionOk(res);
    const latency = typeof res?.latency_ms === 'number' ? ` · ${res.latency_ms} ms` : '';
    const at = nowLabel();
    siteTestResults.value = {
      ...siteTestResults.value,
      [key]: {
        ok,
        text: describeActionResponse(res),
        summary: ok ? `可达${latency}` : '不可达',
        at,
      },
    };
    // 记进 /guide 共用的探测记忆，向导第 6 步据此判「完成」
    recordSiteProbe(key, { ok, text: describeActionResponse(res), at });
    if (ok) {
      message.success(`${site.name || '站点'}：HTTP 可达`);
    } else {
      message.error(`${site.name || '站点'}：HTTP 不可达 — ${actionFailureReason(res)}`);
    }
  } catch (e) {
    const msg = formatError(e);
    console.error('站点 HTTP 诊断失败:', msg);
    const at = nowLabel();
    siteTestResults.value = {
      ...siteTestResults.value,
      [key]: { ok: false, text: `请求失败 — ${msg}`, summary: '请求失败', at },
    };
    recordSiteProbe(key, { ok: false, text: `请求失败 — ${msg}`, at });
    message.error('站点 HTTP 诊断失败: ' + msg);
  } finally {
    const next = { ...siteTesting.value };
    delete next[key];
    siteTesting.value = next;
  }
};

const normalizeDbList = (value: unknown) => {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value.join(',');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

// 获取当前站点配置
const loadCurrentSiteConfig = async () => {
  try {
    // 获取站点配置
    const configData = await siteConfigApi.get() as unknown as ApiObject;
    const config = (configData?.config || configData || {}) as ApiObject;

    // 尝试获取站点详细信息（包含 file_server_host 和 mqtt 配置）
    let siteInfo: ApiObject | null = null;
    try {
      siteInfo = await siteConfigApi.info() as unknown as ApiObject;
    } catch (e) {
      // 如果 /api/site/info 不存在或失败，使用默认值
      console.warn('无法获取站点详细信息:', e);
    }

    // 合并配置信息
    currentSiteConfig.value = {
      name: config.project_name || config.project_code || '当前站点',
      location: config.location || '',
      http_host: window.location.origin,
      file_server_host: siteInfo?.file_server_host || config.file_server_host || window.location.origin,
      mqtt_host: siteInfo?.mqtt_host || config.mqtt_host || '',
      mqtt_port: Number(siteInfo?.mqtt_port || config.mqtt_port || 1883),
      location_dbs: normalizeDbList(config.location_dbs) || normalizeDbList(siteInfo?.location_dbs),
      notes: config.notes || ''
    };
  } catch (err) {
    console.error('加载当前站点配置失败:', formatError(err));
    // 使用默认值
    currentSiteConfig.value = {
      name: '当前站点',
      location: '',
      http_host: window.location.origin,
      file_server_host: window.location.origin,
      mqtt_host: '',
      mqtt_port: 1883,
      location_dbs: '',
      notes: ''
    };
  }
};

const loadEnvs = async () => {
  loadingEnvs.value = true;
  try {
    const res = await fetchRemoteEnvs();
    envs.value = Array.isArray(res.items) ? res.items as RemoteEnv[] : [];
    // If selected env still exists, reload its sites, else deselect
    if (selectedEnv.value) {
      const selectedId = selectedEnv.value.id;
      const stillExists = envs.value.find(e => e.id === selectedId);
      if (stillExists) {
        selectEnv(stillExists);
      } else {
        selectedEnv.value = null;
        sites.value = [];
      }
    }
  } catch (e) {
    console.error('加载环境列表失败:', formatError(e));
  } finally {
    loadingEnvs.value = false;
  }
};

// 检查站点在线状态
const checkSiteOnlineStatus = async (site: RemoteSite) => {
  if (!site.http_host) {
    site.online_status = 'unknown';
    return;
  }

  site.online_status = 'checking';

  try {
    // 站点 healthcheck 是直接打到对端站点（跨域 / 跨主机），
    // 不能走 axios baseURL，必须用原生 fetch 保留绝对 URL
    const healthUrl = site.http_host.replace(/\/$/, '') + '/api/health';
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(3000), // 3秒超时
    });

    if (response.ok) {
      site.online_status = 'online';
    } else {
      site.online_status = 'offline';
    }
  } catch (error) {
    // 如果健康检查失败，尝试直接访问HTTP地址（同样是跨站点直连）
    try {
      const response = await fetch(site.http_host, {
        method: 'HEAD',
        signal: AbortSignal.timeout(2000),
      });
      site.online_status = response.ok ? 'online' : 'offline';
    } catch (e) {
      site.online_status = 'offline';
    }
  }
};

// 批量检查所有站点状态
const checkAllSitesStatus = async () => {
  if (sites.value.length === 0) return;
  
  checkingStatus.value = true;
  try {
    // 并行检查所有站点状态
    await Promise.all(sites.value.map(site => checkSiteOnlineStatus(site)));
  } finally {
    checkingStatus.value = false;
  }
};

const selectEnv = async (env: RemoteEnv) => {
  selectedEnv.value = env;
  loadingSites.value = true;
  sites.value = []; // clear prev sites
  try {
    const res = await fetchRemoteSites(env.id);
    sites.value = (Array.isArray(res.items) ? res.items as RemoteSite[] : []).map((site) => ({
      ...site,
      online_status: 'unknown' // 初始状态
    }));
    
    // 排序：当前站点排在第一位
    sites.value.sort((a, b) => {
      const aIsCurrent = isCurrentSite(a);
      const bIsCurrent = isCurrentSite(b);
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;
      return 0;
    });
    
    // 加载站点列表后，检查在线状态
    await checkAllSitesStatus();
  } catch (e) {
    console.error('加载站点列表失败:', formatError(e));
  } finally {
    loadingSites.value = false;
  }
};

// 获取服务器IP地址（从后端API）
const getServerIP = async () => {
  try {
    const data = await siteConfigApi.serverIp() as unknown as ApiObject;
    if (data?.status === 'success' && data?.ip) {
      return String(data.ip);
    }
  } catch (error) {
    console.error('获取服务器IP失败:', formatError(error));
  }
  // 如果API失败，fallback到127.0.0.1
  return '127.0.0.1';
};

// 构建本机完整URL
const getLocalOrigin = async () => {
  const serverIP = await getServerIP();
  const port = window.location.port;
  const protocol = window.location.protocol;
  
  // 如果是默认端口，不显示端口号
  if (!port || port === '80' || port === '443') {
    return `${protocol}//${serverIP}`;
  }
  return `${protocol}//${serverIP}:${port}`;
};

// 打开添加环境对话框时，自动填充当前站点配置
const handleOpenAddEnv = async () => {
  // 获取服务器IP和完整URL
  const serverIP = await getServerIP();
  const localOrigin = await getLocalOrigin();
  
  // 如果还没有加载当前站点配置，先加载
  if (!currentSiteConfig.value) {
    await loadCurrentSiteConfig();
  }
  
  // 使用当前站点配置填充表单，但优先使用本机IP
  if (currentSiteConfig.value) {
    // 从配置中提取IP地址（如果有）
    let fileServerHost = currentSiteConfig.value.file_server_host || '';
    let mqttHost = currentSiteConfig.value.mqtt_host || '';
    const location = currentSiteConfig.value.location || '';
    const locationDbs = currentSiteConfig.value.location_dbs || '';
    
    // 如果配置中的地址是 localhost，替换为服务器IP
    if (fileServerHost) {
      try {
        const url = new URL(fileServerHost);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          // 只换主机：端口与路径（如 /assets/archives，对端就是从这个目录下载 CBA）原样保留——
          // 2026-09-21 前这里把路径丢了，预填成 http://<ip>:<port>，不改就保存、激活会把错的地址写进 DbOption.toml
          const port = url.port || (url.protocol === 'https:' ? '443' : '80');
          const pathAndQuery = `${url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')}${url.search}`;
          fileServerHost = `${url.protocol}//${serverIP}${port && port !== '80' && port !== '443' ? ':' + port : ''}${pathAndQuery}`;
        }
      } catch (e) {
        // 如果不是有效URL，使用服务器origin
        if (fileServerHost.includes('localhost') || fileServerHost.includes('127.0.0.1')) {
          fileServerHost = localOrigin;
        }
      }
    } else {
      fileServerHost = localOrigin;
    }
    
    // MQTT主机如果是 localhost，替换为服务器IP
    if (mqttHost === 'localhost' || mqttHost === '127.0.0.1' || !mqttHost) {
      mqttHost = serverIP;
    }
    
    envForm.value = {
      name: currentSiteConfig.value.name || '',
      file_server_host: fileServerHost,
      mqtt_host: mqttHost,
      mqtt_port: currentSiteConfig.value.mqtt_port || 1883,
      location,
      location_dbs: locationDbs
    };
  } else {
    // 如果加载失败，使用服务器IP和端口
    envForm.value = {
      name: '',
      file_server_host: localOrigin,
      mqtt_host: serverIP,
      mqtt_port: 1883,
      location: '',
      location_dbs: ''
    };
  }
  
  showAddEnv.value = true;
};

// 判断站点是否是当前站点（主站点）
const isCurrentSite = (site?: RemoteSite | null) => {
  if (!site || !site.http_host) return false;
  const currentOrigin = window.location.origin;
  // 比较 http_host 和当前站点的 origin，支持带/不带尾部斜杠的情况
  return site.http_host.replace(/\/$/, '') === currentOrigin.replace(/\/$/, '');
};

const handleSubmitEnv = async () => {
  submitting.value = true;
  try {
    if (!envForm.value.location_dbs || !envForm.value.location_dbs.trim()) {
      message.warning('请填写环境对应的 location_dbs（dbnums）。');
      submitting.value = false;
      return;
    }

    // 确保已加载当前站点配置
    if (!currentSiteConfig.value) {
      await loadCurrentSiteConfig();
    }

    // 保存环境名称，用于后续查找
    const envName = envForm.value.name;

    // 创建环境（plant-model-gen 回 status:'success'；plant-web-server 回 success:boolean）
    const res = await createRemoteEnv(envForm.value);
    if (!res || (res.status && res.status !== 'success') || res.success === false) {
      throw new Error(res?.error || res?.message || '创建环境失败');
    }

    showAddEnv.value = false;
    envForm.value = { name: '', file_server_host: '', mqtt_host: '', mqtt_port: 1883, location: '', location_dbs: '' };

    // 重新加载环境列表
    await loadEnvs();

    // 查找新创建的环境（通过名称匹配）
    const newEnv = envs.value.find(e => e.name === envName);

    // 自动把当前站点添加到新创建的环境中
    if (newEnv && currentSiteConfig.value) {
      try {
        await createRemoteSite(newEnv.id, {
          name: currentSiteConfig.value.name || '站点',
          http_host: currentSiteConfig.value.http_host || window.location.origin,
          location: currentSiteConfig.value.location || '',
          dbnums: currentSiteConfig.value.location_dbs || '',
          notes: currentSiteConfig.value.notes || '站点（自动添加）'
        });
        // 重新加载站点列表
        await selectEnv(newEnv);
      } catch (siteError) {
        console.warn('自动创建站点失败:', siteError);
        // 即使创建站点失败，也选中新环境
        await selectEnv(newEnv);
      }
    } else if (newEnv) {
      // 如果找不到当前站点配置，也选中新环境
      await selectEnv(newEnv);
    }
  } catch (e) {
    message.error('创建环境失败: ' + formatError(e));
  } finally {
    submitting.value = false;
  }
};

const handleDeleteEnv = async (id: string | number) => {
  const ok = await confirmDialog(
    '确认删除环境',
    '将会同时删除其下所有站点配置，操作不可恢复。',
    'warning',
  );
  if (!ok) return;
  try {
    await deleteRemoteEnv(id);
    await loadEnvs();
    message.success('已删除环境');
  } catch (e) {
    message.error('删除失败: ' + formatError(e));
  }
};

/**
 * 导入响应里的新 env id（兼容两种后端）：
 * - plant-model-gen `action_success`：顶层 `id`
 * - plant-web-server `create_or_update_env`：`item.id` / `data.id`
 */
function importedEnvId(res: RemoteSyncActionResponse & { id?: string }): string | null {
  if (res.id) return String(res.id);
  for (const key of ['item', 'data'] as const) {
    const v = res[key];
    if (v && typeof v === 'object' && 'id' in v) {
      const id = (v as { id?: unknown }).id;
      if (id !== undefined && id !== null && id !== '') return String(id);
    }
  }
  return null;
}

// 从后端当前进程的 DbOption.toml 反向导入一个 env（PRD US-4）
const handleImportEnvFromDbOption = async () => {
  const ok = await confirmDialog(
    '确认从 DbOption 导入环境',
    '将读取后端当前进程的 DbOption.toml，在列表里生成一个环境；不会改写配置，也不会激活运行时。plant-web-server 按本站 id 生成 / 覆盖同一张「本站登记卡」（工程、端口、配置文件路径，不带 mqtt / 文件服务 / location 连接参数）；旧 plant-model-gen 后端每次导入都新建一个带连接参数的「导入环境 - 时间戳」。',
    'info',
  );
  if (!ok) return;
  importingEnv.value = true;
  try {
    const res = await remoteSyncApi.importEnvFromDbOption();
    if (!isRemoteSyncActionOk(res)) {
      message.error(`从 DbOption 导入失败 — ${actionFailureReason(res)}`);
      return;
    }
    const newId = importedEnvId(res);
    await loadEnvs();
    const imported = newId ? envs.value.find((e) => String(e.id) === newId) : undefined;
    if (imported) await selectEnv(imported);
    message.success(
      imported
        ? `已从 DbOption 导入环境「${imported.name || imported.id}」`
        : (res.message ? String(res.message) : '已从 DbOption 导入环境'),
    );
  } catch (e) {
    message.error('从 DbOption 导入失败: ' + formatError(e));
  } finally {
    importingEnv.value = false;
  }
};

// 从远程站点导入配置
const handleImportSiteConfig = async () => {
  if (!siteImportInput.value || !siteImportInput.value.trim()) {
    importSiteError.value = '请输入 IP:PORT';
    return;
  }

  importingSiteConfig.value = true;
  importSiteError.value = null;

  try {
    // 解析输入：支持 IP:PORT 或 http://IP:PORT 格式
    let input = siteImportInput.value.trim();
    let baseUrl = '';
    
    if (input.startsWith('http://') || input.startsWith('https://')) {
      baseUrl = input;
    } else {
      // 默认使用 http://
      baseUrl = `http://${input}`;
    }

    // 移除尾部斜杠
    baseUrl = baseUrl.replace(/\/$/, '');

    // 远程站点导入：跨站点直连（绝对 URL），保留 fetch
    const configResponse = await fetch(`${baseUrl}/api/site-config`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!configResponse.ok) {
      throw new Error(`无法连接到站点: HTTP ${configResponse.status}`);
    }

    const configData = await configResponse.json() as ApiObject;
    const config = (configData.config || {}) as ApiObject;

    // 自动填充表单
    siteForm.value = {
      name: config.project_name || config.project_code || input.split(':')[0] || '未命名站点',
      http_host: baseUrl,
      location: config.location || '',
      dbnums: normalizeDbList(config.location_dbs),
      notes: config.location ? `位置: ${config.location}` : (config.notes || '')
    };

    // 清空导入输入框和错误信息
    siteImportInput.value = '';
    importSiteError.value = null;
  } catch (error) {
    const msg = formatError(error);
    const name = errorName(error);
    console.error('导入站点配置失败:', msg);
    if (name === 'AbortError' || name === 'TimeoutError') {
      importSiteError.value = '请求超时，站点可能未响应或无法访问';
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      importSiteError.value = `无法连接到站点，请检查 IP:PORT 是否正确，或站点是否可访问`;
    } else {
      importSiteError.value = msg || '导入站点配置失败';
    }
  } finally {
    importingSiteConfig.value = false;
  }
};

// 编辑已有站点：复用添加站点弹窗，提交时走 PUT /api/remote-sync/sites/{id}
const handleOpenEditSite = (site: RemoteSite) => {
  editingSiteId.value = site.id;
  siteForm.value = {
    name: site.name || '',
    location: site.location || '',
    http_host: site.http_host || '',
    dbnums: normalizeDbList(site.dbnums),
    notes: site.notes || '',
  };
  siteImportInput.value = '';
  importSiteError.value = null;
  showAddSite.value = true;
};

// 打开添加站点对话框时，自动填充当前站点配置
const handleOpenAddSite = async () => {
  if (!selectedEnv.value) return;
  
  editingSiteId.value = null;
  siteForm.value = { name: '', location: '', http_host: '', dbnums: '', notes: '' };
  siteImportInput.value = '';
  importSiteError.value = null;
  
  if (!currentSiteConfig.value) {
    await loadCurrentSiteConfig();
  }
  
  if (currentSiteConfig.value) {
    siteForm.value = {
      name: currentSiteConfig.value.name || '',
      location: currentSiteConfig.value.location || '',
      http_host: currentSiteConfig.value.http_host || window.location.origin,
      dbnums: currentSiteConfig.value.location_dbs || '',
      notes: currentSiteConfig.value.notes || ''
    };
  } else {
    siteForm.value = {
      name: '',
      location: '',
      http_host: window.location.origin,
      dbnums: '',
      notes: ''
    };
  }
  
  showAddSite.value = true;
};

const handleSubmitSite = async () => {
  if (!selectedEnv.value) return;
  submitting.value = true;
  try {
    if (!siteForm.value.dbnums || !siteForm.value.dbnums.trim()) {
      message.warning('请填写站点负责的 dbnums。');
      submitting.value = false;
      return;
    }

    const isEdit = editingSiteId.value !== null;
    const res = isEdit
      ? (await remoteSyncApi.updateSite(editingSiteId.value as string | number, siteForm.value)) as unknown as ApiObject
      : await createRemoteSite(selectedEnv.value.id, siteForm.value);
    if (!res || (res.status && res.status !== 'success') || res.success === false) {
      throw new Error(res?.error || res?.message || (isEdit ? '更新站点失败' : '创建站点失败'));
    }
    showAddSite.value = false;
    editingSiteId.value = null;
    siteForm.value = { name: '', location: '', http_host: '', dbnums: '', notes: '' };
    siteImportInput.value = '';
    importSiteError.value = null;
    await selectEnv(selectedEnv.value); // Reload sites
    if (isEdit) {
      message.success('已更新站点');
    } else {
      emit('site-added');
    }
  } catch (e) {
    message.error((editingSiteId.value !== null ? '更新站点失败: ' : '创建站点失败: ') + formatError(e));
  } finally {
    submitting.value = false;
  }
};

const handleDeleteSite = async (id: string | number) => {
  const siteToDelete = sites.value.find(s => s.id === id);

  if (siteToDelete && isCurrentSite(siteToDelete)) {
    message.error('无法删除主站点：主站点是当前运行的站点，不能删除。');
    return;
  }

  const ok = await confirmDialog(
    '确认删除站点',
    `将删除站点 "${siteToDelete?.name || '未知站点'}"，操作不可恢复。`,
    'warning',
  );
  if (!ok) return;

  try {
    await deleteRemoteSite(id);
    if (selectedEnv.value) {
      await selectEnv(selectedEnv.value);
    }
    message.success('已删除站点');
  } catch (e) {
    message.error('删除失败: ' + formatError(e));
  }
};

const handleViewSiteDetails = async (site: RemoteSite) => {
  selectedSite.value = site;
  showSiteDetails.value = true;
  loadingSiteDetails.value = true;
  siteDetailsError.value = null;
  siteDetails.value = null;

  try {
    // 跨站点查询对端 site/info：绝对 URL，保留 fetch
    const apiUrl = `${site.http_host}/api/site/info`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // 设置超时
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // 尝试读取错误响应体
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.text();
        if (errorData) {
          errorMessage += ` - ${errorData.substring(0, 200)}`;
        }
      } catch (e) {
        // 忽略读取错误体的失败
      }
      throw new Error(errorMessage);
    }

    const data = await response.json() as SiteDetails;
    siteDetails.value = data;
  } catch (error) {
    const msg = formatError(error);
    const name = errorName(error);
    console.error('获取站点详情失败:', msg);

    if (name === 'AbortError' || name === 'TimeoutError') {
      siteDetailsError.value = `请求超时（5秒），站点 ${site.http_host} 可能未响应或响应过慢`;
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')) {
      siteDetailsError.value = `无法连接到站点: ${site.http_host}\n可能原因：\n1. 站点服务未运行\n2. CORS 跨域限制\n3. 网络连接问题\n\n请检查浏览器控制台获取详细错误信息`;
    } else if (msg.includes('404')) {
      siteDetailsError.value = `站点 ${site.http_host} 未提供 /api/site/info 端点\n\n该站点可能运行的是旧版本，需要更新到支持此 API 的版本`;
    } else {
      siteDetailsError.value = `${msg || '获取站点信息失败'}\n\n站点地址: ${site.http_host}`;
    }
  } finally {
    loadingSiteDetails.value = false;
  }
};

onMounted(() => {
  const tourRequested = typeof route.query.tour === 'string';
  loadEnvs().then(() => {
    if (!tourRequested) return;
    // 导览要指卡片上的按钮：没选中环境就先替用户选一张（激活的那张优先），按钮才会出现
    if (!selectedEnv.value && envs.value.length > 0) {
      const preferred = envs.value.find((e) => isActiveEnv(e)) ?? envs.value[0]!;
      void selectEnv(preferred);
    }
    startTourFromQuery();
  });
  // 预加载当前站点配置
  loadCurrentSiteConfig();
  // 运行时状态：首次 + 30s 轮询（与全局 StatusBar 节奏一致）
  loadRuntimeStatus();
  runtimeTimer = setInterval(loadRuntimeStatus, 30_000);
});

onUnmounted(() => {
  if (runtimeTimer) {
    clearInterval(runtimeTimer);
    runtimeTimer = null;
  }
});
</script>

<style scoped>
/* 淡入淡出过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 模态框动画增强 */
.modal-box {
  animation: modalSlideIn 0.3s ease-out;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 输入框聚焦效果增强 */
.input:focus,
.textarea:focus {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 按钮悬停效果 */
.btn:hover {
  transform: translateY(-1px);
}

.btn:active {
  transform: translateY(0);
}
</style>
