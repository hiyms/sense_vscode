/** @file LSP 状态栏管理，展示服务运行状态 */

import * as vscode from 'vscode';
import * as lspConstants from '../utils/lspConstants';
import { Utility } from '../utils/utility';

let statusBar: ServerStatusBar | undefined;

/** 获取状态栏单例，首次调用时创建 */
export function getStatusBar(): ServerStatusBar {
    if (!statusBar) {
        statusBar = new ServerStatusBar();
    }
    return statusBar;
}

/** 服务端状态栏 UI，根据状态切换图标、颜色和提示文本 */
export class ServerStatusBar implements vscode.Disposable {
    private serverStatusBar: vscode.StatusBarItem;

    constructor() {
        this.serverStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.serverStatusBar.text = '$(sync~spin) sense';
        this.serverStatusBar.show();
    }

    /** 根据版本、状态行和操作列表构建 MarkdownString tooltip */
    private buildTooltip(version: string, stateLine: string, actions: string[]): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString('', true);
        tooltip.isTrusted = true;

        const versionText = Utility.checkIsValid(version) ? `v${version}` : 'Unknown';
        tooltip.appendMarkdown(`LSP ${versionText}\n\n`);
        tooltip.appendMarkdown(`${stateLine}\n\n`);
        tooltip.appendMarkdown('---\n\n');
        for (const action of actions) {
            tooltip.appendMarkdown(`${action}\n\n`);
        }
        return tooltip;
    }

    /** 根据服务端状态更新状态栏的图标、颜色和提示文字 */
    updateServerState(stateInfo: any): void {
        const version = stateInfo.serverVersion || '';

        switch (stateInfo.state) {
            case lspConstants.State.Stopped:
                this.serverStatusBar.text = '$(debug-pause) sense';
                this.serverStatusBar.tooltip = this.buildTooltip(version, 'Server is stopped', [
                    '[Start Server](command:sense.lsp.reLaunch)',
                ]);
                this.serverStatusBar.color = new vscode.ThemeColor('statusBarItem.warningForeground');
                this.serverStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case lspConstants.State.Starting:
                this.serverStatusBar.text = '$(sync~spin) sense';
                this.serverStatusBar.tooltip = this.buildTooltip(version, 'State: Starting', [
                    '[Open Log](command:sense.openOutputPanel)',
                    '[Open Trace](command:sense.openTracePanel)',
                ]);
                this.serverStatusBar.color = new vscode.ThemeColor('statusBarItem.warningForeground');
                this.serverStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case lspConstants.State.Running:
                this.serverStatusBar.text = 'sense';
                this.serverStatusBar.tooltip = this.buildTooltip(version, 'State: Running', [
                    '[Open Log](command:sense.openOutputPanel)',
                    '[Open Trace](command:sense.openTracePanel)',
                    '[Restart Server](command:sense.lsp.reLaunch)',
                    '[Stop Server](command:sense.lsp.stop)',
                ]);
                this.serverStatusBar.color = undefined;
                this.serverStatusBar.backgroundColor = undefined;
                break;
            case lspConstants.State.Updating:
                this.serverStatusBar.text = '$(sync~spin) sense';
                this.serverStatusBar.tooltip = this.buildTooltip(version, 'State: Updating', [
                    '[Open Log](command:sense.openOutputPanel)',
                    '[Open Trace](command:sense.openTracePanel)',
                ]);
                this.serverStatusBar.color = new vscode.ThemeColor('statusBarItem.warningForeground');
                this.serverStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case lspConstants.State.Building:
                this.serverStatusBar.text = '$(sync~spin) sense';
                this.serverStatusBar.tooltip = this.buildTooltip(version, 'State: Building', [
                    '[Open Log](command:sense.openOutputPanel)',
                    '[Open Trace](command:sense.openTracePanel)',
                ]);
                this.serverStatusBar.color = new vscode.ThemeColor('statusBarItem.warningForeground');
                this.serverStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case lspConstants.State.Error:
                this.serverStatusBar.text = '$(error) sense';
                this.serverStatusBar.tooltip = this.buildTooltip(version, 'Server stopped', [
                    '[Open Log](command:sense.openOutputPanel)',
                    '[Open Trace](command:sense.openTracePanel)',
                    '[Restart Server](command:sense.lsp.reLaunch)',
                ]);
                this.serverStatusBar.color = new vscode.ThemeColor('statusBarItem.errorForeground');
                this.serverStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
        }
    }

    dispose(): void {
        this.serverStatusBar.dispose();
    }
}
