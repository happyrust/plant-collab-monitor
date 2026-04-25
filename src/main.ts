import { createApp } from 'vue';
import { createPinia } from 'pinia';
import naive from 'naive-ui';
import router from './router';
import App from './App.vue';

import 'vfonts/Lato.css';
import 'vfonts/FiraCode.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './styles/main.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(naive);
app.mount('#app');
