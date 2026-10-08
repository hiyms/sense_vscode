/** @file 命令名称常量和工具函数 */

import * as vscode from 'vscode';

export const tomlPrefix: string = 'sense.toml.';
export const tomlParser: string = `${tomlPrefix}parser`;
export const tomlStringify: string = `${tomlPrefix}stringify`;

/** 在编辑器中打开指定 URI 的文件 */
export async function openFileInEditor(e: vscode.Uri): Promise<void> {
    return vscode.commands.executeCommand('vscode.open', e);
}

/** 关闭当前活动的编辑器 */
export async function closeActiveEditor(): Promise<void> {
    return vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}
