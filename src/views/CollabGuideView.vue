<template>
  <div class="h-full flex flex-col bg-base-100 rounded-xl shadow-sm border border-base-200 overflow-hidden" data-testid="collab-guide">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-base-200 flex flex-wrap items-center justify-between gap-3 bg-base-50/50">
      <div>
        <h3 class="font-bold text-xl flex items-center gap-3 text-slate-800 dark:text-slate-100">
          <i class="fas fa-route text-primary"></i>
          协同配置向导
        </h3>
        <p class="text-xs text-slate-500 mt-1">
          照着 8 步把本站接入异地协同：每一步告诉你为什么、在页面上点哪里、填什么，并对着后端实时判定是否完成。
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="w-48">
          <NProgress
            type="line"
            :percentage="progressPercent"
            :status="progressPercent >= 100 ? 'success' : 'default'"
            :height="10"
            indicator-placement="inside"
            processing
          />
          <p class="text-[11px] text-slate-500 mt-1 text-right" data-testid="guide-progress">
            已完成 {{ passedCount }} / {{ checkableCount }} 项判定
          </p>
        </div>
        <button class="btn btn-sm btn-ghost gap-2" :disabled="refreshing" title="重新对着后端检查所有步骤" @click="refreshAll">
          <i class="fas fa-sync-alt" :class="{ 'fa-spin': refreshing }"></i>
          重新检查
        </button>
      </div>
    </div>

    <div class="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden">
      <!-- Left: steps -->
      <aside class="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-base-200 overflow-y-auto p-4 bg-slate-50/60 dark:bg-slate-900/40">
        <ol class="space-y-1" data-testid="guide-steps">
          <li v-for="(step, i) in steps" :key="step.id">
            <button
              class="w-full text-left flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors"
              :class="i === currentIdx ? 'bg-white dark:bg-slate-800 shadow-sm ring-1 ring-primary/30' : 'hover:bg-white/70 dark:hover:bg-slate-800/60'"
              :data-testid="`guide-step-${step.id}`"
              :data-status="statusOf(step)"
              @click="currentIdx = i"
            >
              <span
                class="mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold border"
                :class="badgeClass(statusOf(step))"
              >
                <i v-if="statusOf(step) === 'done'" class="fas fa-check"></i>
                <i v-else-if="statusOf(step) === 'error'" class="fas fa-exclamation"></i>
                <template v-else>{{ i + 1 }}</template>
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">{{ step.title }}</span>
                <span class="block text-[11px] text-slate-500 mt-0.5 truncate">{{ statusLabel(step) }}</span>
              </span>
            </button>
          </li>
        </ol>
        <p v-if="lastCheckedAt" class="text-[11px] text-slate-400 mt-4 px-3">上次检查 {{ lastCheckedAt }} · 每 15 秒自动刷新</p>
      </aside>

      <!-- Right: current step -->
      <section class="flex-1 overflow-y-auto p-5 lg:p-6 space-y-5" data-testid="guide-detail">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-[11px] font-semibold tracking-wider text-primary uppercase">第 {{ currentIdx + 1 }} 步 / {{ steps.length }}</p>
            <h4 class="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1" data-testid="guide-current-title">{{ current.title }}</h4>
            <p class="text-sm text-slate-600 dark:text-slate-300 mt-1"><span class="font-semibold">目标：</span>{{ current.goal }}</p>
          </div>
          <NTag :type="tagType(statusOf(current))" round size="small" data-testid="guide-current-status">
            {{ statusLabel(current) }}
          </NTag>
        </div>

        <!-- 为什么 -->
        <div class="rounded-xl border border-blue-100 bg-blue-50/60 dark:bg-blue-900/20 dark:border-blue-900/50 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          <span class="font-semibold text-blue-700 dark:text-blue-300 mr-1"><i class="fas fa-lightbulb mr-1"></i>为什么</span>{{ current.why }}
        </div>

        <!-- 怎么做 -->
        <div>
          <h5 class="font-bold text-slate-800 dark:text-slate-100 mb-2"><i class="fas fa-list-ol text-primary mr-2"></i>在页面上怎么做</h5>
          <ol class="space-y-2">
            <li v-for="(h, i) in current.howto" :key="i" class="flex gap-3 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              <span class="w-5 h-5 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 text-[11px] font-bold flex items-center justify-center mt-0.5">{{ i + 1 }}</span>
              <span>{{ h }}</span>
            </li>
          </ol>
        </div>

        <!-- 要填什么 -->
        <div v-if="current.fields?.length">
          <h5 class="font-bold text-slate-800 dark:text-slate-100 mb-2"><i class="fas fa-keyboard text-primary mr-2"></i>要填什么</h5>
          <div class="overflow-x-auto rounded-xl border border-base-200">
            <table class="table table-sm w-full">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-800/60">
                  <th>字段</th>
                  <th>填什么</th>
                  <th>本站当前值 / 示例</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in current.fields" :key="f.label">
                  <td class="font-semibold whitespace-nowrap">{{ f.label }}</td>
                  <td class="text-slate-600 dark:text-slate-300">{{ f.hint }}</td>
                  <td>
                    <button
                      v-if="fieldValue(f)"
                      class="font-mono text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-left break-all"
                      title="点击复制"
                      @click="copyText(fieldValue(f))"
                    >
                      {{ fieldValue(f) }}
                    </button>
                    <span v-else class="text-xs text-slate-400">{{ f.key ? '（后端未提供）' : '' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 注意 -->
        <div v-if="current.notes?.length" class="rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-900/20 dark:border-amber-900/50 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 space-y-1">
          <p v-for="(n, i) in current.notes" :key="i"><i class="fas fa-exclamation-triangle mr-2"></i>{{ n }}</p>
        </div>

        <!-- 完成判定（按步骤定制） -->
        <div class="rounded-xl border border-base-200 bg-white dark:bg-slate-800 p-4 space-y-3" data-testid="guide-check">
          <div class="flex items-center justify-between">
            <h5 class="font-bold text-slate-800 dark:text-slate-100"><i class="fas fa-clipboard-check text-primary mr-2"></i>完成判定</h5>
            <span class="text-[11px] text-slate-400">{{ current.checkHint }}</span>
          </div>
          <p v-if="checkErrors[current.id]" class="text-xs rounded-lg px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800">
            检查失败：{{ checkErrors[current.id] }}
          </p>

          <!-- prepare -->
          <template v-if="current.id === 'prepare'">
            <div class="grid md:grid-cols-2 gap-3">
              <div class="rounded-lg border border-base-200 p-3">
                <p class="text-xs font-semibold text-slate-500 mb-2">本站身份（GET /api/site/info）</p>
                <dl v-if="siteInfo" class="text-xs space-y-1 font-mono" data-testid="guide-site-info">
                  <div class="flex gap-2"><dt class="text-slate-400 w-28 shrink-0">工程</dt><dd>{{ siteInfo.project_name }} / {{ siteInfo.project_code }}</dd></div>
                  <div class="flex gap-2"><dt class="text-slate-400 w-28 shrink-0">配置文件</dt><dd class="break-all">{{ siteInfo.config_file_location || '—' }}</dd></div>
                  <div class="flex gap-2"><dt class="text-slate-400 w-28 shrink-0">location</dt><dd>{{ siteInfo.location }}</dd></div>
                  <div class="flex gap-2"><dt class="text-slate-400 w-28 shrink-0">location_dbs</dt><dd>[{{ (siteInfo.location_dbs ?? []).join(', ') }}]</dd></div>
                  <div class="flex gap-2"><dt class="text-slate-400 w-28 shrink-0">broker</dt><dd>{{ siteInfo.mqtt_host }}:{{ siteInfo.mqtt_port }}</dd></div>
                  <div class="flex gap-2"><dt class="text-slate-400 w-28 shrink-0">file_server_host</dt><dd class="break-all">{{ siteInfo.file_server_host }}</dd></div>
                </dl>
                <p v-if="siteInfo" class="text-[11px] text-slate-400 mt-2">五个连接键以 DbOption.toml 当前内容为准（后端每次重读文件，激活写进去的值这里立刻能看到）；首次读到时已快照进第 8 步的「开跑前」一列。</p>
                <p v-else class="text-xs text-rose-600">后端没有响应 —— 确认 dev server 的 VITE_API_TARGET 指向的站点后端在跑。</p>
              </div>
              <div class="rounded-lg border border-base-200 p-3 flex flex-col justify-between">
                <div>
                  <p class="text-xs font-semibold text-slate-500 mb-2">管理员登录</p>
                  <p v-if="adminAuth.isLoggedIn" class="text-sm text-emerald-700 dark:text-emerald-300"><i class="fas fa-check-circle mr-1"></i>已登录：{{ adminAuth.username }}（{{ adminAuth.role }}）</p>
                  <p v-else class="text-sm text-slate-600 dark:text-slate-300"><i class="fas fa-lock mr-1"></i>未登录。admin 端点会拒绝，下面的判定也拿不到数据。</p>
                  <p v-if="adminAuth.autoLoginError" class="text-xs text-amber-700 mt-1">自动登录失败：{{ adminAuth.autoLoginError }}</p>
                </div>
                <button v-if="!adminAuth.isLoggedIn" class="btn btn-sm btn-primary mt-3 self-start" @click="adminAuth.promptLogin('向导需要管理员权限')">登录</button>
              </div>
            </div>
          </template>

          <!-- create-env -->
          <template v-else-if="current.id === 'create-env'">
            <p v-if="!adminAuth.isLoggedIn" class="text-sm text-slate-500">登录后才能读环境列表。</p>
            <p v-else-if="envs.length === 0" class="text-sm text-slate-500">环境列表为空 —— 去页面点「新建」。</p>
            <div v-else class="overflow-x-auto rounded-lg border border-base-200">
              <table class="table table-xs w-full" data-testid="guide-env-table">
                <thead><tr><th>环境</th><th>broker</th><th>location</th><th>自有库</th><th>文件服务</th><th>能跑中继？</th></tr></thead>
                <tbody>
                  <tr v-for="e in envs" :key="String(e.id)">
                    <td class="font-semibold">{{ e.name || e.id }} <span v-if="isEnvActive(e)" class="ml-1 text-[10px] text-emerald-600">已激活</span></td>
                    <td class="font-mono text-xs">{{ e.mqtt_host ? `${e.mqtt_host}:${e.mqtt_port ?? ''}` : '—' }}</td>
                    <td class="font-mono text-xs">{{ e.location || '—' }}</td>
                    <td class="font-mono text-xs">{{ dbsText(e.location_dbs) }}</td>
                    <td class="font-mono text-xs break-all">{{ e.file_server_host || '—' }}</td>
                    <td>
                      <span v-if="e.mqtt_host" class="text-emerald-600 text-xs"><i class="fas fa-check mr-1"></i>是</span>
                      <span v-else class="text-slate-400 text-xs" title="导入卡不带连接参数：激活它 = 按文件现状起中继">否（登记卡）</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- probe -->
          <template v-else-if="current.id === 'probe'">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm text-slate-600 dark:text-slate-300">对哪张环境卡测：</span>
              <NSelect
                v-model:value="targetEnvId"
                :options="envOptions"
                size="small"
                style="width: 260px"
                placeholder="选择环境"
                :disabled="envOptions.length === 0"
              />
              <button class="btn btn-xs btn-outline gap-1" :disabled="!targetEnvId || probing !== null" @click="runProbe('mqtt')">
                <i class="fas fa-signal text-green-600" :class="{ 'fa-fade': probing === 'mqtt' }"></i>帮我测 MQTT
              </button>
              <button class="btn btn-xs btn-outline gap-1" :disabled="!targetEnvId || probing !== null" @click="runProbe('http')">
                <i class="fas fa-hdd text-blue-600" :class="{ 'fa-fade': probing === 'http' }"></i>帮我测文件服务
              </button>
            </div>
            <div class="grid md:grid-cols-2 gap-2">
              <div v-for="kind in (['mqtt', 'http'] as const)" :key="kind" class="rounded-lg border px-3 py-2 text-xs" :class="probeClass(probeResults[kind])" :data-testid="`guide-probe-${kind}`">
                <span class="font-semibold mr-1">{{ kind === 'mqtt' ? '测 MQTT' : '测文件服务' }}：</span>
                <span v-if="probeResults[kind]">{{ probeResults[kind]?.text }} <span class="opacity-60">{{ probeResults[kind]?.at }}</span></span>
                <span v-else class="text-slate-400">尚未探测</span>
              </div>
            </div>
          </template>

          <!-- activate / verify -->
          <template v-else-if="current.id === 'activate' || current.id === 'verify'">
            <p v-if="!adminAuth.isLoggedIn" class="text-sm text-slate-500">登录后才能读运行态。</p>
            <div v-else class="flex flex-wrap gap-2" data-testid="guide-runtime-chips">
              <span :class="[CHIP_BASE, chipTone(runtimeActive)]">active · {{ runtime?.active ?? (runtimeActive ? 'true' : 'false') }}</span>
              <span :class="[CHIP_BASE, chipTone(runtime?.relay === true, runtime?.relay === undefined)]">relay · {{ runtime?.relay ?? '—' }}</span>
              <span :class="[CHIP_BASE, chipTone(runtime?.mqtt_connected === true, runtime?.mqtt_connected == null)]">mqtt_connected · {{ runtime?.mqtt_connected ?? '—' }}</span>
              <span :class="[CHIP_BASE, CHIP_NEUTRAL]">env · {{ activeEnvName || '—' }}</span>
              <span :class="[CHIP_BASE, CHIP_NEUTRAL]">relay_location · {{ runtime?.relay_location ?? '—' }}</span>
              <span :class="[CHIP_BASE, CHIP_NEUTRAL]">relay broker · {{ runtime?.relay_mqtt_host ? `${runtime.relay_mqtt_host}:${runtime.relay_mqtt_port ?? ''}` : '—' }}</span>
              <span :class="[CHIP_BASE, CHIP_NEUTRAL]">mode · {{ runtime?.mode ?? '—' }}</span>
            </div>
            <div v-if="current.id === 'verify' && adminAuth.isLoggedIn" class="rounded-lg border border-base-200 p-3 text-xs" data-testid="guide-ledger">
              <p class="font-semibold text-slate-500 mb-1">中继台账（GET /api/remote-sync/ledger/summary）</p>
              <template v-if="ledgerState === 'ok' && ledger">
                <div class="flex flex-wrap gap-3 font-mono">
                  <span>rows {{ ledger.rows_total }}</span>
                  <span>changes {{ ledger.changes_total }}</span>
                  <span :class="ledger.problems_total > 0 ? 'text-rose-600' : ''">problems {{ ledger.problems_total }}</span>
                  <span>watermarks {{ ledger.watermarks_total }}</span>
                  <span>最近广播 {{ formatTime(ledger.last_outbound_at) }}</span>
                  <span>最近接收 {{ formatTime(ledger.last_inbound_at) }}</span>
                </div>
              </template>
              <p v-else-if="ledgerState === 'not_initialized'" class="text-slate-500">台账表尚未建立 —— 激活成功时会建出来。</p>
              <p v-else-if="ledgerState === 'unavailable'" class="text-slate-500">该后端不提供台账 API（plant-model-gen 或旧版 plant-web-server）。</p>
              <p v-else-if="ledgerState === 'error'" class="text-rose-600">读取失败：{{ ledgerError }}</p>
              <p v-else class="text-slate-400">尚未读取</p>
            </div>
          </template>

          <!-- sites -->
          <template v-else-if="current.id === 'sites'">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm text-slate-600 dark:text-slate-300">环境：</span>
              <NSelect v-model:value="targetEnvId" :options="envOptions" size="small" style="width: 260px" placeholder="选择环境" :disabled="envOptions.length === 0" />
              <span class="text-xs text-slate-400">{{ sites.length }} 个站点</span>
            </div>
            <p v-if="!adminAuth.isLoggedIn" class="text-sm text-slate-500">登录后才能读站点列表。</p>
            <p v-else-if="!targetEnvId" class="text-sm text-slate-500">先有一张环境卡。</p>
            <p v-else-if="sites.length === 0" class="text-sm text-slate-500">该环境下还没有站点 —— 去页面点「添加站点」。</p>
            <div v-else class="overflow-x-auto rounded-lg border border-base-200">
              <table class="table table-xs w-full" data-testid="guide-site-table">
                <thead><tr><th>站点</th><th>location</th><th>http_host</th><th>探测</th></tr></thead>
                <tbody>
                  <tr v-for="s in sites" :key="String(s.id)">
                    <td class="font-semibold">{{ s.name || s.id }}</td>
                    <td class="font-mono text-xs">{{ s.location || '—' }}</td>
                    <td class="font-mono text-xs break-all">{{ s.http_host || '—' }}</td>
                    <td class="whitespace-nowrap">
                      <button class="btn btn-ghost btn-xs text-blue-600" :disabled="siteProbing === String(s.id)" title="由后端探测 <http_host>/metadata.json" @click="runSiteProbe(s)">
                        <i class="fas fa-stethoscope" :class="{ 'fa-fade': siteProbing === String(s.id) }"></i>
                      </button>
                      <span v-if="siteProbeResults[String(s.id)]" class="text-xs ml-1" :class="siteProbeResults[String(s.id)]?.ok ? 'text-emerald-600' : 'text-rose-600'">
                        {{ siteProbeResults[String(s.id)]?.text }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- stop -->
          <template v-else-if="current.id === 'stop'">
            <div class="rounded-lg border border-base-200 p-3 text-xs">
              <p class="font-semibold text-slate-500 mb-1">DbOption.toml 五个键：开跑前快照 vs 文件现状（后端每次 <code>GET /api/site/info</code> 重读文件，本页 15 s 刷一次）</p>
              <table v-if="snapshot" class="w-full font-mono" data-testid="guide-snapshot">
                <thead>
                  <tr class="text-slate-400 text-left">
                    <th class="py-1 w-32 font-normal">键</th>
                    <th class="py-1 font-normal">开跑前（{{ snapshot.captured_at }}）</th>
                    <th class="py-1 font-normal">文件现状</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in snapshotRows" :key="row.key" :class="row.differs ? 'text-amber-700' : ''" :data-differs="row.differs">
                    <td class="py-0.5 text-slate-400">{{ row.key }}</td>
                    <td class="py-0.5 break-all">{{ row.before }}</td>
                    <td class="py-0.5 break-all">
                      {{ row.now }}
                      <i v-if="row.differs" class="fas fa-exclamation-triangle ml-1"></i>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="text-slate-400">第 1 步后端有响应时会自动记下。</p>
              <p v-if="snapshot && siteInfo && snapshotDiffKeys.length" class="mt-2 text-amber-700" data-testid="guide-snapshot-verdict" data-verdict="differs">
                <i class="fas fa-exclamation-triangle mr-1"></i>文件里 {{ snapshotDiffKeys.join(' / ') }} 已被激活改过 —— 要复原就按「开跑前」那一列新建一张恢复卡并激活，再激活一次看响应 <code>runtime_config.changed</code> 为 false。
              </p>
              <p v-else-if="snapshot && siteInfo" class="mt-2 text-emerald-700" data-testid="guide-snapshot-verdict" data-verdict="same">
                <i class="fas fa-check mr-1"></i>文件里的五个键与开跑前一致，不需要复原。
              </p>
              <p v-if="siteInfoLooksStale" class="mt-2 text-rose-700" data-testid="guide-site-info-stale">
                <i class="fas fa-exclamation-circle mr-1"></i>运行态在跑 <code>{{ runtime?.relay_location }}</code>，但 <code>site/info</code> 仍报 <code>{{ siteInfo?.location }}</code> —— 这台后端的 site/info 不重读文件（plant-web-server 需 ≥ 2026-09-21 那版），上面「文件现状」一列不可信。
              </p>
            </div>
          </template>

          <template v-else>
            <p class="text-sm text-slate-500">本步是概念讲解，不做判定；点「去页面看导览」在真实页面上认一遍三块区域。</p>
          </template>
        </div>

        <!-- Actions -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-base-200">
          <div class="flex items-center gap-2">
            <button v-if="current.tour" class="btn btn-sm btn-primary gap-2" data-testid="guide-start-tour" @click="goWithTour(current)">
              <i class="fas fa-location-arrow"></i>去页面操作（高亮导览）
            </button>
            <button v-if="current.route" class="btn btn-sm btn-outline gap-2" @click="router.push(current.route)">
              <i class="fas fa-external-link-alt"></i>只跳转到 {{ routeLabel(current.route) }}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn btn-sm btn-ghost" :disabled="currentIdx === 0" @click="currentIdx -= 1">上一步</button>
            <button class="btn btn-sm btn-ghost" :disabled="currentIdx >= steps.length - 1" data-testid="guide-next" @click="currentIdx += 1">下一步</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
// N* 组件由 NaiveUiResolver 自动注册；useMessage 由 unplugin-auto-import 注入
import {
  relayLedgerApi,
  remoteSyncApi,
  siteConfigApi,
  isLedgerNotInitialized,
  isLedgerUnavailable,
  isRemoteSyncActionOk,
  type LedgerSummaryResponse,
  type RemoteSyncActionResponse,
  type RemoteSyncRuntimeStatus,
} from '@/api';
import { useAdminAuthStore } from '@/stores/adminAuth';
import { useGuideTourStore } from '@/stores/guideTour';
import { COLLAB_GUIDE_STEPS, type GuideField, type GuideStepDef } from '@/guide/collabGuide';
import { envProbes, onProbeMemoryChange, recordEnvProbe, recordSiteProbe, siteProbe } from '@/guide/probeMemory';
import { useFormatters } from '@/composables/useFormatters';

type StepStatus = 'done' | 'todo' | 'info' | 'locked' | 'error';

interface SiteInfo {
  project_name?: string;
  project_code?: string;
  config_file_location?: string;
  location?: string;
  location_dbs?: number[];
  mqtt_host?: string;
  mqtt_port?: number;
  file_server_host?: string;
}

interface SiteInfoSnapshot extends SiteInfo {
  captured_at: string;
}

interface EnvLite {
  id: string | number;
  name?: string;
  mqtt_host?: string;
  mqtt_port?: number;
  file_server_host?: string;
  location?: string;
  location_dbs?: unknown;
  active?: boolean;
}

interface SiteLite {
  id: string | number;
  name?: string;
  location?: string;
  http_host?: string;
}

/** runtime/status 两种后端并存的字段（pws 2026-09-16 起的中继运行态字段在这里补类型） */
type RuntimeStatus = RemoteSyncRuntimeStatus & {
  relay?: boolean;
  relay_location?: string | null;
  relay_mqtt_host?: string | null;
  relay_mqtt_port?: number | null;
};

interface ProbeResult {
  ok: boolean;
  text: string;
  at: string;
}

const SNAPSHOT_KEY = 'guide_site_info_snapshot';
const REFRESH_MS = 15_000;

const router = useRouter();
const message = useMessage();
const adminAuth = useAdminAuthStore();
const guideTour = useGuideTourStore();
const { formatTime } = useFormatters();

const steps = COLLAB_GUIDE_STEPS;
const currentIdx = ref(0);
const current = computed<GuideStepDef>(() => steps[currentIdx.value] ?? steps[0]!);

const siteInfo = ref<SiteInfo | null>(null);
const envs = ref<EnvLite[]>([]);
const runtime = ref<RuntimeStatus | null>(null);
const sites = ref<SiteLite[]>([]);
const ledger = ref<LedgerSummaryResponse | null>(null);
const ledgerState = ref<'idle' | 'ok' | 'unavailable' | 'not_initialized' | 'error'>('idle');
const ledgerError = ref<string | null>(null);
const checkErrors = ref<Partial<Record<string, string>>>({});
const refreshing = ref(false);
const lastCheckedAt = ref('');
const snapshot = ref<SiteInfoSnapshot | null>(readSnapshot());

const targetEnvId = ref<string | null>(null);
const probing = ref<'mqtt' | 'http' | null>(null);
// 探测结果与 /topology 共用一份 sessionStorage 记忆（guide/probeMemory.ts）：在哪个页面测都算，刷新不丢
const probeResults = ref<{ mqtt?: ProbeResult; http?: ProbeResult }>({});
const siteProbing = ref<string | null>(null);
const siteProbeResults = ref<Record<string, ProbeResult>>({});

let timer: ReturnType<typeof setInterval> | null = null;
let stopProbeMemoryWatch: (() => void) | null = null;

/** 从共享记忆里把当前环境 / 当前站点列表的探测结果读进来 */
function syncProbeMemory(): void {
  probeResults.value = envProbes(targetEnvId.value);
  const next: Record<string, ProbeResult> = {};
  for (const s of sites.value) {
    const rec = siteProbe(s.id);
    if (rec) next[String(s.id)] = rec;
  }
  siteProbeResults.value = next;
}

// ---------- helpers ----------

function errText(err: unknown): string {
  return typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message: unknown }).message)
    : String(err);
}

