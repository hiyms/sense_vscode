/** @file 激活条件测试：只处理 sense.toml 工程，且命令在没有工程时也可用 */

import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'opencj.sense';

/** 判断测试工作区是否存在 sense.toml */
async function hasManifest(): Promise<boolean> {
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, 'sense.toml'));
            return true;
        } catch {
            // 该文件夹没有 sense.toml
        }
    }
    return false;
}

suite('激活条件', () => {
    test('没有 sense.toml 时不启动语言服务', async () => {
        await vscode.extensions.getExtension(EXTENSION_ID)!.activate();

        if (await hasManifest()) {
            // 本配置用于验证相反的分支
            return;
        }

        const running = await vscode.commands.executeCommand<boolean>('sense.lsp.state');
        assert.strictEqual(running, false, '没有 sense.toml 时语言服务不应在运行');
    });

    test('没有 sense.toml 时语言服务命令仍然可用，便于用户补救', async () => {
        await vscode.extensions.getExtension(EXTENSION_ID)!.activate();

        if (await hasManifest()) {
            return;
        }

        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('sense.lsp.reLaunch'), 'sense.lsp.reLaunch 应始终可用');
        assert.ok(commands.includes('sense.lsp.state'), 'sense.lsp.state 应始终可用');
    });
});
