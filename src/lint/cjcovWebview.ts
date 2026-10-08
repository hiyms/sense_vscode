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

/** cjcov 生成覆盖率报告的命令前缀，右键路径会追加到末尾 */
const CJCOV_COMMAND = 'cjcov -o output --html-details -i ';

/** 代码覆盖率 Webview，提供覆盖率检测、报告生成和查看功能 */
export class CjcovWebview extends Webview {
    private panelArray: vscode.WebviewPanel[] = [];
    private disposable: vscode.Disposable;
    private disposableFolder: vscode.Disposable;

    constructor() {
        super();
        this.disposable = vscode.Disposable.from(
            vscode.commands.registerCommand("sense.coverage", (e: any) => {
                this.init(e);
            })
        );
        this.disposableFolder = vscode.Disposable.from(
            vscode.commands.registerCommand("sense.coverageFolder", (e: any) => {
                this.init(e);
            })
        );
    }

    /** 读取 HTML 文件并注入 VS Code webview 脚本，实现链接点击消息传递 */
    static html(htmlFileName: string): string {
        const filePath = path.join(Utility.getWorkspaceFolders(), "output", htmlFileName);
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
    }

    /** 初始化覆盖率检测流程：更新依赖、运行带覆盖率的测试、生成并展示报告 */
    async init(context: any): Promise<void> {
        if (process.platform !== "linux" && process.platform !== "win32" && process.platform !== "darwin") {
            vscode.window.showInformationMessage("This command applies only to Linux, Windows and Mac.");
            return;
        }

        if (this.panelArray.length > 0) {
            for (const panel of this.panelArray) {
                panel.dispose();
            }
            this.panelArray.length = 0;
        }

        const rightClickPath = Utility.rightClickPath(context);
        const workspaceFolders = Utility.getWorkspaceFolders();

        if (!(await this.execfunc(SenseCli.updateCommand(), workspaceFolders))) return;
        if (!(await this.execfunc(SenseCli.testCommand({ coverage: true }), workspaceFolders))) return;

        const success = await this.execfunc(CJCOV_COMMAND, workspaceFolders, rightClickPath);
        if (success) {
            super.newPanel("cjcovWebview", "index.html");
            this.panel.webview.html = CjcovWebview.html("./index.html");
            this.panelArray.push(this.panel);

            this.panel.webview.onDidReceiveMessage((message: any) => {
                super.newPanel("cjcovhtml", message.path);
                this.panel.webview.html = CjcovWebview.html(message.path);
                this.panelArray.push(this.panel);
            });
        }
    }

    /** 执行 shell 命令并返回执行结果 */
    private async execfunc(command: string, cwd: string, pathArg?: string): Promise<boolean> {
        let fullCommand = command;
        if (pathArg !== undefined) {
            fullCommand += pathArg;
        }

        const exec = util.promisify(cp.exec);
        try {
            const { stdout, stderr } = await exec(
                Utility.getExecCmd(fullCommand),
                { cwd, encoding: "binary" }
            );
            OutputHelper.appendLine(stdout);
            return true;
        } catch (error: any) {
            OutputHelper.appendLine(Utility.translateMessage(error.stderr));
            return false;
        }
    }
}