function itemsOf(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (obj.data && typeof obj.data === 'object') {
      const data = obj.data as Record<string, unknown>;
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(obj.data)) return obj.data as unknown[];
    }
  }
  return [];
}

function dbsText(v: unknown): string {
  if (Array.isArray(v)) return v.length ? `[${v.join(', ')}]` : '[]';
  if (typeof v === 'string' && v.trim()) return v;
  return '—';
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

function readSnapshot(): SiteInfoSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as SiteInfoSnapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(info: SiteInfo): void {
  const snap: SiteInfoSnapshot = {
    location: info.location,
    location_dbs: info.location_dbs,
    mqtt_host: info.mqtt_host,
    mqtt_port: info.mqtt_port,
    file_server_host: info.file_server_host,
    captured_at: new Date().toLocaleString('zh-CN', { hour12: false }),
  };
  snapshot.value = snap;
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    // ignore
  }
}

/** 第 8 步对照表：开跑前快照 vs 文件现状（site/info 每次重读文件，pws ≥ 2026-09-21），逐键标出差异 */
const snapshotRows = computed(() => {
  const a = snapshot.value;
  const b = siteInfo.value;
  if (!a) return [];
  const fmt = (v: unknown): string => (v === undefined || v === null || v === '' ? '—' : String(v));
  const rows: { key: string; before: string; now: string; differs: boolean }[] = [
    { key: 'mqtt_host', before: fmt(a.mqtt_host), now: fmt(b?.mqtt_host), differs: Boolean(b) && a.mqtt_host !== b?.mqtt_host },
    { key: 'mqtt_port', before: fmt(a.mqtt_port), now: fmt(b?.mqtt_port), differs: Boolean(b) && Number(a.mqtt_port) !== Number(b?.mqtt_port) },
    { key: 'location', before: fmt(a.location), now: fmt(b?.location), differs: Boolean(b) && a.location !== b?.location },
    {
      key: 'location_dbs',
      before: dbsText(a.location_dbs ?? []),
      now: b ? dbsText(b.location_dbs ?? []) : '—',
      differs: Boolean(b) && JSON.stringify(a.location_dbs ?? []) !== JSON.stringify(b?.location_dbs ?? []),
    },
    { key: 'file_server_host', before: fmt(a.file_server_host), now: fmt(b?.file_server_host), differs: Boolean(b) && a.file_server_host !== b?.file_server_host },
  ];
  return rows;
});
const snapshotDiffKeys = computed(() => snapshotRows.value.filter((r) => r.differs).map((r) => r.key));

