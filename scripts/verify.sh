#!/usr/bin/env bash
# 从任意 shell 重复执行的整体验证：类型检查、打包、以及 @vscode/test-cli 端到端测试。
#
# 需要先执行过一次 pnpm install（node_modules 会被保留）。
# 需要 CANGJIE_HOME（默认 /opt/cangjie-nightly）与 sense 可执行文件。
# sense 依次从 SENSE_EXECUTABLE_PATH、已知位置、PATH 中查找。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export CANGJIE_HOME="${CANGJIE_HOME:-/opt/cangjie-nightly}"

if [[ -z "${SENSE_EXECUTABLE_PATH:-}" ]]; then
    for candidate in \
        "/home/yms/work/sense-binaries-preview.2-x/sense-binaries/sense" \
        "$REPO_ROOT/bin/sense"; do
        if [[ -x "$candidate" ]]; then
            SENSE_EXECUTABLE_PATH="$candidate"
            break
        fi
    done
fi
if [[ -z "${SENSE_EXECUTABLE_PATH:-}" ]]; then
    SENSE_EXECUTABLE_PATH="$(command -v sense || true)"
fi
if [[ -z "${SENSE_EXECUTABLE_PATH:-}" ]]; then
    echo "找不到 sense 可执行文件：请设置 SENSE_EXECUTABLE_PATH" >&2
    exit 1
fi
export SENSE_EXECUTABLE_PATH

if [[ ! -x "$CANGJIE_HOME/bin/cjc" || ! -d "$CANGJIE_HOME/tools/bin" ]]; then
    echo "CANGJIE_HOME（$CANGJIE_HOME）不是有效的仓颉 SDK" >&2
    exit 1
fi

echo "== 环境 =="
echo "REPO_ROOT=$REPO_ROOT"
echo "CANGJIE_HOME=$CANGJIE_HOME"
echo "SENSE_EXECUTABLE_PATH=$SENSE_EXECUTABLE_PATH"

echo "== 类型检查 =="
pnpm run check

echo "== 打包 =="
pnpm run webpack

echo "== 端到端测试 =="
if [[ -n "${DISPLAY:-}" ]]; then
    pnpm test
elif command -v xvfb-run >/dev/null 2>&1; then
    xvfb-run -a pnpm test
else
    echo "没有 DISPLAY 也没有 xvfb-run，无法运行 VS Code 测试" >&2
    exit 1
fi

echo "== 验证通过 =="
