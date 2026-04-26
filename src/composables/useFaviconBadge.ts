import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppStatusStore } from '@/stores/appStatus';

function drawFavicon(color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AI', 16, 17);
  return canvas.toDataURL('image/png');
}

let linkEl: HTMLLinkElement | null = null;

function setFavicon(dataUrl: string) {
  if (!linkEl) {
    linkEl = document.querySelector('link[rel="icon"]');
    if (!linkEl) {
      linkEl = document.createElement('link');
      linkEl.rel = 'icon';
      document.head.appendChild(linkEl);
    }
  }
  linkEl.href = dataUrl;
}

const normalIcon = drawFavicon('#2563eb');
const alertIcon = drawFavicon('#dc2626');
const warnIcon = drawFavicon('#d97706');

export function useFaviconBadge() {
  const store = useAppStatusStore();
  const { connected, queue } = storeToRefs(store);

  watch(
    [connected, () => queue.value.failed],
    ([conn, failed]) => {
      if (!conn) {
        setFavicon(alertIcon);
      } else if (failed > 0) {
        setFavicon(warnIcon);
      } else {
        setFavicon(normalIcon);
      }
    },
    { immediate: true },
  );
}
