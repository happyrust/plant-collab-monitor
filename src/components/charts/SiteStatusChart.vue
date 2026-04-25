<template>
  <div class="chart-wrapper">
    <div class="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
      <i class="fas fa-chart-pie text-indigo-500"></i>
      {{ title }}
    </div>
    <div ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer]);

const props = defineProps({
  title: {
    type: String,
    default: '站点状态分布',
  },
  // 通用 segments：[{ name, value, color? }]
  segments: {
    type: Array,
    default: () => [],
  },
  // 旧版兼容字段（idle/scanning/completed/error），如果 segments 为空则使用
  data: {
    type: Object,
    default: () => ({ idle: 0, scanning: 0, completed: 0, error: 0 }),
  },
});

const FALLBACK_COLORS = ['#10b981', '#ef4444', '#a855f7', '#3b82f6', '#f59e0b', '#94a3b8'];

const effectiveSegments = computed(() => {
  if (props.segments && props.segments.length > 0) {
    return props.segments.map((s, idx) => ({
      name: s.name,
      value: s.value || 0,
      itemStyle: { color: s.color || FALLBACK_COLORS[idx % FALLBACK_COLORS.length] },
    }));
  }
  // legacy fallback
  return [
    { name: '空闲', value: props.data.idle || 0, itemStyle: { color: '#94a3b8' } },
    { name: '扫描中', value: props.data.scanning || 0, itemStyle: { color: '#3b82f6' } },
    { name: '已完成', value: props.data.completed || 0, itemStyle: { color: '#10b981' } },
    { name: '错误', value: props.data.error || 0, itemStyle: { color: '#ef4444' } },
  ];
});

const chartContainer = ref(null);
let chartInstance = null;

const buildOption = () => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    textStyle: { color: '#334155' },
  },
  legend: {
    orient: 'vertical',
    right: '10%',
    top: 'center',
    textStyle: { color: '#64748b', fontSize: 12 },
  },
  series: [
    {
      name: props.title,
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
      label: { show: false, position: 'center' },
      emphasis: {
        label: { show: true, fontSize: 16, fontWeight: 'bold', color: '#334155' },
      },
      labelLine: { show: false },
      data: effectiveSegments.value,
    },
  ],
});

const initChart = () => {
  if (!chartContainer.value) return;
  chartInstance = echarts.init(chartContainer.value);
  chartInstance.setOption(buildOption());
};

const handleResize = () => {
  if (chartInstance) chartInstance.resize();
};

watch(
  () => [props.segments, props.data, props.title],
  () => {
    if (chartInstance) chartInstance.setOption(buildOption());
  },
  { deep: true },
);

onMounted(() => {
  initChart();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (chartInstance) chartInstance.dispose();
});
</script>

<style scoped>
.chart-wrapper {
  background: #f8fafc;
  padding: 1rem;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
}
.chart-container {
  height: 280px;
  width: 100%;
}
</style>
