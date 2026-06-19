#!/usr/bin/env bash
# 把 repo 根目录下的 web/ + common/ 同步到 mobile/www/，
# 并把 web/index.html 等文件里对 ../common/ 的相对引用改写为 ./common/，
# 这样 WebView 把 mobile/www/index.html 作为入口加载时所有资源路径仍然正确。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$MOBILE_DIR/.." && pwd)"
WWW="$MOBILE_DIR/www"

echo "[sync-www] root=$ROOT"
echo "[sync-www] www=$WWW"

rm -rf "$WWW"
mkdir -p "$WWW"

# web/ 内容平铺到 www/ 根下（index.html 直接成为 www/index.html）
cp -R "$ROOT/web/." "$WWW/"

# common/ 也复制进 www/，与 index.html 同级
cp -R "$ROOT/common" "$WWW/common"

# 把所有引用 ../common/ 的地方改成 ./common/
# （仅限 HTML/JS/CSS 文本文件；目前只在 web/index.html 里出现，但全量替换更稳）
find "$WWW" -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \) -print0 \
  | xargs -0 sed -i 's|\.\./common/|./common/|g'

echo "[sync-www] done. files synced under $WWW"