/**
 * 运行态明明按某个 location 在跑、site/info 却报另一个 —— 说明这台后端的 site/info 还是启动快照
 * （旧 plant-web-server），第 8 步的「文件现状」一列不可信；提示用户升后端，而不是让绿字骗人。
 */
const siteInfoLooksStale = computed(() => {
  const rt = runtime.value;
  const info = siteInfo.value;
  if (!rt || !info || !runtimeActive.value) return false;
  const relayLocation = rt.relay_location;
  return typeof relayLocation === 'string' && relayLocation !== '' && typeof info.location === 'string' && relayLocation !== info.location;
});

/** 「本站当前值」列：从 site/info 取 */
function fieldValue(f: GuideField): string {
  const info = siteInfo.value;
  switch (f.key) {
    case 'file_server_host':
      return info?.file_server_host || f.example || '';
    case 'mqtt':
      return info?.mqtt_host ? `${info.mqtt_host} / ${info.mqtt_port ?? ''}` : f.example || '';
    case 'location':
      return info?.location || f.example || '';
    case 'location_dbs':
      return info?.location_dbs ? (info.location_dbs.length ? info.location_dbs.join(', ') : '（空）') : f.example || '';
    default:
      return f.example || '';
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    message.success('已复制');
  } catch {
    message.warning('复制失败，请手动选中复制');
  }
}

