// /topology 部署动作面 · mock 后端（L1 契约层共用）
//
// 被 scripts/topology-deploy-smoke.mjs（自动化用例 DA-xx）与 scripts/topology-deploy-tutorial.mjs
// （教程截图生成）共同引用：同一份状态、同一套路由，按 shape 产出两种后端响应形状：
//   pmg = plant-model-gen/web_server（`status: 'success' | 'failed'`、`runtime/status` 给 `active/env_id`）
//   pws = plant-web-server standalone-real（`success: boolean` + `reachable`、激活态在 `envs[].active`）
//
// 改这里的 fixture / 响应字段时，同步 docs/e2e-smoke/remote-deploy-auto-test-cases.md §2 的期望列。

export function createState(shape) {
  const envs = [
    { id: 'env-1', name: '华东协同环境', file_server_host: 'http://127.0.0.1:4101', mqtt_host: '127.0.0.1', mqtt_port: 1883, location: 'local-a', location_dbs: '7999' },
    { id: 'env-2', name: '备用环境', file_server_host: 'http://10.0.0.9:3100', mqtt_host: '10.0.0.9', mqtt_port: 1883, location: 'local-c', location_dbs: '8002' },
    { id: 'env-3', name: '故障环境', file_server_host: 'http://10.0.0.13:3100', mqtt_host: '10.0.0.13', mqtt_port: 1883, location: 'local-d', location_dbs: '8003' },
  ];
  if (shape === 'pws') {
    for (const e of envs) {
      e.active = e.id === 'env-1';
      e.mode = 'standalone-real';
    }
  }
  return {
    shape,
    envs,
    sites: {
      'env-1': [
        { id: 's-1', env_id: 'env-1', name: 'site-b-local', location: 'local-b', http_host: 'http://127.0.0.1:4101', dbnums: '8001', notes: 'Created by smoke' },
        { id: 's-2', env_id: 'env-1', name: 'site-c-remote', location: 'local-c', http_host: 'http://10.0.0.12:3100', dbnums: '8002', notes: '' },
      ],
      'env-2': [],
      'env-3': [],
    },
    // pmg：runtime.env_id / runtime.active；pws：envs[].active（running 恒 true）
    activeEnvId: 'env-1',
    runtimeActive: true,
    taskCount: 3,
    importCalls: 0,
    createdEnvs: 0,
    createdSites: 0,
  };
}

export function hostPort(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port ? Number(u.port) : null };
  } catch {
    return { host: url, port: null };
  }
}

