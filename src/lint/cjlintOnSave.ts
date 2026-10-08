/** @file 保存 .cj 文件时自动触发 cjlint 代码检查 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Utility } from '../utils/utility';
import { OutputHelper } from '../utils/outputHelper';

/** cjlint 忽略配置文件名 */
const CJLINT_CONFIG_NAME = 'cjlintignore.cfg';

/** 保存时自动代码检查管理类 */
export class CjlintOnSave {
    /** 读取 sense.codeCheck.onSave 开关配置 */
    private static isEnabled(): boolean {
        return vscode.workspace.getConfiguration('sense').get<boolean>('codeCheck.onSave') === true;
    }

    /** 注册保存时代码检查：保存 .cj 文件时触发 workspace 代码检查命令 */
    static registerCodecheckOnSave(): vscode.Disposable {
        CjlintOnSave.mkdirCjlintIgnoreCfg();

        return vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
            if (!CjlintOnSave.isEnabled() || !document.fileName.endsWith('.cj')) {
                return;
            }
            vscode.commands.executeCommand('sense.codeCheckFolder', document.uri, true, false);
        });
    }

    /** 在工程根目录创建 cjlint 忽略配置文件（如不存在） */
    static mkdirCjlintIgnoreCfg(): void {
        if (!CjlintOnSave.isEnabled()) {
            return;
        }
        const workspaceFolder = Utility.getWorkspaceFolders();
        if (workspaceFolder === '') {
            return;
        }
        const configPath = path.join(workspaceFolder, CJLINT_CONFIG_NAME);
        if (fs.existsSync(configPath)) {
            return;
        }
        try {
            fs.writeFileSync(configPath, '');
        } catch (e) {
            OutputHelper.appendLine(String(e));
        }
    }
}