function routeLabel(route: string): string {
  return route === '/topology' ? '异地拓扑' : route === '/ledger' ? '中继台账' : route;
}

// ---------- 运行态判定（与 TopologyView 同一口径，兼容两种后端） ----------

const activeEnvId = computed<string | null>(() => {
  const rt = runtime.value;
  if (rt && typeof rt.active === 'boolean') {
    return rt.active && rt.env_id ? String(rt.env_id) : null;
  }
  const flagged = envs.value.find((e) => e.active === true);
  return flagged ? String(flagged.id) : null;
});

const runtimeActive = computed(() => {
  const rt = runtime.value;
  if (!rt) return false;
  if (typeof rt.active === 'boolean') return rt.active;
  return rt.running === true && activeEnvId.value !== null;
});

const activeEnvName = computed(() => {
  const id = activeEnvId.value;
  if (!id) return '';
  return envs.value.find((e) => String(e.id) === id)?.name || id;
});

function isEnvActive(e: EnvLite): boolean {
  return runtimeActive.value && activeEnvId.value === String(e.id);
}

const envOptions = computed(() =>
  envs.value.map((e) => ({
    label: `${e.name || e.id}${e.mqtt_host ? ` · ${e.mqtt_host}:${e.mqtt_port ?? ''}` : ' · 登记卡（无 broker）'}`,
    value: String(e.id),
  })),
);

