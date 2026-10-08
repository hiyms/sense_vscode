/** @file 插件激活与命令注册的冒烟测试 */

import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'sense.sense';

/** 不含工程清单时也应注册的命令 */
const BASE_COMMANDS = [
    'sense.build',
    'sense.build.release',
    'sense.build.clean',
    'sense.build.fetch',
    'sense.build.update',
    'sense.build.targetDir',
    'sense.build.jobs',
    'sense.build.target',
    'sense.build.feature',
    'sense.build.workspace',
    'sense.run',
    'sense.test',
    'sense.test.noRun',
    'sense.test.skipBuild',
    'sense.test.coverage',
    'sense.test.jobs',
    'sense.test.filter',
    'sense.docs',
    'sense.manifest.open',
    'sense.format',
    'sense.formatFolder',
    'sense.codeCheck',
    'sense.codeCheckFolder',
    'sense.coverage',
    'sense.coverageFolder',
    'sense.project.create',
    'sense.project.create.view',
    'sense.sdk.select',
    'sense.require.refresh',
];

/** 只有存在 sense.toml 工程时才注册的语言服务命令 */
const LSP_COMMANDS = [
    'sense.lsp.reLaunch',
    'sense.lsp.stop',
    'sense.lsp.state',
    'sense.openOutputPanel',
];

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

suite('sense 扩展', () => {
    test('已安装并可以激活', async () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, `应安装扩展 ${EXTENSION_ID}`);
        await extension!.activate();
        assert.ok(extension!.isActive, '扩展应处于激活状态');
    });

    test('注册了基础命令', async () => {
        await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
        const commands = await vscode.commands.getCommands(true);
        const missing = BASE_COMMANDS.filter((id) => !commands.includes(id));
        assert.deepStrictEqual(missing, [], `缺少命令: ${missing.join(', ')}`);
    });

    test('语言服务命令与 sense.toml 的存在一致', async () => {
        await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
        const commands = await vscode.commands.getCommands(true);
        const manifest = await hasManifest();
        for (const id of LSP_COMMANDS) {
            assert.strictEqual(
                commands.includes(id),
                manifest,
                `存在 sense.toml 时 command ${id} 才应注册`
            );
        }
    });
});
