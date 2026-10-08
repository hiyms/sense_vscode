/** @file sense LSP 上下文管理，负责语言客户端生命周期、服务配置与环境变量设置 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';

import {
    LanguageClient,
    LanguageClientOptions,
    ResponseError,
    State as LspState,
    RevealOutputChannelOn,
    ServerOptions,
    StreamInfo,
    Trace,
} from 'vscode-languageclient/node';

import * as lspConstants from '../utils/lspConstants';
import { Utility } from '../utils/utility';
import { OutputHelper } from '../utils/outputHelper';
import { spawnSenseLsp, SenseLspTransport } from './bridge';
import * as middleware from './middleware';
import { activate as activateHealthCheck } from './healthCheck';
import { getStatusBar } from './statusBar';

/**
 * sense 语言客户端，继承自 LanguageClient。
 * 重写请求失败处理、崩溃重启逻辑和日志输出行为。
 */
export class SenseLanguageClient extends LanguageClient {
    static restartCount = 0;
    static restartTimestamps: number[] = [];

    /** 处理失败的 LSP 请求：workspace/executeCommand 失败时弹窗提示错误信息 */
    handleFailedRequest(
        type: any,
        token: any,
        error: any,
        defaultValue: any,
        showNotification?: boolean,
        throwOnCancel?: boolean
    ): any {
        if (error instanceof ResponseError && type.method === 'workspace/executeCommand') {
            vscode.window.showErrorMessage(error.message);
        }
        return super.handleFailedRequest(type, token, error, defaultValue, showNotification, throwOnCancel);
    }

    /** 只把错误写入输出通道，弹窗由状态栏承担 */
    error(message: string, data?: any, _showNotification?: boolean | 'force'): void {
        this.outputChannel.appendLine(`[Error - ${new Date().toLocaleTimeString()}] ${message}`);
        if (data != null) {
            this.outputChannel.appendLine(this.dataToString(data));
        }
    }

    /** 重置重启计数器和时间戳 */
    resetRestartCount(): void {
        SenseLanguageClient.restartCount = 0;
        SenseLanguageClient.restartTimestamps = [];
    }

    /** 处理连接关闭：更新状态，按配置决定是否自动重启 */
    async handleConnectionClosed(): Promise<void> {
        const originalHandler = Object.create(null, {
            handleConnectionClosed: {
                get: () => super.handleConnectionClosed,
            },
        });

        vscode.commands.executeCommand('sense.lsp.updateState', {
            state: lspConstants.State.Error,
        });

        await originalHandler.handleConnectionClosed.call(this);
        await Utility.delay(lspConstants.delay100);

        const autoRestartEnabled = vscode.workspace
            .getConfiguration('sense.lsp')
            .get<boolean>('autoRestart', true);

        if (!autoRestartEnabled) {
            const choice = await vscode.window.showErrorMessage(
                'The sense language server has stopped. Auto-restart is disabled.',
                'Restart Manually'
            );
            if (choice === 'Restart Manually') {
                vscode.commands.executeCommand('sense.lsp.reLaunch', true);
            }
            return;
        }

        const now = Date.now();
        SenseLanguageClient.restartTimestamps = SenseLanguageClient.restartTimestamps
            .filter((t) => now - t < lspConstants.RESTART_WINDOW_MS);
        SenseLanguageClient.restartTimestamps.push(now);

        if (SenseLanguageClient.restartTimestamps.length > lspConstants.MAX_RESTART_COUNT) {
            this.outputChannel.appendLine(
                `The sense language server stopped ${lspConstants.MAX_RESTART_COUNT + 1} times in the last 5 minutes. The server will not be restarted.\n`
            );
            vscode.window.showErrorMessage(
                `The sense language server stopped ${lspConstants.MAX_RESTART_COUNT + 1} times in the last 5 minutes. Auto-restart has been stopped.`
            );
            return;
        }

        this.outputChannel.appendLine(
            `The sense language server stopped, try to restart ${SenseLanguageClient.restartTimestamps.length} times.`
        );

        await Utility.delay(lspConstants.RESTART_DELAY_MS);
        vscode.window.showInformationMessage(
            `sense language server stopped. Attempting auto-restart (${SenseLanguageClient.restartTimestamps.length}/${lspConstants.MAX_RESTART_COUNT})...`
        );
        vscode.commands.executeCommand('sense.lsp.reLaunch', true);
    }

    /** 将错误数据转换为可读字符串 */
    dataToString(data: any): string {
        if (data instanceof ResponseError) {
            const err = data as ResponseError<any>;
            return `  Message: ${err.message}\n  Code: ${err.code} ${err.data ? `'\n'${err.data.toString()}` : ''}`;
        }
        if (data instanceof Error) {
            return typeof data.stack === 'string' ? data.stack : data.message;
        }
        if (typeof data === 'string') {
            return data;
        }
        return String(data);
    }
}