// ---------- 判定 ----------

const checks = computed<Record<string, boolean>>(() => {
  const rt = runtime.value;
  const mqttOk = rt ? (rt.mqtt_connected == null ? runtimeActive.value : rt.mqtt_connected === true) : false;
  return {
    prepare: siteInfo.value !== null && adminAuth.isLoggedIn,
    'create-env': envs.value.some((e) => Boolean(e.mqtt_host)),
    probe: Boolean(probeResults.value.mqtt?.ok && probeResults.value.http?.ok),
    activate: runtimeActive.value,
    // 只看当前环境下的站点：别的环境探过的不算
    sites: sites.value.length > 0 && sites.value.some((s) => siteProbeResults.value[String(s.id)]?.ok === true),
    verify: runtimeActive.value && mqttOk,
  };
});

function statusOf(step: GuideStepDef): StepStatus {
  if (!step.checkable) return 'info';
  if (checkErrors.value[step.id]) return 'error';
  if (checks.value[step.id]) return 'done';
  if (step.id !== 'prepare' && !adminAuth.isLoggedIn) return 'locked';
  return 'todo';
}

function statusLabel(step: GuideStepDef): string {
  switch (statusOf(step)) {
    case 'done':
      return '已完成';
    case 'error':
      return '检查失败';
    case 'locked':
      return '需先登录';
    case 'info':
      return step.tour ? '讲解 · 有页面导览' : '讲解';
    default:
      return '未完成';
  }
}

