/** @file cjlint 代码检查 Webview，支持手动触发代码检查、结果显示和文件跳转 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { Utility } from '../utils/utility';
import { OutputHelper } from '../utils/outputHelper';
import { Webview } from '../views/webview';

/** cjlint 忽略配置文件名 */
const CJLINT_CONFIG_NAME = 'cjlintignore.cfg';

/** cjlint 问题项结构 */
interface CjlintIssue {
    description: string;
    file: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    defectLevel: string;
    defectType: string;
}

/** cjlint 代码检查 Webview，提供手动检查、自动修复和结果页面展示功能 */
export class CjlintWebview extends Webview {
    private _context: vscode.ExtensionContext;
    private disposable: vscode.Disposable;
    private disposableFolder: vscode.Disposable;
    private messageListener: vscode.Disposable | undefined;
    private messageListenerPanel: vscode.WebviewPanel | null = null;

    constructor(context: vscode.ExtensionContext) {
        super();
        this._context = context;
        this.disposable = vscode.Disposable.from(
            vscode.commands.registerCommand("sense.codeCheck", (_e: any, silent: boolean = false, autoFix: boolean = true): void => {
                this.init(silent, autoFix);
            })
        );
        this.disposableFolder = vscode.Disposable.from(
            vscode.commands.registerCommand("sense.codeCheckFolder", (_e: any, silent: boolean = false, autoFix: boolean = true): void => {
                this.init(silent, autoFix);
            })
        );
    }

    /** 删除 cjlint 生成的报告文件和中间产物 */
    static deleteFiles(dir: string): void {
        const reportJson = path.join(dir, "./report.json");
        const defaultCHIRDebug = path.join(dir, "./default_CHIRDebug");
        const pageCHIRDebug = path.join(dir, "./page_CHIRDebug");

        if (reportJson.indexOf("..") < 0 && fs.existsSync(reportJson)) {
            fs.rm(reportJson, () => { });
        }
        if (defaultCHIRDebug.indexOf("..") < 0 && fs.existsSync(defaultCHIRDebug)) {
            fs.rm(defaultCHIRDebug, () => { });
        }
        if (pageCHIRDebug.indexOf("..") < 0 && fs.existsSync(pageCHIRDebug)) {
            fs.rm(pageCHIRDebug, () => { });
        }
    }

    /** 打开文件并跳转到指定行列位置 */
    static async goFileLocation(filePath: string, line: number, column: number): Promise<void> {
        if (fs.existsSync(filePath)) {
            const document = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(document, 1, false);
            const doc = editor.document;
            const startChar = doc.lineAt(line).range.start.character;
            const endChar = doc.lineAt(line).range.end.character;
            const range = new vscode.Range(line, startChar, line, endChar);
            editor.revealRange(range, 1);
            editor.selection = new vscode.Selection(
                new vscode.Position(line, column),
                new vscode.Position(line, column)
            );
        } else {
            OutputHelper.appendLine(`${filePath} not found`);
        }
    }

    dispose(): void {
        this.disposable.dispose();
        this.disposableFolder.dispose();
        this.messageListener?.dispose();
    }

    /** 初始化代码检查流程：执行 cjlint 命令，解析报告结果并展示 */
    init(silent: boolean = false, autoFix: boolean = true): void {
        if (process.platform !== "linux" && process.platform !== "win32" && process.platform !== "darwin") {
            vscode.window.showInformationMessage("This command applies only to Linux, Windows and Mac.");
            return;
        }

        const workspaceFolder = Utility.getWorkspaceFolders();
        if (workspaceFolder === '') {
            vscode.window.showErrorMessage("Open a project folder before running cjlint.");
            return;
        }

        let targetPath = path.join(workspaceFolder, "src");
        if (!fs.existsSync(targetPath)) {
            targetPath = workspaceFolder;
        }

        if (!silent) {
            OutputHelper.appendLine(`cjlint starts checking "${targetPath}" `);
        }

        if (targetPath.indexOf("..") >= 0) {
            vscode.window.showErrorMessage("the target path is invaild!");
            return;
        }

        CjlintWebview.deleteFiles(targetPath);

        let command = `cjlint -f '${targetPath}' -o ./report`;
        if (process.platform === "win32") {
            command = `cjlint -f "${targetPath}" -o ./report`;
        }

        const configPath = path.join(workspaceFolder, CJLINT_CONFIG_NAME);
        if (fs.existsSync(configPath) === true) {
            command = `${command} -e ${path.relative(targetPath, configPath)}`;
        }

        const reportPath = path.join(targetPath, "./report.json");
        cp.exec(Utility.getExecCmd(command), { cwd: targetPath, encoding: "binary" }, (error, _stdout, stderr) => {
            if (error !== null || !fs.existsSync(reportPath)) {
                const detail = Utility.checkIsValid(stderr)
                    ? Utility.translateMessage(stderr)
                    : (error?.message ?? "no cjlint report was produced");
                if (!silent) {
                    OutputHelper.appendLine(`cjlint check failed: ${detail}`);
                }
                this.closePanel();
                CjlintWebview.deleteFiles(targetPath);
                return;
            }

            const data = fs.readFileSync(reportPath, "utf-8");
            let result: CjlintIssue[];
            try {
                result = JSON.parse(data);
            } catch (e: any) {
                OutputHelper.appendLine(`cjlint report cannot be parsed: ${e?.message ?? e}`);
                CjlintWebview.deleteFiles(targetPath);
                return;
            }

            CjlintWebview.deleteFiles(targetPath);
            vscode.commands.executeCommand("sense.codecheck.diagnostic", result);

            if (data === "null" || data === "[\r\n]" || result.length <= 0) {
                if (!silent) {
                    OutputHelper.appendLine("The cjlint check is done, there are no out-of-spec issues.\n");
                }
                this.closePanel();
                return;
            }

            if (autoFix) {
                this.generateWebview(result, silent);
            }
        });
    }

    /** 生成检查结果 Webview 页面，包含文件跳转消息监听 */
    generateWebview(result: CjlintIssue[], silent: boolean): void {
        super.newPanel("cjlintWebview", "codecheck");

        // 面板复用时不重复注册消息监听
        if (this.messageListenerPanel !== this.panel) {
            this.messageListener?.dispose();
            this.messageListener = this.panel!.webview.onDidReceiveMessage((message: any) => {
                CjlintWebview.goFileLocation(message.fileName, message.line - 1, message.column - 1);
            });
            this.messageListenerPanel = this.panel;
        }

        let jsonStr = JSON.stringify(result, ["description", "file", "line", "column", "endLine", "endColumn", "defectLevel", "defectType"]);
        jsonStr = jsonStr.replace(/\\/g, "\\\\");
        this.panel!.webview.postMessage(JSON.parse(jsonStr));

        this.resultPage();

        if (!silent) {
            OutputHelper.appendLine("cjlint check completed\n");
        }
    }

    /** 展示检查结果页面 */
    resultPage(): void {
        this.panel!.webview.html = this.html("html/contentHtml.html");
    }

    /** 读取 HTML 模板并替换 cjlint JS 资源 URI */
    html(filePath: string): string {
        const { extensionPath } = this._context;
        const fullPath = path.join(extensionPath, filePath);
        let content = fs.readFileSync(fullPath, "utf-8");
        const cjlintJsUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(path.join(extensionPath, "media", "CjlintResult.js"))
        );
        content = content.replace(/{{cjlint_js_uri}}/g, cjlintJsUri.toString());
        return content;
    }
}
