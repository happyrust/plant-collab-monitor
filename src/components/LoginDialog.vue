<template>
  <NModal
    :show="store.loginVisible"
    preset="card"
    title="管理员登录"
    :mask-closable="false"
    :close-on-esc="false"
    :show-icon="false"
    style="max-width: 400px"
    @update:show="(v) => !v && store.dismissLogin()"
  >
    <NAlert
      v-if="store.loginError"
      type="warning"
      :show-icon="false"
      class="mb-4"
    >
      {{ store.loginError }}
    </NAlert>

    <NForm @submit.prevent="handleLogin">
      <NFormItem label="用户名" path="username">
        <NInput
          v-model:value="username"
          placeholder="ADMIN_USER 环境变量值"
          autocomplete="username"
          :disabled="loading"
          @keyup.enter="handleLogin"
        />
      </NFormItem>
      <NFormItem label="密码" path="password">
        <NInput
          v-model:value="password"
          type="password"
          show-password-on="click"
          placeholder="ADMIN_PASS 环境变量值"
          autocomplete="current-password"
          :disabled="loading"
          @keyup.enter="handleLogin"
        />
      </NFormItem>
    </NForm>

    <template #footer>
      <div class="flex justify-end gap-2">
        <NButton :disabled="loading" @click="store.dismissLogin">
          取消
        </NButton>
        <NButton
          type="primary"
          :loading="loading"
          :disabled="!username || !password"
          @click="handleLogin"
        >
          登录
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NAlert,
  useMessage,
} from 'naive-ui';
import { adminAuthApi } from '@/api';
import { useAdminAuthStore } from '@/stores/adminAuth';
import { consumeRedirectAfterLogin } from '@/router';

const store = useAdminAuthStore();
const message = useMessage();
const router = useRouter();

const username = ref('');
const password = ref('');
const loading = ref(false);

async function handleLogin(): Promise<void> {
  if (!username.value || !password.value) return;
  loading.value = true;
  try {
    const session = await adminAuthApi.login(username.value, password.value);
    store.setSession(session);
    store.dismissLogin();
    password.value = '';
    message.success(`欢迎，${session.username}`);
    const redirect = consumeRedirectAfterLogin();
    if (redirect && redirect !== router.currentRoute.value.fullPath) {
      router.push(redirect).catch(() => {
        // 路由跳转失败（例如目标路由依然 guard 拒绝）静默吞掉
      });
    }
  } catch (err: unknown) {
    const errMsg =
      typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : '登录失败';
    store.loginError = errMsg;
  } finally {
    loading.value = false;
  }
}
</script>
