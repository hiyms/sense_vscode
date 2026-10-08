import { defineConfig } from '@vscode/test-cli';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// 优先使用机器上已安装的 VS Code，找不到时再下载 stable 版本
function resolveCodeExecutable() {
    const candidates = ['/usr/share/code/code', '/usr/lib/code/code', '/opt/visual-studio-code/code'];
    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }
    try {
        const found = execSync('which code', { encoding: 'utf8' }).trim();
        return found === '' ? undefined : found;
    } catch {
        return undefined;
    }
}

const executable = resolveCodeExecutable();
const installation = executable
    ? { useInstallation: { fromPath: executable } }
    : { version: 'stable' };

export default defineConfig([
    {
        label: 'sense-project',
        files: 'out/test/**/*.test.js',
        workspaceFolder: 'test-fixtures/sample-project',
        ...installation,
        mocha: {
            ui: 'tdd',
            timeout: 120000,
        },
    },
    {
        label: 'plain-project',
        files: 'out/test/**/*.test.js',
        workspaceFolder: 'test-fixtures/plain',
        ...installation,
        mocha: {
            ui: 'tdd',
            timeout: 120000,
        },
    },
]);
