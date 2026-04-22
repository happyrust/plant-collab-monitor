<template>
  <section class="px-8 py-8 max-w-5xl mx-auto">
    <header class="flex items-center justify-between border-b border-slate-200 pb-6 mb-6">
      <div>
        <p class="text-xs uppercase tracking-widest text-slate-500 mb-1">PLANT · MONITOR</p>
        <h1 class="text-3xl font-semibold tracking-tight text-slate-900">{{ title }}</h1>
        <p v-if="description" class="mt-2 text-slate-600 max-w-2xl">{{ description }}</p>
      </div>
      <div v-if="$slots.actions">
        <slot name="actions" />
      </div>
    </header>

    <div v-if="$slots.default">
      <slot />
    </div>
    <div v-else class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-500">
      <p class="mb-3 font-mono text-xs uppercase tracking-[0.3em]">placeholder · phase 2.3</p>
      <p>
        对应组件将从 <code class="font-mono text-slate-700">web-server/frontend/src</code> 整体移植，
        保持 Naive UI + Tailwind 视觉气质不变。
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>
