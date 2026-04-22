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

  return {
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
    },
  };
});
