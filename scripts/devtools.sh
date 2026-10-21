#!/usr/bin/env bash
# WSL 侧启动 Windows 微信开发者工具（真机调试）助手
#
# 背景：项目在 WSL 文件系统（/home/...），开发者工具无法稳定打开 \\wsl.localhost
# UNC 路径，因此先把项目镜像同步到 Windows 盘（D:\wechat-aaplet\eesast-applet），
# 再通过官方 CLI（cli.bat）打开/预览。镜像目录已开 compileHotReLoad，重复 sync
# 后工具会自动重编译。
#
# 前置（仅首次）：
#   1. Windows 侧安装微信开发者工具（当前位于 D:\wechat-aaplet\微信web开发者工具）
#   2. 工具 GUI 中 设置 → 安全设置 → 服务端口 开启（CLI 依赖）
#
# 用法：
#   scripts/devtools.sh sync     # 仅同步项目镜像到 D:\wechat-aaplet\eesast-applet
#   scripts/devtools.sh open     # 同步 + 启动工具并打开项目（GUI 顶部点「真机调试」）
#   scripts/devtools.sh preview  # 同步 + 生成真机预览二维码（微信扫码）
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
IDE_BASE_W="/mnt/d/wechat-aaplet"        # Windows 侧根目录
IDE_REL="微信web开发者工具"               # 开发者工具安装目录（相对根目录）
MIRROR_REL="eesast-applet"               # 项目镜像目录（相对根目录）
CMD_EXE="/mnt/c/Windows/System32/cmd.exe"

# /mnt/d/a/b -> D:\a\b
to_win_path() {
  local p="${1#/mnt/}"
  local drive="${p%%/*}"
  local rest="${p#*/}"
  printf '%s:\\%s' "${drive^^}" "${rest//\//\\}"
}

# 在 Windows 盘目录下调用 cli.bat（规避 cmd.exe 不支持 UNC 工作目录）
run_cli() {
  (cd "$IDE_BASE_W" && "$CMD_EXE" /c "$IDE_REL\\cli.bat" "$@")
}

do_sync() {
  if [ ! -d "$IDE_BASE_W/$IDE_REL" ]; then
    echo "未找到微信开发者工具：$IDE_BASE_W/$IDE_REL" >&2
    echo "请修改脚本头部 IDE_BASE_W / IDE_REL 指向实际安装位置。" >&2
    exit 1
  fi
  mkdir -p "$IDE_BASE_W/$MIRROR_REL"
  rsync -a --delete \
    --exclude '.git' --exclude 'scripts' --exclude 'docs' --exclude 'node_modules' \
    "$SRC/" "$IDE_BASE_W/$MIRROR_REL/"
  echo "已同步镜像 -> $(to_win_path "$IDE_BASE_W/$MIRROR_REL")"
}

launch_gui() {
  echo "直接启动开发者工具 GUI…"
  (cd "$IDE_BASE_W" && "$CMD_EXE" /c start "" "$IDE_REL\\微信开发者工具.exe" >/dev/null 2>&1) || true
}

do_open() {
  do_sync
  local project
  project="$(to_win_path "$IDE_BASE_W/$MIRROR_REL")"
  echo "通过 CLI 打开项目：$project"
  if ! run_cli open --project "$project"; then
    echo
    echo "CLI 打开失败（常见原因：服务端口未开启）。已尝试直接启动 GUI。"
    launch_gui
    echo "请在工具中手动打开 $project；并到 设置 → 安全设置 → 开启服务端口 后重试本命令。"
    echo "项目打开后，点击工具栏「真机调试」按钮即可开始真机调试。"
    exit 1
  fi
  echo "项目已打开。点击工具栏「真机调试」即可用手机扫码开始真机调试。"
}

do_preview() {
  do_sync
  local project
  project="$(to_win_path "$IDE_BASE_W/$MIRROR_REL")"
  echo "生成真机预览二维码…"
  if ! run_cli preview --project "$project" --qr-format terminal; then
    echo "终端二维码失败，改输出图片…"
    run_cli preview --project "$project" --qr-format image \
      --qr-output "$MIRROR_REL\\preview-qr.png" || { launch_gui; exit 1; }
    echo "二维码已生成：$(to_win_path "$IDE_BASE_W/$MIRROR_REL")\\preview-qr.png（微信扫码预览）"
  fi
}

case "${1:-}" in
  sync) do_sync ;;
  open) do_open ;;
  preview) do_preview ;;
  *)
    grep '^#' "$0" | sed 's/^# \{0,1\}//;1d' | sed -n '1,30p'
    exit 1
    ;;
esac
