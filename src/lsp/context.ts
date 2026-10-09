/** @file sense LSP 上下文管理，负责语言客户端的生命周期、服务配置与环境变量设置 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';

import {
    CloseAction,
    ErrorAction,
    ErrorHandler,
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
import { createProgressMessageStrategy, getProgressTracker } from './progress';

/**
 * sense 语言客户端。
 *
 * 只负责请求失败处理、日志输出与把连接关闭事件上报给生命周期拥有者。
 * 是否重启、何时重启由 {@link SenseContext} 决定。
 */
export class SenseLanguageClient extends LanguageClient {
    /** 连接关闭时通知生命周期拥有者 */
    onClosed?: (client: SenseLanguageClient) => void;

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

    /** 处理连接关闭：交给拥有者判定是否需要重启 */
    async handleConnectionClosed(): Promise<void> {
        const originalHandler = Object.create(null, {
            handleConnectionClosed: {
                get: () => super.handleConnectionClosed,
            },
        });

        await originalHandler.handleConnectionClosed.call(this);
        this.onClosed?.(this);
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
    if (Utility.checkIsValid(error) && 'message' in error) {
        context.client?.error(error.message);
    }
    return false;
};

/**
 * 错误处理器：连接关闭交由本扩展处理，避免库同时给出一条
 * “will not be restarted”的相反提示。
 */
const senseErrorHandler: ErrorHandler = {
    error: () => ({ action: ErrorAction.Continue }),
    closed: () => ({
        action: CloseAction.DoNotRestart,
        handled: true,
        message: 'sense language server connection closed',
    }),
};

/** 单次启动的等待上限，避免队列被卡死的 initialize 永久阻塞 */
const START_TIMEOUT_MS = 45000;

/**
 * sense LSP 上下文。
 *
 * 单例地拥有语言客户端与子进程传输，并对全部启动、重启、停止入口做串行化。
 * 只有当前客户端在非主动关闭的情况下断开，才会安排自动重启。
 */
export class SenseContext implements vscode.Disposable {
    subscriptions: vscode.Disposable[] = [];
    client: SenseLanguageClient | null = null;
    static envInfo: any = {};
    static cwd: string = '';

    private transport: SenseLspTransport | null = null;
    private extensionContext: vscode.ExtensionContext | undefined;
    /** 生命周期操作队列 */
    private queue: Promise<void> = Promise.resolve();
    private disposingCurrent = false;
    private stoppedByUser = false;
    private consecutiveFailures = 0;
    private runningSince = 0;
    private restartTimer: NodeJS.Timeout | undefined;

    // ── 启动参数 ────────────────────────────────────────────────────

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
        let env: NodeJS.ProcessEnv = { ...process.env };
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
        const runtimeEnv = vscode.workspace
            .getConfiguration('sense.lsp')
            .get<Record<string, unknown>>('runtimeEnv') ?? {};
        env = SenseContext.applyRuntimeEnv(env, runtimeEnv);
        return env;
    }

