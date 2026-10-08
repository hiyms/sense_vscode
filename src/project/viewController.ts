/** @file 项目创建 WebView 视图控制器，管理图形化创建面板与消息交互 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Utility } from '../utils/utility';
import { CreateProjectUtils } from './createProjectUtils';

/**
 * WebView 图形化项目创建控制器，管理创建面板的初始化与消息处理
 */
export class ViewController implements vscode.Disposable {
    private context: vscode.ExtensionContext;
    private disposable: vscode.Disposable;

    /**
     * 注册 "sense.project.create.view" 命令
     * @param context - VS Code 扩展上下文
     */
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.disposable = vscode.Disposable.from(
            vscode.commands.registerCommand('sense.project.create.view', () => {
                if (
                    process.platform === 'linux' ||
                    process.platform === 'win32' ||
                    process.platform === 'darwin'
                ) {
                    this.init(context.extensionPath);
                } else {
                    vscode.window.showInformationMessage(
                        'This command applies only to Linux, Windows and Mac.'
                    );
                }
            })
        );
    }

    /** 销毁命令注册 */
    dispose(): void {
        this.disposable.dispose();
    }

    /** 初始化 WebView 面板，加载 HTML 并设置消息监听 */
    private init(extensionPath: string): void {
        if (Utility.checkIsValid(CreateProjectUtils.panel)) {
            const viewColumn = Utility.checkIsValid(vscode.window.activeTextEditor)
                ? vscode.window.activeTextEditor!.viewColumn
                : undefined;
            CreateProjectUtils.panel!.reveal(viewColumn);
            return;
        }

        CreateProjectUtils.panel = vscode.window.createWebviewPanel(
            'senseWebview',
            'CreateNewSenseProject',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        CreateProjectUtils.panel.webview.onDidReceiveMessage((message: any) => {
            switch (message.command) {
                case 'selectPath':
                    CreateProjectUtils.selectPath().then((selectedPath) => {
                        if (Utility.checkIsValid(selectedPath)) {
                            CreateProjectUtils.panel!.webview.postMessage({
                                command: 'showPath',
                                text: selectedPath,
                            });
                        }
                    });
                    break;
                case 'cancelSetting':
                    CreateProjectUtils.closePanel();
                    break;
                case 'finishSetting':
                    this.finishSetting(message, CreateProjectUtils.panel!);
                    break;
                default:
                    break;
            }
        });

        CreateProjectUtils.panel.onDidDispose(CreateProjectUtils.closePanel);

        const htmlPath = path.join(extensionPath, 'html', 'createProject.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        const jsUri = CreateProjectUtils.panel.webview.asWebviewUri(
            vscode.Uri.file(
                path.join(extensionPath, 'media', 'createProject', 'createSetting.js')
            )
        );
        const cssUri = CreateProjectUtils.panel.webview.asWebviewUri(
            vscode.Uri.file(
                path.join(extensionPath, 'media', 'createProject', 'createSetting.css')
            )
        );

        htmlContent = htmlContent.replace(/{{creat_js_uri}}/g, jsUri.toString());
        htmlContent = htmlContent.replace(/{{creat_css_uri}}/g, cssUri.toString());

        CreateProjectUtils.panel.webview.html = htmlContent;
    }

    /** 处理 WebView 提交的创建参数，校验项目名称后执行创建 */
    private finishSetting(message: any, panel: vscode.WebviewPanel): void {
        const { projectDir, projectName, outputType } = message;
        const existingFolders = Utility.getBasePathAllFolders(projectDir);

        if (existingFolders.includes(projectName)) {
            panel.webview.postMessage({
                command: 'repeatsName',
                text: true,
            });
        } else {
            CreateProjectUtils.createProject(outputType, projectDir, projectName);
        }
    }
}