function badgeClass(s: StepStatus): string {
  switch (s) {
    case 'done':
      return 'bg-emerald-500 text-white border-emerald-500';
    case 'error':
      return 'bg-rose-500 text-white border-rose-500';
    case 'locked':
      return 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700';
    case 'info':
      return 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800';
    default:
      return 'bg-white text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
  }
}

function tagType(s: StepStatus): 'success' | 'error' | 'info' | 'warning' | 'default' {
  switch (s) {
    case 'done':
      return 'success';
    case 'error':
      return 'error';
    case 'locked':
      return 'warning';
    case 'info':
      return 'info';
    default:
      return 'default';
  }
}

const checkableSteps = computed(() => steps.filter((s) => s.checkable));
const checkableCount = computed(() => checkableSteps.value.length);
const passedCount = computed(() => checkableSteps.value.filter((s) => checks.value[s.id]).length);
const progressPercent = computed(() =>
  checkableCount.value === 0 ? 0 : Math.round((passedCount.value / checkableCount.value) * 100),
);

const CHIP_BASE = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono border';
const CHIP_NEUTRAL = 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
const CHIP_OK = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800';
const CHIP_BAD = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800';

function chipTone(ok: boolean, unknown = false): string {
  if (unknown) return CHIP_NEUTRAL;
  return ok ? CHIP_OK : CHIP_BAD;
}

