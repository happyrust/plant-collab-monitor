import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

/**
 * 页面内高亮导览（2026-09-21）：`/guide`「协同配置向导」把用户带到 `/topology` 后，
 * 按步骤在真实按钮上打聚光灯 + 说明卡。渲染在 `components/GuideTourOverlay.vue`，
 * 目标元素靠 `data-tour="xxx"` 定位（TopologyView 里标了一遍）。
 */
export interface TourStep {
  /** CSS 选择器，通常 `[data-tour="xxx"]`；页面上找不到时说明卡居中并显示 missingHint */
  target: string;
  title: string;
  body: string;
  /** 目标元素当前不在页面上时的提示（比如「先在左侧选中一个环境」） */
  missingHint?: string;
  /** 点击被高亮的元素后自动进下一步（最后一步则结束）；默认 true */
  advanceOnClick?: boolean;
}

export const useGuideTourStore = defineStore('guideTour', () => {
  const steps = ref<TourStep[]>([]);
  const index = ref(0);
  const active = ref(false);
  const tourId = ref<string | null>(null);

  const current = computed<TourStep | null>(() =>
    active.value ? (steps.value[index.value] ?? null) : null,
  );
  const isLast = computed(() => index.value >= steps.value.length - 1);

  function start(id: string, list: TourStep[]): void {
    if (list.length === 0) return;
    tourId.value = id;
    steps.value = list;
    index.value = 0;
    active.value = true;
  }

  function next(): void {
    if (isLast.value) {
      stop();
    } else {
      index.value += 1;
    }
  }

  function prev(): void {
    if (index.value > 0) index.value -= 1;
  }

  function stop(): void {
    active.value = false;
    steps.value = [];
    index.value = 0;
    tourId.value = null;
  }

  return { steps, index, active, tourId, current, isLast, start, next, prev, stop };
});
