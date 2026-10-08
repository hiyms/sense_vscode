/** @file LSP 插件激活入口，管理 LSP 的启动、重启、停止以及文件变更监听 */

import * as vscode from 'vscode';

import * as lspConstants from '../utils/lspConstants';
import { Utility } from '../utils/utility';
import { OutputHelper } from '../utils/outputHelper';
import { context as lspContext } from './context';
import { getStatusBar } from './statusBar';
import { senseTomlName, senseLockName } from '../utils/constants';

/** 正在进行的重启任务，用于把并发触发的重启串行化 */
let restartInFlight: Promise<void> | null = null;

/** 重启 LSP 服务 */
async function restartLsp(context: vscode.ExtensionContext): Promise<void> {
    if (restartInFlight !== null) {
        return restartInFlight;
    }
    restartInFlight = (async () => {
        try {
            await lspContext.dispose();
            await Utility.delay(lspConstants.delay500);
            await lspContext.activate(context);
        } finally {
            restartInFlight = null;
        }
    })();
    return restartInFlight;
}

/**
 * 激活 LSP 插件：配置编辑器、注册命令、文件监听和初始化 LSP 客户端。
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const ctx = lspContext;
    context.subscriptions.push(ctx);

    // 状态栏、输出面板与状态更新命令注册在扩展生命周期上，不随 LSP 重启而注销
    context.subscriptions.push(
        vscode.commands.registerCommand('sense.openOutputPanel', () => {
            OutputHelper.show();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('sense.lsp.updateState', (state: any) => {
            getStatusBar().updateServerState(state);
        })
    );
    getStatusBar();

    // 配置编辑器设置：覆盖跳转定位命令、禁用选中高亮、启用自动保存等
    vscode.workspace.getConfiguration('editor').update('gotoLocation.alternativeDeclarationCommand', 'editor.action.revealDefinition');
    vscode.workspace.getConfiguration('editor').update('gotoLocation.alternativeDefinitionCommand', 'editor.action.revealDefinition');
    vscode.workspace.getConfiguration('editor').update('gotoLocation.alternativeTypeDefinitionCommand', 'editor.action.revealDefinition');
    vscode.workspace.getConfiguration('editor').update('selectionHighlight', false);
    vscode.workspace.getConfiguration('files').update('autoSave', 'onFocusChange');
    vscode.workspace.getConfiguration('editor').update('suggest.snippetsPreventQuickSuggestions', false);
    vscode.workspace.getConfiguration('editor').update('quickSuggestions', { other: 'on', comments: 'off', strings: 'on' });

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.lsp.reLaunch', async (forceRestart: boolean = false) => {
            if (forceRestart) {
                ctx.client = null;
            } else {
                ctx.client?.resetRestartCount();
            }
            await restartLsp(context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.lsp.state', () => ctx.getLspState())
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.lsp.stop', () => {
            ctx.stopLspServer();
            vscode.commands.executeCommand('sense.lsp.updateState', { state: lspConstants.State.Stopped });
        })
    );

    // 注册补全跟踪命令：将用户选择的补全项通知 LSP 服务端
    context.subscriptions.push(
        vscode.commands.registerCommand('sense.lsp.trackCompletion', (item: any) => {
            const params = { label: item.label };
            (ctx.client as any)?.sendNotification('textDocument/trackCompletion', params);
        })
    );

    vscode.window.showInformationMessage('sense Language Server is now active!');

    await ctx.activate(context);

    // 监听 sense.toml 与 sense.lock 变更：重启 LSP 以重新解析工程
    const tomlWatcher = vscode.workspace.createFileSystemWatcher(`**/${senseTomlName}`);
    const lockWatcher = vscode.workspace.createFileSystemWatcher(`**/${senseLockName}`);
    context.subscriptions.push(tomlWatcher, lockWatcher);

    const onManifestChanged = async () => {
        Utility.refreshManifestRoots();
        if (!ctx.getLspState()) return;
        await restartLsp(context);
    };
    context.subscriptions.push(tomlWatcher.onDidChange(onManifestChanged));
    context.subscriptions.push(tomlWatcher.onDidCreate(onManifestChanged));
    context.subscriptions.push(lockWatcher.onDidChange(onManifestChanged));
    context.subscriptions.push(lockWatcher.onDidCreate(onManifestChanged));

    // 活动编辑器切换处理：打开 .cj 文件且服务未运行时自动启动 LSP
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async (editor: vscode.TextEditor | undefined) => {
            if (!ctx.getLspState() && editor?.document?.fileName?.endsWith('.cj')) {
                await ctx.activate(context);
            }
        })
    );
}
