import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// plant-collab-monitor · Vite 配置
//
// 默认后端: plant-model-gen 的 web_server (127.0.0.1:3100)
// 端口取决于 db_options/DbOption.toml 的 server_release_ip (默认 3100)
// 可通过 VITE_API_TARGET env 覆盖（例如指向 staging/production 地址）
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:3100';
  const wsTarget = apiTarget.replace(/^http/, 'ws');
  // 生产部署默认挂载在 /monitor/（与 README + nginx-plant-collab-monitor.conf 对齐）
  // 开发态默认 / ；可由 VITE_BASE 覆盖
  const base = env.VITE_BASE || (mode === 'production' ? '/monitor/' : '/');

  return {
    base,
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 3200,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/files': { target: apiTarget, changeOrigin: true },
        '/static': { target: apiTarget, changeOrigin: true },
        '/ws': { target: wsTarget, ws: true, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      // vendor-naive 单 chunk ~1.36MB（gzip ~365KB）是 first-load 必备的 UI 库，
      // 按需引入 naive-ui 是另一项独立改造；先抬高阈值消除噪音警告
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          // 手工分块: 把体积较大的第三方库拆到独立 chunk, 降低主 bundle 尺寸
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](echarts|zrender)[\\/]/.test(id)) return 'vendor-echarts';
            if (/[\\/]node_modules[\\/]naive-ui[\\/]/.test(id)) return 'vendor-naive';
            if (/[\\/]node_modules[\\/]vooks[\\/]/.test(id)) return 'vendor-naive';
            if (/[\\/]node_modules[\\/]vueuc[\\/]/.test(id)) return 'vendor-naive';
            if (/[\\/]node_modules[\\/]seemly[\\/]/.test(id)) return 'vendor-naive';
            if (/[\\/]node_modules[\\/]treemate[\\/]/.test(id)) return 'vendor-naive';
            if (/[\\/]node_modules[\\/](vue|vue-router|pinia|@vue)[\\/]/.test(id)) return 'vendor-vue';
            if (/[\\/]node_modules[\\/](axios|@vueuse)[\\/]/.test(id)) return 'vendor-http';
            return undefined;
          },
        },
      },
    },
  };
});
