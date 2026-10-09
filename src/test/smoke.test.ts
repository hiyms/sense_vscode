/** @file 插件激活与命令注册的冒烟测试 */

import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'opencj.sense';

/** 扩展应注册的全部命令 */
const EXPECTED_COMMANDS = [
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
    'sense.lsp.reLaunch',
    'sense.lsp.stop',
    'sense.lsp.state',
    'sense.openOutputPanel',
    'sense.openTracePanel',
];

suite('sense 扩展', () => {
    test('已安装并可以激活', async () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, `应安装扩展 ${EXTENSION_ID}`);
        await extension!.activate();
        assert.ok(extension!.isActive, '扩展应处于激活状态');
    });

    test('注册了全部 sense 命令', async () => {
        await vscode.extensions.getExtension(EXTENSION_ID)!.activate();
        const commands = await vscode.commands.getCommands(true);
        const missing = EXPECTED_COMMANDS.filter((id) => !commands.includes(id));
        assert.deepStrictEqual(missing, [], `缺少命令: ${missing.join(', ')}`);
    });
});
