/** @file LSP 状态栏管理，展示服务运行状态与服务端上报的进度 */

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

/** 状态栏上展示的一条进度信息，对应 LSP 的 work done progress */
export interface ProgressInfo {
    title?: string;
    message?: string;
    percentage?: number;
}

/** 由状态推导出的展示内容 */
interface StateDisplay {
    text: string;
    stateLine: string;
    actions: string[];
    color?: vscode.ThemeColor;
    background?: vscode.ThemeColor;
}

/** 状态栏上打开日志与跟踪面板的操作 */
const LOG_ACTIONS = [
    '[Open Log](command:sense.openOutputPanel)',
    '[Open Trace](command:sense.openTracePanel)',
];

/** 进度 token 的类型 */
type ProgressToken = string | number;

/** 服务端状态栏 UI，根据状态切换图标、颜色和提示文本，并叠加服务端上报的进度 */
export class ServerStatusBar implements vscode.Disposable {
    private serverStatusBar: vscode.StatusBarItem;
    /** 最近一次上报的服务状态，进度结束后据此恢复 */
    private stateInfo: any = { state: lspConstants.State.Starting };
    /** 服务端正在进行的进度，键为 LSP 进度 token，Map 保持创建顺序 */
    private progress = new Map<ProgressToken, ProgressInfo>();

    constructor() {
        this.serverStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.serverStatusBar.text = '$(sync~spin) sense';
        this.serverStatusBar.show();
    }

    /** 根据服务端状态更新状态栏的图标、颜色和提示文字 */
    updateServerState(stateInfo: any): void {
        this.stateInfo = stateInfo ?? {};
        this.render();
    }

    /** 更新或新增一条进度，缺失的字段沿用已有取值 */
    setProgress(token: ProgressToken, value: ProgressInfo): void {
        const previous = this.progress.get(token);
        this.progress.set(token, {
            title: value.title ?? previous?.title,
            message: value.message ?? previous?.message,
            percentage: value.percentage ?? previous?.percentage,
        });
        this.render();
    }

    /** 结束一条进度；不传 token 时结束全部进度 */
    clearProgress(token?: ProgressToken): void {
        if (token === undefined) {
            this.progress.clear();
        } else {
            this.progress.delete(token);
        }
        this.render();
    }

    /** 取出最近创建的一条进度 */
    private activeProgress(): ProgressInfo | undefined {
        let latest: ProgressInfo | undefined;
        for (const info of this.progress.values()) {
            latest = info;
        }
        return latest;
    }

    /** 把进度信息拼成状态栏文本 */
    private progressText(progress: ProgressInfo): string {
        const summary = Utility.checkIsValid(progress.message)
            ? progress.message!
            : progress.title ?? '';
        const percent = typeof progress.percentage === 'number'
            ? ` ${Math.round(progress.percentage)}%`
            : '';
        return `$(sync~spin) sense ${summary}${percent}`;
    }

    /** 描述状态对应的文本、颜色与操作 */
    private describeState(stateInfo: any): StateDisplay {
        switch (stateInfo.state) {
            case lspConstants.State.Stopped:
                return {
                    text: '$(debug-pause) sense',
                    stateLine: 'Server is stopped',
                    actions: ['[Start Server](command:sense.lsp.reLaunch)'],
                    color: new vscode.ThemeColor('statusBarItem.warningForeground'),
                    background: new vscode.ThemeColor('statusBarItem.warningBackground'),
                };
            case lspConstants.State.Running:
                return {
                    text: 'sense',
                    stateLine: 'State: Running',
                    actions: [
                        ...LOG_ACTIONS,
                        '[Restart Server](command:sense.lsp.reLaunch)',
                        '[Stop Server](command:sense.lsp.stop)',
                    ],
                };
            case lspConstants.State.Updating:
                return {
                    text: '$(sync~spin) sense',
                    stateLine: 'State: Updating',
                    actions: LOG_ACTIONS,
                    color: new vscode.ThemeColor('statusBarItem.warningForeground'),
                    background: new vscode.ThemeColor('statusBarItem.warningBackground'),
                };
            case lspConstants.State.Building:
                return {
                    text: '$(sync~spin) sense',
                    stateLine: 'State: Building',
                    actions: LOG_ACTIONS,
                    color: new vscode.ThemeColor('statusBarItem.warningForeground'),
                    background: new vscode.ThemeColor('statusBarItem.warningBackground'),
                };
            case lspConstants.State.Error:
                return {
                    text: '$(error) sense',
                    stateLine: 'Server stopped',
                    actions: [
                        ...LOG_ACTIONS,
                        '[Restart Server](command:sense.lsp.reLaunch)',
                    ],
                    color: new vscode.ThemeColor('statusBarItem.errorForeground'),
                    background: new vscode.ThemeColor('statusBarItem.errorBackground'),
                };
            default:
                return {
                    text: '$(sync~spin) sense',
                    stateLine: 'State: Starting',
                    actions: LOG_ACTIONS,
                    color: new vscode.ThemeColor('statusBarItem.warningForeground'),
                    background: new vscode.ThemeColor('statusBarItem.warningBackground'),
                };
        }
    }

    /** 根据当前状态与进度构建 MarkdownString tooltip */
    private buildTooltip(version: string, display: StateDisplay, progress?: ProgressInfo): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString('', true);
        tooltip.isTrusted = true;

        const versionText = Utility.checkIsValid(version) ? `v${version}` : 'Unknown';
        tooltip.appendMarkdown(`LSP ${versionText}\n\n`);

        if (progress) {
            if (Utility.checkIsValid(progress.title)) {
                tooltip.appendMarkdown(`${progress.title}\n\n`);
            }
            if (Utility.checkIsValid(progress.message)) {
                tooltip.appendMarkdown(`${progress.message}\n\n`);
            }
            if (typeof progress.percentage === 'number') {
                tooltip.appendMarkdown(`${Math.round(progress.percentage)}%\n\n`);
            }
        } else {
            tooltip.appendMarkdown(`${display.stateLine}\n\n`);
        }

        tooltip.appendMarkdown('---\n\n');
        for (const action of display.actions) {
            tooltip.appendMarkdown(`${action}\n\n`);
        }
        return tooltip;
    }

    /** 把当前状态与进度写到状态栏 */
    private render(): void {
        const display = this.describeState(this.stateInfo);
        const progress = this.activeProgress();
        this.serverStatusBar.text = progress ? this.progressText(progress) : display.text;
        this.serverStatusBar.tooltip = this.buildTooltip(
            this.stateInfo.serverVersion || '',
            display,
            progress
        );
        this.serverStatusBar.color = display.color;
        this.serverStatusBar.backgroundColor = display.background;
    }

    dispose(): void {
        this.serverStatusBar.dispose();
    }
}
