/** @file WebView 面板基础类，管理面板的创建复用和销毁 */

import * as vscode from 'vscode';
import { Utility } from '../utils/utility';

/**
 * WebView 面板基础类，封装面板的创建复用和销毁逻辑
 *
 * 同一时刻只持有一个面板。需要新建面板时会先释放旧面板，避免面板被覆盖
 * 之后失去释放入口。
 */
export class Webview {
    /** 当前 WebView 面板实例 */
    public panel: vscode.WebviewPanel | null = null;

    /**
     * 创建或显示 WebView 面板
     * @param viewType - 面板类型标识
     * @param title - 面板标题
     */
    newPanel(viewType: string, title: string): void {
        if (Utility.checkIsValid(this.panel) && viewType !== 'cjcovhtml') {
            this.panel!.reveal(vscode.ViewColumn.Beside, true);
            return;
        }

        if (Utility.checkIsValid(this.panel)) {
            const previous = this.panel!;
            this.panel = null;
            previous.dispose();
        }

        const panel = vscode.window.createWebviewPanel(
            viewType,
            title,
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            { enableScripts: true, retainContextWhenHidden: true }
        );
        this.panel = panel;
        panel.onDidDispose(() => {
            if (this.panel === panel) {
                this.panel = null;
            }
        });
    }

    /** 关闭面板并清理引用 */
    closePanel(): void {
        if (Utility.checkIsValid(this.panel)) {
            const panel = this.panel!;
            this.panel = null;
            panel.dispose();
        }
    }
}
