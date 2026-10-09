#!/usr/bin/env bash
# 校验 vsix 的元数据与内容：不包含源码、测试与开发文件，运行时依赖已打进 out/extension.js。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

pnpm run package

VERSION="$(node -e "process.stdout.write(require('./package.json').version)")"
VSIX="$REPO_ROOT/sense-$VERSION.vsix"
if [[ ! -f "$VSIX" ]]; then
    echo "没有生成 $VSIX" >&2
    exit 1
fi

EXTRACT_DIR="$REPO_ROOT/.scratch/vsix-check"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
unzip -q "$VSIX" -d "$EXTRACT_DIR"
EXT="$EXTRACT_DIR/extension"

for forbidden in src test-fixtures node_modules .gitcode .github scripts; do
    if [[ -e "$EXT/$forbidden" ]]; then
        echo "vsix 不应包含 $forbidden" >&2
        exit 1
    fi
done

if [[ ! -f "$EXT/out/extension.js" ]]; then
    echo "vsix 缺少 out/extension.js" >&2
    exit 1
fi

grep -q "workDoneProgress/create" "$EXT/out/extension.js"

node -e "
const manifest = require('$EXT/package.json');
if (manifest.name !== 'sense') throw new Error('unexpected name ' + manifest.name);
if (manifest.publisher !== 'opencj') throw new Error('unexpected publisher ' + manifest.publisher);
if (!manifest.repository || !manifest.icon) throw new Error('missing repository or icon');
console.log('publisher=' + manifest.publisher + ' name=' + manifest.name + ' version=' + manifest.version);
"

echo "== 打包校验通过 =="
