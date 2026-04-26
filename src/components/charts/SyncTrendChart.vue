<template>
  <div class="chart-wrapper">
    <div class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
      <i class="fas fa-chart-area text-blue-500"></i>
      同步趋势（最近7天）
    </div>
    <div ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { useThemeStore } from '@/stores/theme';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  TooltipComponent,
  LegendComponent,
  GridComponent,
  GraphicComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  GraphicComponent,
  CanvasRenderer,
]);

interface SyncTrendData {
  dates: string[];
  synced: number[];
  pending: number[];
}

const props = withDefaults(
  defineProps<{ data?: SyncTrendData }>(),
  {
    data: () => ({ dates: [], synced: [], pending: [] }),
  },
);

const themeStore = useThemeStore();
const chartContainer = ref<HTMLElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

const generateLast7Days = (): string[] =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  });

const isEmpty = computed(
  () => props.data.synced.length === 0 && props.data.pending.length === 0,
);

const buildOption = () => {
  const dark = themeStore.isDark;
  const dates = props.data.dates.length > 0 ? props.data.dates : generateLast7Days();
  const axisColor = dark ? '#475569' : '#e2e8f0';
  const labelColor = dark ? '#94a3b8' : '#64748b';
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: dark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      borderColor: dark ? '#475569' : '#e2e8f0',
      borderWidth: 1,
      textStyle: { color: dark ? '#e2e8f0' : '#334155' },
    },
    legend: {
      data: ['已同步', '待同步'],
      bottom: 0,
      textStyle: { color: labelColor },
    },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: labelColor, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: labelColor, fontSize: 11 },
      splitLine: { lineStyle: { color: dark ? '#334155' : '#f1f5f9' } },
    },
    series: [
      {
        name: '已同步',
        type: 'line',
        smooth: true,
        data: props.data.synced,
        itemStyle: { color: '#10b981' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.05)' },
            ],
          },
        },
      },
      {
        name: '待同步',
        type: 'line',
        smooth: true,
        data: props.data.pending,
        itemStyle: { color: '#f59e0b' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 158, 11, 0.3)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0.05)' },
            ],
          },
        },
      },
    ],
    graphic: isEmpty.value
      ? [
          {
            type: 'text',
            left: 'center',
            top: 'middle',
            silent: true,
            style: {
              text: '暂无同步数据',
              fill: '#94a3b8',
              fontSize: 13,
              fontWeight: 500,
            },
          },
        ]
      : [],
  };
};

const initChart = () => {
  if (!chartContainer.value) return;
  chartInstance = echarts.init(chartContainer.value);
  chartInstance.setOption(buildOption());
};

const handleResize = () => {
  chartInstance?.resize();
};

watch(
  () => [props.data, themeStore.isDark],
  () => {
    chartInstance?.setOption(buildOption(), { notMerge: true });
  },
  { deep: true },
);

onMounted(() => {
  initChart();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  chartInstance?.dispose();
  chartInstance = null;
});
</script>

<style scoped>
.chart-wrapper {
  background: #f8fafc;
  padding: 1rem;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
}
:where(.dark) .chart-wrapper {
  background: #1e293b;
  border-color: #334155;
}

.chart-container {
  height: 300px;
  width: 100%;
}
</style>
