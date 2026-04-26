import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';
import App from './App.vue';

import 'vfonts/Lato.css';
import 'vfonts/FiraCode.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/main.css';

// naive-ui 改为按需引入：组件由 unplugin-vue-components + NaiveUiResolver 自动注册并 tree-shake，
// hooks（useDialog/useMessage 等）由 unplugin-auto-import 自动注入。
// 因此不再 `app.use(naive)` 全量挂载，避免 1.3MB 巨型 vendor chunk。

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
