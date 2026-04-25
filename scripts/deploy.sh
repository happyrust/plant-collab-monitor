#!/usr/bin/env bash
# plant-collab-monitor · 一键部署脚本
#
# 用法：
#   ./scripts/deploy.sh                                  # 默认部署到 root@123.57.182.243:/var/www/plant-collab-monitor
#   ./scripts/deploy.sh user@host                        # 自定义远端
#   ./scripts/deploy.sh user@host /var/www/path          # 自定义远端 + 路径
#   DRY_RUN=1 ./scripts/deploy.sh                        # 只构建不上传
#
# 前置条件：
#   - 本机已安装 Node.js >= 20 + npm
#   - 本机已配置 ssh 免密登录到目标服务器
#   - 目标服务器 nginx 已配置（参考 ../plant-model-gen/shells/deploy/nginx-plant-collab-monitor.conf.example）
#
# 行为：
#   1. type-check 守门（出错即停）
#   2. vite build 产出 dist/
#   3. rsync dist/ 到远端目标路径（--delete 同步删除旧文件）
#   4. 远端 nginx -t && systemctl reload nginx（best-effort，失败不阻断）

set -euo pipefail

REMOTE="${1:-root@123.57.182.243}"
TARGET="${2:-/var/www/plant-collab-monitor}"
DRY_RUN="${DRY_RUN:-0}"

cd "$(dirname "$0")/.."

echo "──────────────────────────────────────────"
echo "  plant-collab-monitor · deploy"
echo "  remote: $REMOTE"
echo "  target: $TARGET"
echo "  dry-run: $DRY_RUN"
echo "──────────────────────────────────────────"

echo
echo "→ [1/4] type-check"
npm run type-check

echo
echo "→ [2/4] build"
npm run build

if [ "$DRY_RUN" = "1" ]; then
  echo
  echo "✓ DRY_RUN done · skip rsync & nginx reload"
  echo "  built artifacts: $(pwd)/dist"
  exit 0
fi

echo
echo "→ [3/4] rsync to $REMOTE:$TARGET"
rsync -avz --delete dist/ "$REMOTE:$TARGET/"

echo
echo "→ [4/4] reload nginx (best-effort)"
if ssh -o BatchMode=yes "$REMOTE" "nginx -t && systemctl reload nginx" 2>/dev/null; then
  echo "  nginx reloaded"
else
  echo "  ⚠ nginx reload skipped or failed; manual reload may be needed"
fi

echo
echo "✓ deploy done · $REMOTE:$TARGET"
echo "  访问: http://$(echo $REMOTE | cut -d@ -f2)/"
