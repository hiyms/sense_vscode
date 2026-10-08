/** @file WebView 面板基础类，管理面板的创建、显示和销毁 */

import * as vscode from 'vscode';
import { Utility } from '../utils/utility';

/**
 * WebView 面板基础类，封装面板的创建复用和销毁逻辑
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
        } else {
            this.panel = vscode.window.createWebviewPanel(
                viewType,
                title,
                { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                { enableScripts: true, retainContextWhenHidden: true }
            );
            this.panel.onDidDispose(() => {
                this.panel = null;
            });
        }
    }

    /** 关闭面板并清理引用 */
    closePanel(): void {
        if (Utility.checkIsValid(this.panel)) {
            this.panel!.dispose();
            this.panel = null;
        }
    }
}
