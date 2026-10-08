/** @file 主激活入口，注册全部扩展功能：项目管理、格式化、静态检查、构建与文件监听 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import { Utility } from '../utils/utility';
import { checkIsValid } from '../utils/commons';
import { stringify as tomlStringify } from '../utils/toml';
import { ProjectController } from '../project/controller';
import { ViewController } from '../project/viewController';
import { CjFormat } from '../format/cjFormat';
import { CjlintWebview } from '../lint/cjlintWebview';
import { CjlintDiagnostic } from '../lint/cjlintDiagnostic';
import { CjlintOnSave } from '../lint/cjlintOnSave';
import { CjcovWebview } from '../lint/cjcovWebview';
import { LibTreeView } from '../views/libTreeView';
import { TerminalHelper } from '../build/terminalHelper';
import { registerSenseCommands, refreshRunState } from '../build/senseCommands';

/** 注册 toml 解析与序列化命令 */
function registerTomlUtilImpl(): void {
    Utility.tomlRegister = true;
    vscode.commands.registerCommand('sense.toml.parser', (filePath: string = '') =>
        Utility.getTomlContent(filePath)
    );
    vscode.commands.registerCommand('sense.toml.stringify', (obj: any) => tomlStringify(obj));
}

/** 注册 toml 工具命令到 VS Code（供外部调用） */
export function registerTomlUtil(): void {
    registerTomlUtilImpl();
}

/**
 * 扩展主激活函数：注册项目管理、格式化、构建、静态检查与文件监听。
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    if (!Utility.tomlRegister) {
        registerTomlUtilImpl();
    }

    Utility.removeSdkAttributes();

    // 项目管理
    context.subscriptions.push(new ProjectController(context));
    context.subscriptions.push(new ViewController(context));

    // 格式化命令与 VS Code 格式化提供器
    context.subscriptions.push(
        vscode.commands.registerCommand('sense.format', async (uri: vscode.Uri) => {
            await CjFormat.formatFunc(uri);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('sense.formatFolder', async (uri: vscode.Uri) => {
            await CjFormat.formatFunc(uri);
        })
    );
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('Cangjie', {
            provideDocumentFormattingEdits: (
                document: vscode.TextDocument,
                _options: vscode.FormattingOptions,
                token: vscode.CancellationToken
            ) => CjFormat.provideDocumentFormattingEdits(document, token)
        })
    );
    context.subscriptions.push(
        vscode.languages.registerDocumentRangeFormattingEditProvider('Cangjie', {
            provideDocumentRangeFormattingEdits: (
                document: vscode.TextDocument,
                range: vscode.Range,
                _options: vscode.FormattingOptions,
                token: vscode.CancellationToken
            ) => CjFormat.provideDocumentRangeFormattingEdits(document, range, token)
        })
    );

    // sense 命令集合
    registerSenseCommands(context);
    TerminalHelper.register(context);

    // 依赖树视图
    LibTreeView._instance = new LibTreeView(context);

    // 静态检查与覆盖率
    context.subscriptions.push(new CjlintWebview(context));
    context.subscriptions.push(new CjcovWebview());
    context.subscriptions.push(
        vscode.commands.registerCommand('sense.codecheck.diagnostic', (result: any) => {
            if (!checkIsValid(CjlintDiagnostic._instance)) {
                CjlintDiagnostic._instance = new CjlintDiagnostic();
            }
            CjlintDiagnostic._instance!.handleCjlintResult(result);
        })
    );
    context.subscriptions.push(CjlintOnSave.registerCodecheckOnSave());
    // 终端环境与配置变化
    if (Utility.isCangjieProject()) {
        await Utility.configTerminalEnv();
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration('sense.sdkPath') || e.affectsConfiguration('sense.executablePath')) {
                void Utility.configTerminalEnv();
            }
            if (e.affectsConfiguration('sense.codeCheck')) {
                CjlintOnSave.mkdirCjlintIgnoreCfg();
            }
        })
    );

    // 监听 sense.toml 变更，刷新依赖树
    const watcher = vscode.workspace.createFileSystemWatcher('**/sense.toml');
    context.subscriptions.push(watcher);
    const onManifestChanged = () => {
        Utility.refreshManifestRoots();
        LibTreeView._instance?.refresh();
        refreshRunState();
    };
    context.subscriptions.push(watcher.onDidChange(onManifestChanged));
    context.subscriptions.push(watcher.onDidCreate(onManifestChanged));
    context.subscriptions.push(watcher.onDidDelete(onManifestChanged));

    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            Utility.refreshManifestRoots();
            LibTreeView._instance?.refresh();
            refreshRunState();
        })
    );
}

/** 注册 Windows 平台文件监听：检测超长路径的创建和重命名操作 */
export function registerFileWatcher(context: vscode.ExtensionContext): void {
    if (os.platform() !== 'win32') return;

    context.subscriptions.push(
        vscode.workspace.onDidCreateFiles((e: vscode.FileCreateEvent) => {
            for (const file of e.files) {
                const filePath = file.fsPath;
                if (filePath.length < 260) continue;
                vscode.window.showErrorMessage(
                    'The name for the file or folder is too long. Please choose a different name.'
                );
                if (fs.lstatSync(filePath).isDirectory()) {
                    fs.rmdirSync(filePath);
                } else {
                    vscode.workspace.fs.delete(file, { useTrash: false });
                }
                break;
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles((e: vscode.FileRenameEvent) => {
            for (const file of e.files) {
                const filePath = file.newUri.fsPath;
                if (filePath.length >= 260) {
                    vscode.window.showErrorMessage(
                        'The name for the file or folder is too long. Please choose a different name.'
                    );
                    vscode.workspace.fs.rename(file.newUri, file.oldUri, { overwrite: true });
                    break;
                }
                if (fs.lstatSync(filePath).isDirectory() && !Utility.checkPathLength(filePath)) {
                    vscode.window.showErrorMessage(
                        'The name for the file or folder is too long. Please choose a different name.'
                    );
                    vscode.workspace.fs.rename(file.newUri, file.oldUri, { overwrite: true });
                    break;
                }
            }
        })
    );
}

/** 扩展停用时的清理函数 */
export function deactivate(): void {}
