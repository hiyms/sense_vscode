/** @file 代码覆盖率检测 Webview，执行 sense 测试与 cjcov 生成覆盖率报告 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as util from 'util';
import { Utility } from '../utils/utility';
import { OutputHelper } from '../utils/outputHelper';
import { Webview } from '../views/webview';
import { SenseCli } from '../build/senseCli';

/** 覆盖率报告目录名，位于工作区根目录 */
const REPORT_DIR = 'output';

/** 覆盖率报告首页 */
const REPORT_INDEX = 'index.html';

/** 代码覆盖率 Webview，提供覆盖率检测、报告生成和查看功能 */
export class CjcovWebview extends Webview {
    private disposable: vscode.Disposable;
    private disposableFolder: vscode.Disposable;
    private messageListener: vscode.Disposable | undefined;
    private messageListenerPanel: vscode.WebviewPanel | null = null;
    private running = false;

    constructor() {
        super();
        this.disposable = vscode.Disposable.from(
            vscode.commands.registerCommand("sense.coverage", (e: any) => {
                void this.init(e);
            })
        );
        this.disposableFolder = vscode.Disposable.from(
            vscode.commands.registerCommand("sense.coverageFolder", (e: any) => {
                void this.init(e);
            })
        );
    }

    /** 读取 HTML 文件并注入 VS Code webview 脚本，实现链接点击消息传递 */
    static html(htmlFileName: string): string {
        const workspaceFolder = Utility.getWorkspaceFolders();
        if (workspaceFolder === '') {
            throw new Error('Open a project folder before opening a coverage report.');
        }
        const filePath = path.join(workspaceFolder, REPORT_DIR, htmlFileName);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Coverage report file not found: ${filePath}`);
        }
        let content = fs.readFileSync(filePath, "utf-8");
        content = content.replace(/(?<id><\/html>)/g, (match: string) => {
            return `
    <script>
    const vscode = acquireVsCodeApi();
    let elementA = document.getElementsByTagName('a');
    for (let a of elementA) {
      a.addEventListener('click', function () {
        vscode.postMessage({
          path: a.title
        });
      });
    }
    <\/script>
` + match;
        });
        return content;
    }

    dispose(): void {
        this.disposable.dispose();
        this.disposableFolder.dispose();
        this.messageListener?.dispose();
    }

    /** 初始化覆盖率检测流程：更新依赖、运行带覆盖率的测试、生成并展示报告 */
    async init(context: any): Promise<void> {
        if (process.platform !== "linux" && process.platform !== "win32" && process.platform !== "darwin") {
            vscode.window.showInformationMessage("This command applies only to Linux, Windows and Mac.");
            return;
        }

        const workspaceFolder = Utility.getWorkspaceFolders();
        if (workspaceFolder === '') {
            vscode.window.showErrorMessage("Open a project folder before running coverage.");
            return;
        }

        if (this.running) {
            OutputHelper.appendLine("coverage is already running, this request was skipped.", true);
            return;
        }
        this.running = true;

        const scanDir = CjcovWebview.resolveScanDir(context, workspaceFolder);

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'sense coverage: running tests with coverage',
                    cancellable: false,
                },
                async () => {
                    if (!(await this.run(SenseCli.updateCommand(), workspaceFolder))) {
                        throw new Error('sense update failed');
                    }
                    if (!(await this.run(SenseCli.testCommand({ coverage: true }), workspaceFolder))) {
                        throw new Error('sense test --coverage failed');
                    }
                    const cjcov = `cjcov -o ${REPORT_DIR} --html-details -i ${SenseCli.quote(scanDir)}`;
                    if (!(await this.run(cjcov, workspaceFolder))) {
                        throw new Error('cjcov failed');
                    }
                }
            );

            super.newPanel("cjcovWebview", REPORT_INDEX);
            this.attachMessageListener();
            this.panel!.webview.html = CjcovWebview.html(`./${REPORT_INDEX}`);
        } catch (e: any) {
            OutputHelper.appendLine(`coverage failed: ${e?.message ?? e}`, true);
            OutputHelper.show();
            vscode.window.showErrorMessage(`sense coverage failed: ${e?.message ?? e}`);
        } finally {
            this.running = false;
        }
    }

    /** 覆盖率数据所在目录：右键路径为文件时取其所在目录，缺失时退化为工作区根目录 */
    private static resolveScanDir(context: any, workspaceFolder: string): string {
        const target = Utility.rightClickPath(context);
        if (target === '') return workspaceFolder;
        try {
            return fs.statSync(target).isDirectory() ? target : path.dirname(target);
        } catch {
            return workspaceFolder;
        }
    }

    /** 面板被替换时重新注册消息监听，复用同一面板时不重复注册 */
    private attachMessageListener(): void {
        if (this.messageListenerPanel === this.panel) return;
        this.messageListener?.dispose();
        this.messageListener = this.panel!.webview.onDidReceiveMessage((message: any) => {
            try {
                super.newPanel("cjcovhtml", message.path);
                this.attachMessageListener();
                this.panel!.webview.html = CjcovWebview.html(message.path);
            } catch (e: any) {
                OutputHelper.appendLine(`coverage report cannot be shown: ${e?.message ?? e}`);
            }
        });
        this.messageListenerPanel = this.panel;
    }

    /** 执行 shell 命令并返回执行结果 */
    private async run(command: string, cwd: string): Promise<boolean> {
        const exec = util.promisify(cp.exec);
        try {
            const { stdout } = await exec(
                Utility.getExecCmd(command),
                { cwd, encoding: "binary" }
            );
            OutputHelper.appendLine(stdout);
            return true;
        } catch (error: any) {
            const detail = error?.stderr ?? error?.message ?? 'unknown error';
            OutputHelper.appendLine(`coverage command failed: ${Utility.translateMessage(String(detail))}`, true);
            return false;
        }
    }
}
