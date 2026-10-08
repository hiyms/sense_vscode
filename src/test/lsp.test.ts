/** @file sense 语言服务器端到端测试，验证 FIFO 桥接后的 LSP 握手与基础能力 */

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'sense.sense';
const STARTUP_TIMEOUT_MS = 90_000;

/** 从环境变量读取 sense 可执行文件与 SDK，未配置时返回 undefined */
function readEnvironment(): { executable: string; sdk: string } | undefined {
    const executable = process.env.SENSE_EXECUTABLE_PATH ?? '';
    const sdk = process.env.CANGJIE_HOME ?? '';
    if (executable === '' || sdk === '') {
        return undefined;
    }
    return { executable, sdk };
}

/** 轮询等待条件成立 */
async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return check();
}

suite('sense 语言服务器', () => {
    test('在 sense.toml 工程上启动并响应请求', async function () {
        this.timeout(STARTUP_TIMEOUT_MS + 60_000);
        const environment = readEnvironment();
        if (environment === undefined) {
            this.skip();
            return;
        }

        let manifest = false;
        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            try {
                await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, 'sense.toml'));
                manifest = true;
            } catch {
                // 该文件夹没有 sense.toml
            }
        }
        if (!manifest) {
            this.skip();
            return;
        }

        const senseConfig = vscode.workspace.getConfiguration('sense');
        await senseConfig.update('executablePath', environment.executable, vscode.ConfigurationTarget.Workspace);
        await senseConfig.update('sdkPath', environment.sdk, vscode.ConfigurationTarget.Workspace);

        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        await extension!.activate();
        await vscode.commands.executeCommand('sense.lsp.reLaunch', true);

        const running = await waitFor(
            async () => (await vscode.commands.executeCommand<boolean>('sense.lsp.state')) === true,
            STARTUP_TIMEOUT_MS
        );
        assert.ok(running, 'sense 语言服务器应进入 Running 状态');

        const folder = vscode.workspace.workspaceFolders![0];
        const mainUri = vscode.Uri.joinPath(folder.uri, 'src', 'main.cj');
        const document = await vscode.workspace.openTextDocument(mainUri);
        await vscode.window.showTextDocument(document);

        const hover = await waitFor(async () => {
            const result = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                mainUri,
                new vscode.Position(3, 5)
            );
            return Array.isArray(result) && result.length > 0;
        }, 60_000);
        assert.ok(hover, '语言服务器应对 main.cj 返回悬浮提示');

        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            mainUri
        );
        assert.ok(Array.isArray(symbols) && symbols.length > 0, '语言服务器应返回文档符号');
    });
});
