<template>
  <Teleport to="body">
    <div v-if="tour.active && tour.current" class="guide-tour" data-testid="guide-tour">
      <!-- 遮罩：有目标时四块围住目标（目标区域留空、可以直接点），没目标时整块盖住 -->
      <template v-if="rect">
        <div class="guide-tour__mask" :style="maskStyle('top')"></div>
        <div class="guide-tour__mask" :style="maskStyle('bottom')"></div>
        <div class="guide-tour__mask" :style="maskStyle('left')"></div>
        <div class="guide-tour__mask" :style="maskStyle('right')"></div>
        <div class="guide-tour__ring" :style="ringStyle"></div>
      </template>
      <div v-else class="guide-tour__mask guide-tour__mask--full"></div>

      <!-- 说明卡 -->
      <div
        ref="cardEl"
        class="guide-tour__card bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-600 rounded-xl shadow-2xl p-4"
        :style="cardStyle"
        role="dialog"
        aria-live="polite"
        data-testid="guide-tour-card"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-[11px] font-semibold tracking-wider text-blue-600 dark:text-blue-300 uppercase">
            导览 {{ tour.index + 1 }} / {{ tour.steps.length }}
          </span>
          <button
            class="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
            title="结束导览（Esc）"
            @click="tour.stop()"
          >
            ✕
          </button>
        </div>
        <h4 class="font-bold text-base mb-1">{{ tour.current.title }}</h4>
        <p class="text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line">{{ tour.current.body }}</p>
        <p
          v-if="!rect"
          class="mt-2 text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800"
          data-testid="guide-tour-missing"
        >
          {{ tour.current.missingHint || '这个元素当前不在页面上，先完成前面的步骤再回来看。' }}
        </p>
        <p v-else-if="tour.current.advanceOnClick !== false" class="mt-2 text-[11px] text-slate-400">
          直接点亮着的那个按钮就会进入下一步。
        </p>
        <div class="flex items-center justify-between mt-3">
          <button class="btn btn-ghost btn-xs" @click="backToGuide">回到向导</button>
          <div class="flex items-center gap-2">
            <button class="btn btn-ghost btn-xs" :disabled="tour.index === 0" @click="tour.prev()">上一步</button>
            <button class="btn btn-primary btn-xs" data-testid="guide-tour-next" @click="tour.next()">
              {{ tour.isLast ? '完成' : '下一步' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type CSSProperties } from 'vue';
import { useRouter } from 'vue-router';
import { useGuideTourStore } from '@/stores/guideTour';

const tour = useGuideTourStore();
const router = useRouter();

const PAD = 6;
const CARD_WIDTH = 340;
const GAP = 12;

const rect = ref<DOMRect | null>(null);
const cardEl = ref<HTMLElement | null>(null);
const cardHeight = ref(200);
const viewport = ref({ w: window.innerWidth, h: window.innerHeight });

let raf: number | null = null;
let scrolledFor: string | null = null;

function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (!a || !b) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

function findTarget(): HTMLElement | null {
  const step = tour.current;
  if (!step) return null;
  try {
    return document.querySelector<HTMLElement>(step.target);
  } catch {
    return null;
  }
}

/** 每帧对一遍目标位置（滚动 / 布局变化 / 元素出现或消失都跟着走） */
function tick(): void {
  if (!tour.active) {
    rect.value = null;
    raf = null;
    return;
  }
  const el = findTarget();
  const r = el ? el.getBoundingClientRect() : null;
  const visible = r !== null && (r.width > 0 || r.height > 0);
  const nextRect = visible ? r : null;
  if (!sameRect(rect.value, nextRect)) rect.value = nextRect;
  const stepKey = `${tour.tourId}:${tour.index}`;
  if (el && visible && scrolledFor !== stepKey) {
    scrolledFor = stepKey;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }
  if (viewport.value.w !== window.innerWidth || viewport.value.h !== window.innerHeight) {
    viewport.value = { w: window.innerWidth, h: window.innerHeight };
  }
  const h = cardEl.value?.offsetHeight;
  if (h && h !== cardHeight.value) cardHeight.value = h;
  raf = requestAnimationFrame(tick);
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') tour.stop();
}

/** 点了被高亮的元素 → 自动进下一步（让用户「照着点」就能走完） */
function onDocumentClick(e: MouseEvent): void {
  const step = tour.current;
  if (!step || step.advanceOnClick === false) return;
  const el = findTarget();
  if (el && e.target instanceof Node && el.contains(e.target)) {
    window.setTimeout(() => tour.next(), 150);
  }
}

function attach(): void {
  if (raf === null) raf = requestAnimationFrame(tick);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onDocumentClick, true);
}

function detach(): void {
  if (raf !== null) {
    cancelAnimationFrame(raf);
    raf = null;
  }
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('click', onDocumentClick, true);
  rect.value = null;
  scrolledFor = null;
}

watch(
  () => tour.active,
  (on) => (on ? attach() : detach()),
  { immediate: true },
);

onUnmounted(detach);

function backToGuide(): void {
  tour.stop();
  router.push('/guide').catch(() => {
    // 已经在向导页时忽略
  });
}

function px(n: number): string {
  return `${Math.max(0, Math.round(n))}px`;
}

function maskStyle(side: 'top' | 'bottom' | 'left' | 'right'): CSSProperties {
  const r = rect.value;
  const { w, h } = viewport.value;
  if (!r) return {};
  const top = r.top - PAD;
  const bottom = r.bottom + PAD;
  const left = r.left - PAD;
  const right = r.right + PAD;
  switch (side) {
    case 'top':
      return { left: '0', top: '0', width: px(w), height: px(top) };
    case 'bottom':
      return { left: '0', top: px(bottom), width: px(w), height: px(h - bottom) };
    case 'left':
      return { left: '0', top: px(top), width: px(left), height: px(bottom - top) };
    case 'right':
    default:
      return { left: px(right), top: px(top), width: px(w - right), height: px(bottom - top) };
  }
}

const ringStyle = computed<CSSProperties>(() => {
  const r = rect.value;
  if (!r) return {};
  return {
    left: px(r.left - PAD),
    top: px(r.top - PAD),
    width: px(r.width + PAD * 2),
    height: px(r.height + PAD * 2),
  };
});

const cardStyle = computed<CSSProperties>(() => {
  const r = rect.value;
  const { w, h } = viewport.value;
  if (!r) {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: px(Math.min(CARD_WIDTH, w - 24)) };
  }
  const width = Math.min(CARD_WIDTH, w - 24);
  const left = Math.min(Math.max(r.left, 12), w - width - 12);
  const below = r.bottom + PAD + GAP;
  const fitsBelow = below + cardHeight.value + 12 <= h;
  const top = fitsBelow ? below : Math.max(12, r.top - PAD - GAP - cardHeight.value);
  return { left: px(left), top: px(top), width: px(width) };
});
</script>

<style scoped>
/* z-index 压在 DaisyUI modal（999）与 naive-ui 弹层之下：导览中点「新建 / 激活」弹出的表单和确认框要浮在遮罩上面 */
.guide-tour__mask {
  position: fixed;
  background: rgba(15, 23, 42, 0.55);
  z-index: 900;
}
.guide-tour__mask--full {
  inset: 0;
}
.guide-tour__ring {
  position: fixed;
  border: 2px solid #3b82f6;
  border-radius: 10px;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.25);
  pointer-events: none;
  z-index: 901;
  transition: left 0.15s ease, top 0.15s ease, width 0.15s ease, height 0.15s ease;
}
.guide-tour__card {
  position: fixed;
  z-index: 902;
}
</style>
