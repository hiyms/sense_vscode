/** @file LSP 插件激活入口，注册命令、文件监听并确保语言服务在运行 */

import * as vscode from 'vscode';

import { Utility } from '../utils/utility';
import { OutputHelper } from '../utils/outputHelper';
import { context as lspContext } from './context';
import { getStatusBar } from './statusBar';
import { senseTomlName, senseLockName } from '../utils/constants';

/** 命令、监听与状态栏只注册一次 */
let registered = false;

/**
 * 激活 LSP 插件。
 *
 * 可以重复调用：注册部分只在首次执行，语言服务的启动由 SenseContext 保证幂等。
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const ctx = lspContext;

    if (!registered) {
        registered = true;

        context.subscriptions.push(ctx);

        // 状态栏、输出面板与状态更新命令注册在扩展生命周期上，不随 LSP 重启而注销
        context.subscriptions.push(
            vscode.commands.registerCommand('sense.openOutputPanel', () => {
                OutputHelper.show();
            })
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('sense.openTracePanel', () => {
                OutputHelper.showTrace();
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
            vscode.commands.registerCommand('sense.lsp.reLaunch', async () => {
                await ctx.restart();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sense.lsp.state', () => ctx.getLspState())
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sense.lsp.stop', async () => {
                await ctx.stopByUser();
            })
        );

        // 注册补全跟踪命令：将用户选择的补全项通知 LSP 服务端
        context.subscriptions.push(
            vscode.commands.registerCommand('sense.lsp.trackCompletion', (item: any) => {
                const params = { label: item.label };
                (ctx.client as any)?.sendNotification('textDocument/trackCompletion', params);
            })
        );

        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('sense.trace.server')) {
                    void ctx.applyTraceSetting();
                }
            })
        );

        // 监听 sense.toml 与 sense.lock 变更：重启 LSP 以重新解析工程
        const tomlWatcher = vscode.workspace.createFileSystemWatcher(`**/${senseTomlName}`);
        const lockWatcher = vscode.workspace.createFileSystemWatcher(`**/${senseLockName}`);
        context.subscriptions.push(tomlWatcher, lockWatcher);

        const onManifestChanged = async () => {
            Utility.refreshManifestRoots();
            if (!ctx.getLspState()) return;
            await ctx.restart();
        };
        context.subscriptions.push(tomlWatcher.onDidChange(onManifestChanged));
        context.subscriptions.push(tomlWatcher.onDidCreate(onManifestChanged));
        context.subscriptions.push(lockWatcher.onDidChange(onManifestChanged));
        context.subscriptions.push(lockWatcher.onDidCreate(onManifestChanged));

        // 活动编辑器切换处理：打开 .cj 文件且服务未运行时启动语言服务
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(async (editor: vscode.TextEditor | undefined) => {
                if (!ctx.getLspState() && editor?.document?.fileName?.endsWith('.cj')) {
                    await ctx.start();
                }
            })
        );
    }

    await ctx.activate(context);
}
