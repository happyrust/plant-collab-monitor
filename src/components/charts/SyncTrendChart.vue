<template>
  <div class="chart-wrapper">
    <div class="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
      <i class="fas fa-chart-area text-blue-500"></i>
      同步趋势（最近7天）
    </div>
    <div ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer,
]);

const props = defineProps({
  data: {
    type: Object,
    default: () => ({
      dates: [],
      synced: [],
      pending: []
    })
  }
});

const chartContainer = ref(null);
let chartInstance = null;

const initChart = () => {
  if (!chartContainer.value) return;

  chartInstance = echarts.init(chartContainer.value);

  const option = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      textStyle: { color: '#334155' }
    },
    legend: {
      data: ['已同步', '待同步'],
      bottom: 0,
      textStyle: { color: '#64748b' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: props.data.dates.length > 0 ? props.data.dates : generateLast7Days(),
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#64748b', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#64748b', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f1f5f9' } }
    },
    series: [
      {
        name: '已同步',
        type: 'line',
        smooth: true,
        data: props.data.synced.length > 0 ? props.data.synced : [12, 18, 15, 24, 20, 28, 32],
        itemStyle: { color: '#10b981' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
            ]
          }
        }
      },
      {
        name: '待同步',
        type: 'line',
        smooth: true,
        data: props.data.pending.length > 0 ? props.data.pending : [5, 8, 6, 10, 7, 12, 9],
        itemStyle: { color: '#f59e0b' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 158, 11, 0.3)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0.05)' }
            ]
          }
        }
      }
    ]
  };

  chartInstance.setOption(option);
};

const generateLast7Days = () => {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  });
};

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize();
  }
};

watch(() => props.data, () => {
  if (chartInstance) {
    chartInstance.setOption({
      xAxis: {
        data: props.data.dates.length > 0 ? props.data.dates : generateLast7Days()
      },
      series: [
        {
          data: props.data.synced.length > 0 ? props.data.synced : [12, 18, 15, 24, 20, 28, 32]
        },
        {
          data: props.data.pending.length > 0 ? props.data.pending : [5, 8, 6, 10, 7, 12, 9]
        }
      ]
    });
  }
}, { deep: true });

onMounted(() => {
  initChart();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (chartInstance) {
    chartInstance.dispose();
  }
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
  height: 300px;
  width: 100%;
}
</style>