function probeClass(r: ProbeResult | undefined): string {
  if (!r) return 'border-base-200 text-slate-500';
  return r.ok
    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'
    : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300';
}

/** 把探测响应压成一行（兼容两种后端形状） */
function describeProbe(res: RemoteSyncActionResponse | null | undefined): string {
  if (!res) return '后端未返回内容';
  const parts: string[] = [];
  if (res.message) parts.push(String(res.message));
  else if (typeof res.reachable === 'boolean') parts.push(res.reachable ? '目标可达' : '目标不可达');
  else if (typeof res.status === 'string') parts.push(res.status === 'success' ? '成功' : '失败');
  const target = res.addr || res.url || (res.host ? `${res.host}${res.port ? `:${res.port}` : ''}` : '');
  if (target) parts.push(String(target));
  if (typeof res.code === 'number') parts.push(`HTTP ${res.code}`);
  if (typeof res.latency_ms === 'number') parts.push(`${res.latency_ms} ms`);
  return parts.join(' · ');
}

// ---------- 数据加载 ----------

async function loadSiteInfo(): Promise<void> {
  try {
    const info = (await siteConfigApi.info()) as unknown as SiteInfo;
    siteInfo.value = info;
    delete checkErrors.value.prepare;
    if (!snapshot.value) writeSnapshot(info);
  } catch (err: unknown) {
    siteInfo.value = null;
    checkErrors.value.prepare = errText(err);
  }
}

async function loadEnvs(): Promise<void> {
  try {
    const res = await remoteSyncApi.listEnvs();
    envs.value = itemsOf(res) as EnvLite[];
    delete checkErrors.value['create-env'];
    if (!targetEnvId.value || !envs.value.some((e) => String(e.id) === targetEnvId.value)) {
      const preferred =
        (activeEnvId.value && envs.value.find((e) => String(e.id) === activeEnvId.value)) ||
        envs.value.find((e) => Boolean(e.mqtt_host)) ||
        envs.value[0];
      targetEnvId.value = preferred ? String(preferred.id) : null;
    }
  } catch (err: unknown) {
    envs.value = [];
    checkErrors.value['create-env'] = errText(err);
  }
}

async function loadRuntime(): Promise<void> {
  try {
    runtime.value = (await remoteSyncApi.runtimeStatus()) as RuntimeStatus;
    delete checkErrors.value.activate;
  } catch (err: unknown) {
    runtime.value = null;
    checkErrors.value.activate = errText(err);
  }
}