    /**
     * 把 sense.lsp.runtimeEnv 的取值合并进子进程环境
     *
     * 空字符串表示从子进程环境里移除该变量，非字符串取值忽略。
     */
    static applyRuntimeEnv(
        base: NodeJS.ProcessEnv,
        overrides: Record<string, unknown>
    ): NodeJS.ProcessEnv {
        const env: NodeJS.ProcessEnv = { ...base };
        for (const name of Object.keys(overrides ?? {})) {
            const value = overrides[name];
            if (typeof value !== 'string') continue;
            if (value === '') {
                delete env[name];
            } else {
                env[name] = value;
            }
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

        this.releaseTransport();
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

    /** 依据 sense.trace.server 重新设置语言客户端的跟踪级别 */
    async applyTraceSetting(): Promise<void> {
        if (!this.client) return;
        await this.client.setTrace(this.getTraceLevel());
    }

    // ── 生命周期 ────────────────────────────────────────────────────

    /**
     * 激活入口：记录扩展上下文并确保语言服务在运行
     *
     * 可重复调用。用户主动停止过之后不再自动拉起，需要显式的重启命令。
     */
    async activate(extensionContext: vscode.ExtensionContext): Promise<void> {
        this.extensionContext = extensionContext;
        if (this.stoppedByUser) return;
        await this.start();
    }

    /** 确保语言服务在运行；用户主动停止期间不做任何事 */
    async start(): Promise<void> {
        await this.runExclusive(async () => {
            if (this.stoppedByUser) return;
            await this.startIfNeeded();
        });
    }

    /**
     * 重启：先完整释放当前客户端，再启动
     *
     * 与启动、停止、释放一起排在同一条队列里，不会与其它入口交错。
     */
    async restart(): Promise<void> {
        await this.runExclusive(async () => {
            this.stoppedByUser = false;
            this.clearRestartTimer();
            await this.releaseCurrent();
            await this.startIfNeeded();
        });
    }

    /** 用户主动停止，抑制自动重启 */
    async stopByUser(): Promise<void> {
        await this.runExclusive(async () => {
            this.stoppedByUser = true;
            this.clearRestartTimer();
            this.consecutiveFailures = 0;
            await this.releaseCurrent();
        });
    }

    /**
     * 把所有生命周期操作串行化
     *
     * 启动、重启、停止、释放共用一条队列，避免一个操作在等待期间被另一个
     * 操作插入，导致释放掉刚建立的客户端或丢掉一次重启。
     */
    private runExclusive<T>(task: () => Promise<T>): Promise<T> {
        const result = this.queue.then(task, task);
        this.queue = result.then(() => undefined, () => undefined);
        return result;
    }

    /** 在队列内启动语言服务 */
    private async startIfNeeded(): Promise<void> {
        if (Utility.checkIsValid(this.client) && this.client!.state === LspState.Running) return;
        await this.startClient();
    }

    /** 扩展释放 */
    async dispose(): Promise<void> {
        await this.runExclusive(async () => {
            this.stoppedByUser = true;
            this.clearRestartTimer();
            await this.releaseCurrent();
        });
        this.subscriptions.forEach((d) => d.dispose());
        this.subscriptions = [];
    }

    /** 获取 LSP 运行状态 */
    getLspState(): boolean {
        return Utility.checkIsValid(this.client) && this.client!.state === LspState.Running;
    }

    // ── 内部实现 ────────────────────────────────────────────────────

    private async startClient(): Promise<void> {
        const extensionContext = this.extensionContext;
        if (!extensionContext) {
            OutputHelper.appendLine('[activate] extension context is not available', true);
            return;
        }

        SenseContext.cwd = extensionContext.extensionPath;
        SenseContext.envInfo.sdkVersion = await this.getSdkVersion();
        SenseContext.envInfo.serverVersion = SenseContext.envInfo.sdkVersion;

        if (Utility.findSenseExecutable() === '') {
            OutputHelper.appendLine(
                '[activate] sense executable not found, set sense.executablePath or add it to PATH',
                true
            );
            OutputHelper.show();
            this.reportStopped();
            void vscode.window.showErrorMessage(
                'The sense executable was not found. Set sense.executablePath or add sense to PATH.'
            );
            return;
        }
        if (!Utility.isValidSdk()) {
            OutputHelper.appendLine(
                '[activate] the Cangjie SDK path is not configured properly. Set sense.sdkPath or CANGJIE_HOME.',
                true
            );
            OutputHelper.show();
            this.reportStopped();
            void vscode.window.showErrorMessage(
                'The Cangjie SDK path was not configured. Set sense.sdkPath or the CANGJIE_HOME environment variable.'
            );
            return;
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
            connectionOptions: {
                messageStrategy: createProgressMessageStrategy(getProgressTracker()),
            },
            errorHandler: senseErrorHandler,
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

        const client = new SenseLanguageClient(
            'sense',
            'sense Language Server',
            serverOptions,
            clientOptions
        );
        client.onClosed = (closed) => this.handleClientClosed(closed);
        client.registerFeature(new CompletionCapability() as any);
        this.client = client;
        activateHealthCheck(this);

        vscode.commands.executeCommand('sense.lsp.updateState', {
            state: lspConstants.State.Starting,
            serverVersion: SenseContext.envInfo.serverVersion,
        });

        try {
            await this.withTimeout(
                client.start(),
                START_TIMEOUT_MS,
                'sense language server did not finish initializing in time'
            );
        } catch (e: any) {
            this.client = null;
            this.releaseTransport();
            this.reportStopped();
            const errorMessage = e?.message ? e.message : String(e);
            OutputHelper.appendLine(`[activate] sense language server failed to start: ${errorMessage}`, true);
            OutputHelper.show();
            void vscode.window.showErrorMessage(`sense language server failed to start: ${errorMessage}`);
            return;
        }

        if (!client.isRunning()) return;

        this.clearRestartTimer();
        await client.setTrace(this.getTraceLevel());
        this.runningSince = Date.now();
        Utility.serverRun = true;
        vscode.commands.executeCommand('sense.lsp.updateState', {
            state: lspConstants.State.Running,
            serverVersion: SenseContext.envInfo.serverVersion,
        });
    }

    /** 完整释放当前客户端与传输层 */
    private async releaseCurrent(): Promise<void> {
        const client = this.client;
        const transport = this.transport;
        this.client = null;
        this.transport = null;
        this.disposingCurrent = true;
        try {
            if (client) {
                try {
                    await client.stop();
                } catch {
                    // 释放阶段的错误忽略
                }
            }
            transport?.dispose();
        } finally {
            this.disposingCurrent = false;
        }
        this.reportStopped();
    }

    private releaseTransport(): void {
        this.transport?.dispose();
        this.transport = null;
    }

    /**
     * 连接关闭事件入口。
     *
     * 只有当前客户端且不是本扩展主动关闭时才安排重启；旧客户端的回调一律忽略。
     */
    private handleClientClosed(client: SenseLanguageClient): void {
        if (client !== this.client) return;
        this.client = null;
        this.releaseTransport();
        this.reportStopped();
        if (this.disposingCurrent) return;
        this.scheduleRestart();
    }

    /** 统一上报停止状态，避免状态栏与实际运行状态不一致 */
    private reportStopped(): void {
        Utility.serverRun = false;
        getProgressTracker().clear();
        vscode.commands.executeCommand('sense.lsp.updateState', {
            state: lspConstants.State.Stopped,
            serverVersion: SenseContext.envInfo.serverVersion,
        });
    }

    /** 按连续失败次数做指数退避，稳定运行后清零计数 */
    private scheduleRestart(): void {
        if (this.stoppedByUser) return;

        const autoRestart = vscode.workspace
            .getConfiguration('sense.lsp')
            .get<boolean>('autoRestart', true);
        if (!autoRestart) {
            void vscode.window
                .showErrorMessage(
                    'The sense language server stopped. Auto-restart is disabled.',
                    'Restart Manually'
                )
                .then((choice) => {
                    if (choice === 'Restart Manually') void this.restart();
                });
            return;
        }

        if (this.runningSince > 0 && Date.now() - this.runningSince >= lspConstants.STABLE_RESET_MS) {
            this.consecutiveFailures = 0;
        }
        this.consecutiveFailures += 1;

        if (this.consecutiveFailures > lspConstants.MAX_RESTART_COUNT) {
            OutputHelper.appendLine(
                `The sense language server stopped ${this.consecutiveFailures} times without a stable run. Auto-restart has been stopped.`,
                true
            );
            OutputHelper.show();
            void vscode.window.showErrorMessage(
                'The sense language server keeps stopping. Auto-restart has been stopped. Use "Restart Language Server" to try again.'
            );
            return;
        }

        const delay = Math.min(
            lspConstants.RESTART_DELAY_MS * 2 ** (this.consecutiveFailures - 1),
            lspConstants.MAX_RESTART_DELAY_MS
        );
        OutputHelper.appendLine(
            `The sense language server stopped, restart ${this.consecutiveFailures}/${lspConstants.MAX_RESTART_COUNT} in ${delay} ms.`,
            true
        );
        vscode.commands.executeCommand('sense.lsp.updateState', {
            state: lspConstants.State.Starting,
            serverVersion: SenseContext.envInfo.serverVersion,
        });

        this.clearRestartTimer();
        this.restartTimer = setTimeout(() => {
            this.restartTimer = undefined;
            if (this.stoppedByUser) return;
            // 等待期间服务已被其它入口拉起时不再重启
            if (this.getLspState()) return;
            void this.restart();
        }, delay);
    }

    private clearRestartTimer(): void {
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = undefined;
        }
    }

    /** 给异步操作加上等待上限 */
    private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(message)), ms);
            promise.then(
                (value) => {
                    clearTimeout(timer);
                    resolve(value);
                },
                (error) => {
                    clearTimeout(timer);
                    reject(error);
                }
            );
        });
    }
}

/** 全局单例的 LSP 上下文实例 */
export const context = new SenseContext();