/** 返回 { status, json } 或 { abort: true } */
export function respond(state, method, url, body) {
  const p = url.pathname;
  const pmg = state.shape === 'pmg';
  const now = new Date().toISOString();
  const ok = (json, status = 200) => ({ status, json });
  const findEnv = (id) => state.envs.find((e) => e.id === id) ?? { id, mqtt_host: '?', mqtt_port: 0, file_server_host: '?' };
  const findSite = (id) => Object.values(state.sites).flat().find((s) => s.id === id) ?? { id, http_host: '?' };
  let m;

  // ---- 跨站点直连（TopologyView 用原生 fetch 探活）----
  if (p === '/api/health') {
    return url.hostname === '10.0.0.12' ? ok({ status: 'down' }, 503) : ok({ status: 'ok' });
  }

  // ---- admin auth ----
  if (p === '/api/admin/auth/login' && method === 'POST') {
    if (body?.username !== 'admin' || body?.password !== 'admin') {
      return ok({ success: false, message: '用户名或密码错误' }, 401);
    }
    return ok(
      pmg
        ? { success: true, data: { token: 'mock-pmg-token', expires_at: '2099-01-01T00:00:00Z', user: { username: 'admin', role: 'admin' } } }
        // plant-web-server：没有 expires_at（bb60405 之前监控台对它登录必失败）
        : { success: true, data: { token: 'detached-admin-token', user: { username: 'admin', role: 'admin' } } },
    );
  }
  if (p === '/api/admin/auth/me') return ok({ success: true, data: { user: { username: 'admin', role: 'admin' } } });

  // ---- envs ----
  // DA-16：从 DbOption 导入。pmg 每次新建（UUID + 「导入环境 - 时间戳」，action_success 顶层给 id）；
  // pws 是 create_or_update_env，id 固定 dboption-<site_id>，重复导入就是覆盖（响应 item/data）
  if (p === '/api/remote-sync/envs/import-from-dboption' && method === 'POST') {
    state.importCalls += 1;
    if (pmg) {
      const id = `imported-${state.importCalls}`;
      state.envs.push({ id, name: `导入环境 - 20260914_2230${String(state.importCalls).padStart(2, '0')}`, file_server_host: 'http://127.0.0.1:4100', mqtt_host: '127.0.0.1', mqtt_port: 1883, location: 'local-a', location_dbs: '7999' });
      return ok({ status: 'success', message: '已从当前配置导入协同组', id, checked_at: now });
    }
    const id = 'dboption-local-a';
    let env = state.envs.find((e) => e.id === id);
    if (!env) {
      env = { id, name: 'AvevaMarineSample', source: 'DbOption', active: false, mode: 'standalone-real', config: { location: 'local-a', mqtt_host: '127.0.0.1', mqtt_port: 1883, file_server_host: 'http://127.0.0.1:4100' } };
      state.envs.push(env);
    }
    env.updated_at = now;
    return ok({ success: true, item: env, data: env, mode: 'standalone-real' });
  }
  if (p === '/api/remote-sync/envs' && method === 'GET') {
    return ok(
      pmg
        ? { status: 'success', items: state.envs }
        : { success: true, items: state.envs, active: state.envs.find((e) => e.active) ?? null, total: state.envs.length },
    );
  }
  // 新建 env（教程「手填新建」一步用；用例层由 LF-02 在真后端覆盖）
  if (p === '/api/remote-sync/envs' && method === 'POST') {
    state.createdEnvs += 1;
    const id = `env-new-${state.createdEnvs}`;
    const env = { id, ...(body ?? {}), mqtt_port: Number(body?.mqtt_port ?? 1883), created_at: now, updated_at: now };
    if (!pmg) Object.assign(env, { active: false, mode: 'standalone-real' });
    state.envs.push(env);
    state.sites[id] = [];
    return ok(pmg ? { status: 'success', message: '协同组已创建', id } : { success: true, item: env, data: env, mode: 'standalone-real' });
  }
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)$/)) && method === 'DELETE') {
    state.envs = state.envs.filter((e) => e.id !== m[1]);
    delete state.sites[m[1]];
    return ok(pmg ? { status: 'success' } : { success: true, deleted: true, id: m[1] });
  }
  if (p === '/api/remote-sync/runtime/status') {
    return ok(
      pmg
        ? { status: 'success', active: state.runtimeActive, env_id: state.runtimeActive ? state.activeEnvId : null, mqtt_connected: state.runtimeActive ? true : null }
        : { success: true, running: true, env_count: state.envs.length, site_count: 2, active_task_count: state.taskCount, root: 'runtime/remote_sync', mode: 'standalone-real' },
    );
  }
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/sites$/)) && method === 'GET') {
    const items = state.sites[m[1]] ?? [];
    return ok(pmg ? { status: 'success', items } : { success: true, items, total: items.length });
  }
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/sites$/)) && method === 'POST') {
    state.createdSites += 1;
    const site = { id: `s-new-${state.createdSites}`, env_id: m[1], ...(body ?? {}), created_at: now, updated_at: now };
    (state.sites[m[1]] ??= []).push(site);
    return ok(pmg ? { status: 'success', message: '站点已创建', id: site.id } : { success: true, item: site, data: site, mode: 'standalone-real' });
  }

  // ---- env 诊断 ----
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/test-mqtt$/)) && method === 'POST') {
    // DA-13：后端 5xx，前端必须落到「请求失败」banner 而不是红错
    if (m[1] === 'env-3') return ok({ status: 'failed', message: 'internal error' }, 500);
    const env = findEnv(m[1]);
    return ok(
      pmg
        ? { status: 'success', message: 'MQTT 连接可达', checked_at: now, addr: `${env.mqtt_host}:${env.mqtt_port}`, latency_ms: 3 }
        : { success: true, kind: 'mqtt', host: env.mqtt_host, port: env.mqtt_port, reachable: true },
    );
  }
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/test-http$/)) && method === 'POST') {
    const env = findEnv(m[1]);
    const hp = hostPort(env.file_server_host);
    return ok(
      pmg
        ? { status: 'failed', message: '请求失败: error sending request (connection refused)', checked_at: now, url: env.file_server_host }
        : { success: true, kind: 'http', host: hp.host, port: hp.port, reachable: false },
    );
  }

  // ---- env → 运行时 ----
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/activate$/)) && method === 'POST') {
    state.activeEnvId = m[1];
    state.runtimeActive = true;
    state.taskCount += 1;
    for (const e of state.envs) if ('active' in e) e.active = e.id === m[1];
    return ok(
      pmg
        ? { status: 'success', message: '已写入配置文件并启动 watcher + MQTT 订阅。', env_id: m[1] }
        : { success: true, item: findEnv(m[1]), task: { id: `remote-sync-activate-${m[1]}`, kind: 'activate', status: 'Active' } },
    );
  }
  if ((m = p.match(/^\/api\/remote-sync\/envs\/([^/]+)\/apply$/)) && method === 'POST') {
    // DA-08：env-1 的 apply 固定失败（HTTP 200 + 业务失败）
    if (m[1] === 'env-1') {
      return ok(
        pmg
          ? { status: 'failed', message: 'db_options/DbOption.toml 不存在，无法写入当前配置。', env_id: m[1] }
          : { success: false, message: 'env env-1 is locked by another task' },
      );
    }
    state.taskCount += 1;
    return ok(
      pmg
        ? { status: 'success', message: '已写入配置文件。部分运行期组件需重启或重新加载配置后生效。', env_id: m[1] }
        : { success: true, task: { id: `remote-sync-apply-${m[1]}`, kind: 'apply', status: 'Active' } },
    );
  }
  if (p === '/api/remote-sync/runtime/stop' && method === 'POST') {
    const prev = state.activeEnvId;
    if (pmg) {
      state.runtimeActive = false;
      state.activeEnvId = null;
      return ok({ status: 'success', message: '已停止运行时 watcher + MQTT', env_id: prev });
    }
    // plant-web-server 实测语义（2026-09-14）：只把活动任务标 Stopped；running 恒 true、active 不清
    state.taskCount = 0;
    return ok({ success: true, stopped: true });
  }

  // ---- sites ----
  if ((m = p.match(/^\/api\/remote-sync\/sites\/([^/]+)\/test-http$/)) && method === 'POST') {
    const site = findSite(m[1]);
    const hp = hostPort(site.http_host);
    const reachable = m[1] === 's-1';
    if (pmg) {
      return ok(
        reachable
          ? { status: 'success', message: '站点 metadata 可达', checked_at: now, url: `${site.http_host}/metadata.json`, code: 200, latency_ms: 12 }
          : { status: 'failed', message: '请求失败: error sending request (connection refused)', checked_at: now, url: `${site.http_host}/metadata.json` },
      );
    }
    return ok({ success: true, kind: 'http', host: hp.host, port: hp.port, reachable });
  }
  if ((m = p.match(/^\/api\/remote-sync\/sites\/([^/]+)$/)) && method === 'PUT') {
    const site = findSite(m[1]);
    Object.assign(site, body ?? {});
    return ok(pmg ? { status: 'success' } : { success: true, item: site });
  }
  if ((m = p.match(/^\/api\/remote-sync\/sites\/([^/]+)$/)) && method === 'DELETE') {
    for (const list of Object.values(state.sites)) {
      const i = list.findIndex((s) => s.id === m[1]);
      if (i >= 0) list.splice(i, 1);
    }
    return ok(pmg ? { status: 'success' } : { success: true, deleted: true, id: m[1] });
  }

  // ---- 其它页面基础请求 ----
  if (p === '/api/site-config' && method === 'GET') {
    return ok({ config: { project_name: 'demo', project_code: 'DEMO', location: 'local-a', location_dbs: [7999], mqtt_host: '127.0.0.1', mqtt_port: 1883, file_server_host: 'http://127.0.0.1:4100' } });
  }
  if (p === '/api/site-config/server-ip') return ok({ status: 'success', ip: '192.168.1.10' });
  if (p === '/api/site/info') {
    return ok({ success: true, location: 'local-a', role: 'master', file_server_host: 'http://127.0.0.1:4100', mqtt_host: '127.0.0.1', mqtt_port: 1883 });
  }
  if (p === '/api/sync/status') return ok({ status: 'running' });
  if (p === '/api/sync/queue') return ok({ items: [], failed: 0 });
  if (p === '/api/sync/events/stream') return { abort: true };
  return ok({ status: 'success', items: [] });
}