async function loadSites(): Promise<void> {
  const id = targetEnvId.value;
  if (!id) {
    sites.value = [];
    return;
  }
  try {
    const res = await remoteSyncApi.listSites(id);
    sites.value = itemsOf(res) as SiteLite[];
    delete checkErrors.value.sites;
  } catch (err: unknown) {
    sites.value = [];
    checkErrors.value.sites = errText(err);
  }
  syncProbeMemory();
}

async function loadLedger(): Promise<void> {
  try {
    const res = await relayLedgerApi.summary();
    if (isLedgerUnavailable(res)) {
      ledgerState.value = 'unavailable';
      ledger.value = null;
    } else if (isLedgerNotInitialized(res)) {
      ledgerState.value = 'not_initialized';
      ledger.value = null;
    } else {
      ledgerState.value = 'ok';
      ledger.value = res;
    }
    ledgerError.value = null;
  } catch (err: unknown) {
    ledger.value = null;
    if (isLedgerUnavailable(err)) {
      ledgerState.value = 'unavailable';
      ledgerError.value = null;
    } else {
      ledgerState.value = 'error';
      ledgerError.value = errText(err);
    }
  }
}

async function refreshAll(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await loadSiteInfo();
    // admin 端点：没登录先按配置静默登一次（开发态默认开），还是没有 token 就不去碰它们
    if (!adminAuth.isLoggedIn) await adminAuth.ensureAutoLogin();
    if (adminAuth.isLoggedIn) {
      await Promise.all([loadEnvs(), loadRuntime()]);
      await Promise.all([loadSites(), loadLedger()]);
    } else {
      envs.value = [];
      runtime.value = null;
      sites.value = [];
    }
    lastCheckedAt.value = nowLabel();
  } finally {
    refreshing.value = false;
  }
}

// ---------- 动作 ----------

async function runProbe(kind: 'mqtt' | 'http'): Promise<void> {
  const id = targetEnvId.value;
  if (!id || probing.value) return;
  probing.value = kind;
  try {
    const res = kind === 'mqtt' ? await remoteSyncApi.testMqttEnv(id) : await remoteSyncApi.testHttpEnv(id);
    const ok = isRemoteSyncActionOk(res);
    const rec: ProbeResult = { ok, text: describeProbe(res), at: nowLabel() };
    probeResults.value = { ...probeResults.value, [kind]: rec };
    recordEnvProbe(id, kind, rec);
    (ok ? message.success : message.error)(`${kind === 'mqtt' ? '测 MQTT' : '测文件服务'}：${describeProbe(res)}`);
  } catch (err: unknown) {
    const rec: ProbeResult = { ok: false, text: errText(err), at: nowLabel() };
    probeResults.value = { ...probeResults.value, [kind]: rec };
    recordEnvProbe(id, kind, rec);
    message.error(`${kind === 'mqtt' ? '测 MQTT' : '测文件服务'}失败：${errText(err)}`);
  } finally {
    probing.value = null;
  }
}

async function runSiteProbe(site: SiteLite): Promise<void> {
  const key = String(site.id);
  if (siteProbing.value) return;
  siteProbing.value = key;
  try {
    const res = await remoteSyncApi.testHttpSite(site.id);
    const ok = isRemoteSyncActionOk(res);
    const rec: ProbeResult = { ok, text: describeProbe(res), at: nowLabel() };
    siteProbeResults.value = { ...siteProbeResults.value, [key]: rec };
    recordSiteProbe(key, rec);
  } catch (err: unknown) {
    const rec: ProbeResult = { ok: false, text: errText(err), at: nowLabel() };
    siteProbeResults.value = { ...siteProbeResults.value, [key]: rec };
    recordSiteProbe(key, rec);
  } finally {
    siteProbing.value = null;
  }
}

function goWithTour(step: GuideStepDef): void {
  guideTour.stop();
  router.push({ path: step.route ?? '/topology', query: { tour: step.id } }).catch((err: unknown) => {
    console.error('跳转失败:', errText(err));
  });
}

// ---------- 生命周期 ----------

watch(targetEnvId, () => {
  // 换环境：读这张卡自己记过的探测结果（没测过就是空），站点列表重取后 loadSites 里再同步一次
  probeResults.value = envProbes(targetEnvId.value);
  if (adminAuth.isLoggedIn) void loadSites();
});

// 登录态变化（自动登录完成 / 手工登录 / 登出）→ 立刻重查
watch(
  () => adminAuth.isLoggedIn,
  () => {
    void refreshAll();
  },
);

onMounted(async () => {
  // 别的标签页 / 同页别处写了探测结果就跟着更新
  stopProbeMemoryWatch = onProbeMemoryChange(syncProbeMemory);
  await refreshAll();
  // 默认停在第一个没完成的可判定步骤
  const firstTodo = steps.findIndex((s) => s.checkable && !checks.value[s.id]);
  currentIdx.value = firstTodo === -1 ? steps.length - 1 : firstTodo;
  timer = setInterval(() => void refreshAll(), REFRESH_MS);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  stopProbeMemoryWatch?.();
});
</script>