/** 补全能力注册，用于通知服务端支持近光标补全编辑 */
class CompletionCapability implements vscode.Disposable {
    dispose(): void {}
    initialize(): void {}
    fillClientCapabilities(capabilities: any): void {
        if (capabilities.textDocument?.completion) {
            capabilities.textDocument.completion.editsNearCursor = true;
        }
    }
    getState(): { kind: string } {
        return { kind: 'static' };
    }
    clear(): void {}
}

/** 初始化失败处理器：记录错误信息并阻止客户端继续 */
const initializationFailedHandler: (error: any) => boolean = (error: any) => {
    if (Utility.checkIsValid(error) && 'message' in error && SenseContext.clientInstance) {
        SenseContext.clientInstance.error(error.message);
    }
    return false;
};

/**
 * sense LSP 上下文，管理语言客户端、环境变量和服务配置。
 */
export class SenseContext {
    subscriptions: vscode.Disposable[] = [];
    client: SenseLanguageClient | null = null;
    transport: SenseLspTransport | null = null;
    static envInfo: any = {};
    static cwd: string = '';
    static clientInstance: SenseLanguageClient | null = null;

    /** 构建启动 sense lsp 的命令与参数 */
    private buildCommand(executable: string): { command: string; args: string[] } {
        const extraArgs = vscode.workspace
            .getConfiguration('sense.lsp')
            .get<string[]>('arguments') ?? [];

        if (process.platform === 'win32') {
            return { command: executable, args: ['lsp', ...extraArgs] };
        }

        const cangjieHome = Utility.getCangjieHome();
        const sourceSetup = cangjieHome === '' ? '' : `source '${cangjieHome}'/envsetup.sh && `;
        const quotedArgs = ['lsp', ...extraArgs].map((arg) => `'${arg}'`).join(' ');
        return {
            command: '/bin/bash',
            args: ['-c', `${sourceSetup}exec '${executable}' ${quotedArgs}`],
        };
    }

    /** 组装子进程环境变量 */
    private buildEnv(): NodeJS.ProcessEnv {
        const env: NodeJS.ProcessEnv = { ...process.env };
        const cangjieHome = Utility.getCangjieHome();
        if (cangjieHome !== '') {
            env.CANGJIE_HOME = cangjieHome;
        }
        const discovery = vscode.workspace
            .getConfiguration('sense.lsp')
            .get<string>('discovery');
        if (Utility.checkIsValid(discovery)) {
            env.CANGJIE_LSP_DISCOVERY = discovery;
        }
        return env;
    }

    /** 创建子进程并返回语言客户端需要的读写流 */
    private createTransport(extensionContext: vscode.ExtensionContext): StreamInfo {
        const executable = Utility.findSenseExecutable();
        if (executable === '') {
            throw new Error(
                'The sense executable was not found. Set sense.executablePath or add sense to PATH.'
            );
        }

        const projectRoots = Utility.getProjectRoots();
        const cwd = projectRoots.length > 0 ? projectRoots[0] : Utility.getWorkspaceFolders();
        const { command, args } = this.buildCommand(executable);
        const runtimeDir = path.join(extensionContext.globalStorageUri.fsPath, 'lsp');

        this.transport?.dispose();
        this.transport = spawnSenseLsp({
            executable: command,
            args,
            cwd,
            env: this.buildEnv(),
            runtimeDir,
            onStderr: (text) => OutputHelper.appendLine(text.trimEnd(), true),
            onError: (error) => OutputHelper.appendLine(`[sense lsp] ${error.message}`, true),
        });

        return { reader: this.transport.reader, writer: this.transport.writer };
    }

    /** 读取 cjc 版本号，用于状态栏展示 */
    private getSdkVersion(): Promise<string> {
        return new Promise((resolve) => {
            child_process.exec(Utility.getExecCmd('cjc -v'), (error, stdout) => {
                if (error) {
                    resolve('');
                    return;
                }
                const match = stdout.match(/\d+(\.\d+)*/);
                resolve(match ? match[0].toString() : '');
            });
        });
    }

    /** 获取语言服务器跟踪级别 */
    private getTraceLevel(): Trace {
        const value = vscode.workspace
            .getConfiguration('sense')
            .get<string>('trace.server');
        switch (value) {
            case 'messages':
                return Trace.Messages;
            case 'verbose':
                return Trace.Verbose;
            default:
                return Trace.Off;
        }
    }

    /**
     * 依据 sense.trace.server 重新设置语言客户端的跟踪级别
     *
     * 库内会在配置变化时按输出通道日志级别重算跟踪开关，这里主动重设
     * 以保持与配置一致。
     */
    async applyTraceSetting(): Promise<void> {
        if (!this.client) return;
        await this.client.setTrace(this.getTraceLevel());
    }

