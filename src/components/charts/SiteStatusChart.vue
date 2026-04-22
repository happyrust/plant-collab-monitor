<template>
  <div class="chart-wrapper">
    <div class="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
      <i class="fas fa-chart-pie text-indigo-500"></i>
      站点状态分布
    </div>
    <div ref="chartContainer" class="chart-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({
      idle: 0,
      scanning: 0,
      completed: 0,
      error: 0
    })
  }
});

const chartContainer = ref(null);
let chartInstance = null;

const initChart = () => {
  if (!chartContainer.value || typeof echarts === 'undefined') return;

  chartInstance = echarts.init(chartContainer.value);

  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      textStyle: { color: '#334155' }
    },
    legend: {
      orient: 'vertical',
      right: '10%',
      top: 'center',
      textStyle: { color: '#64748b', fontSize: 12 }
    },
    series: [
      {
        name: '站点状态',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold',
            color: '#334155'
          }
        },
        labelLine: {
          show: false
        },
        data: [
          { value: props.data.idle || 0, name: '空闲', itemStyle: { color: '#94a3b8' } },
          { value: props.data.scanning || 0, name: '扫描中', itemStyle: { color: '#3b82f6' } },
          { value: props.data.completed || 1, name: '已完成', itemStyle: { color: '#10b981' } },
          { value: props.data.error || 0, name: '错误', itemStyle: { color: '#ef4444' } }
        ]
      }
    ]
  };

  chartInstance.setOption(option);
};

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize();
  }
};

watch(() => props.data, () => {
  if (chartInstance) {
    chartInstance.setOption({
      series: [{
        data: [
          { value: props.data.idle || 0, name: '空闲' },
          { value: props.data.scanning || 0, name: '扫描中' },
          { value: props.data.completed || 0, name: '已完成' },
          { value: props.data.error || 0, name: '错误' }
        ]
      }]
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
