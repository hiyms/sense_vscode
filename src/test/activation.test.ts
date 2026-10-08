/** @file 激活条件测试：只有存在 sense.toml 时才启用语言服务 */

import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'sense.sense';

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
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        await extension!.activate();

        if (await hasManifest()) {
            // 本配置用于验证相反的分支
            return;
        }

        const commands = await vscode.commands.getCommands(true);
        assert.ok(!commands.includes('sense.lsp.state'), '没有 sense.toml 时不应注册语言服务命令');
        assert.ok(!commands.includes('sense.lsp.reLaunch'), '没有 sense.toml 时不应注册语言服务命令');
    });

    test('存在 sense.toml 时注册语言服务命令', async () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        await extension!.activate();

        if (!(await hasManifest())) {
            return;
        }

        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('sense.lsp.state'), '存在 sense.toml 时应注册语言服务命令');
        assert.ok(commands.includes('sense.lsp.reLaunch'), '存在 sense.toml 时应注册语言服务命令');
    });
});