    /**
     * 激活 LSP 客户端：创建客户端并启动。
     * 状态流转：Stopped -> Starting -> Running。
     */
    async activate(extensionContext: vscode.ExtensionContext): Promise<void> {
        SenseContext.cwd = extensionContext.extensionPath;
        SenseContext.envInfo.sdkVersion = await this.getSdkVersion();
        SenseContext.envInfo.serverVersion = SenseContext.envInfo.sdkVersion;

        const executable = Utility.findSenseExecutable();
        if (executable === '') {
            OutputHelper.appendLine(
                '[activate] sense executable not found, set sense.executablePath or add it to PATH',
                true
            );
        } else if (!Utility.isValidSdk()) {
            OutputHelper.appendLine(
                '[activate] the Cangjie SDK path is not configured properly. Set sense.sdkPath or CANGJIE_HOME.',
                true
            );
        }

        const serverOptions: ServerOptions = () => Promise.resolve(this.createTransport(extensionContext));

        const projectRoots = Utility.getProjectRoots();
        const primaryRoot = projectRoots.length > 0 ? projectRoots[0] : '';

        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ scheme: 'file', language: lspConstants.cangjieLanguageId }],
            workspaceFolder: primaryRoot === '' ? undefined : {
                uri: vscode.Uri.file(primaryRoot),
                name: path.basename(primaryRoot),
                index: 0,
            },
            progressOnInitialization: true,
            outputChannel: OutputHelper.getChannel(),
            traceOutputChannel: OutputHelper.getTraceChannel(),
            revealOutputChannelOn: RevealOutputChannelOn.Never,
            initializationOptions: {},
            synchronize: {
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*', false, true, false),
            },
            initializationFailedHandler,
            middleware: {
                didOpen: middleware.didOpenMidware,
                provideDocumentLinks: middleware.documentLinkMidware,
                provideDefinition: middleware.definitionMidware,
                provideCodeLenses: middleware.codeLensMidware,
                provideCompletionItem: middleware.completionMidware,
            },
        };

        if (!this.client) {
            this.client = new SenseLanguageClient(
                'sense',
                'sense Language Server',
                serverOptions,
                clientOptions
            );
            this.client.clientOptions.errorHandler = this.client.createDefaultErrorHandler(0);
            this.client.registerFeature(new CompletionCapability() as any);

            activateHealthCheck(this);

            vscode.commands.executeCommand('sense.lsp.updateState', {
                state: lspConstants.State.Stopped,
                serverVersion: SenseContext.envInfo.serverVersion,
            });
        }

        SenseContext.clientInstance = this.client;

        vscode.commands.executeCommand('sense.lsp.updateState', {
            state: lspConstants.State.Starting,
            serverVersion: SenseContext.envInfo.serverVersion,
        });

        try {
            await this.client.start();
            if (this.client.isRunning()) {
                await this.client.setTrace(this.getTraceLevel());
                vscode.commands.executeCommand('sense.lsp.updateState', {
                    state: lspConstants.State.Running,
                    serverVersion: SenseContext.envInfo.serverVersion,
                });
            }
            Utility.serverRun = true;
        } catch (e: any) {
            vscode.commands.executeCommand('sense.lsp.updateState', {
                state: lspConstants.State.Stopped,
            });
            SenseContext.clientInstance = null;
            this.transport?.dispose();
            this.transport = null;
            const errorMessage = e?.message ? e.message : String(e);
            OutputHelper.appendLine(`[activate] sense language server failed to start: ${errorMessage}`, true);
            OutputHelper.show();
            vscode.window.showErrorMessage(`sense language server failed to start: ${errorMessage}`);
        }
    }

    /** 释放上下文：更新状态、销毁订阅、停止并清理客户端 */
    async dispose(): Promise<void> {
        vscode.commands.executeCommand('sense.lsp.updateState', {
            state: lspConstants.State.Stopped,
        });

        this.subscriptions.forEach((d) => d.dispose());
        this.subscriptions = [];

        if (this.client) {
            try {
                await this.client.stop();
            } catch {
                // 释放阶段的错误忽略
            }
            this.client = null;
        }

        SenseContext.clientInstance = null;
        this.transport?.dispose();
        this.transport = null;
    }

    /** 获取 LSP 运行状态：客户端存在且为 Running 状态时返回 true */
    getLspState(): boolean {
        return Utility.checkIsValid(this.client) && this.client!.state === LspState.Running;
    }

    /** 停止 LSP 服务：释放客户端与子进程资源 */
    stopLspServer(): void {
        this.client?.dispose();
        this.client = null;
        SenseContext.clientInstance = null;
        this.transport?.dispose();
        this.transport = null;
    }
}

/** 全局单例的 LSP 上下文实例 */
export const context = new SenseContext();
