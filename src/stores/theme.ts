import { ref, watch } from 'vue';
import { defineStore } from 'pinia';

const STORAGE_KEY = 'theme_dark';

function applyTheme(dark: boolean) {
  const html = document.documentElement;
  html.setAttribute('data-theme', dark ? 'dark' : 'light');
  html.classList.toggle('dark', dark);
}

export const useThemeStore = defineStore('theme', () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  const prefersDark =
    stored !== null
      ? stored === '1'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;

  const isDark = ref(prefersDark);

  applyTheme(isDark.value);

  watch(isDark, (v) => {
    localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
    applyTheme(v);
  });

  function toggle() {
    isDark.value = !isDark.value;
  }

  return { isDark, toggle };
});
