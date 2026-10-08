/** @file sense 命令的终端辅助工具 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Utility } from '../utils/utility';
import { checkIsValid } from '../utils/commons';

/** 终端名称 */
const TERMINAL_NAME = 'sense';
/** 未匹配命令结束事件的记录上限，避免终端集成不可用时长队 */
const MAX_PENDING = 20;

/** 待匹配的终端命令执行记录 */
interface PendingExecution {
    command: string;
    reloadLsp: boolean;
    onComplete?: () => void;
}

/**
 * 终端辅助工具类，用于在 VS Code 集成终端里执行 sense 命令
 *
 * 复用同一个终端，不主动结束正在运行的命令；命令结束由
 * vscode.window.onDidEndTerminalShellExecution 通知，据此在构建或测试结束后
 * 重启语言服务以加载新的产物。
 */
export class TerminalHelper {
    static context: vscode.ExtensionContext | undefined;
    static senseTerminal: vscode.Terminal | undefined;
    private static pending: PendingExecution[] = [];
    private static registered = false;

    /** 注册终端命令结束监听与终端释放，只注册一次 */
    static register(context: vscode.ExtensionContext): void {
        this.context = context;
        if (this.registered) return;
        this.registered = true;

        context.subscriptions.push(
            vscode.window.onDidEndTerminalShellExecution((event) => {
                if (event.terminal.name !== TERMINAL_NAME) return;
                const commandLine = event.execution.commandLine.value.trim();
                const index = this.pending.findIndex((item) => item.command.trim() === commandLine);
                if (index < 0) return;
                const [item] = this.pending.splice(index, 1);

                if (item.reloadLsp && Utility.serverRun) {
                    vscode.commands.executeCommand('sense.lsp.reLaunch');
                }
                item.onComplete?.();
            })
        );

        context.subscriptions.push({ dispose: () => this.clearPanels() });
    }

    /** 是否有命令在结束后会触发语言服务重启 */
    static willReloadOnCompletion(): boolean {
        return TerminalHelper.pending.some((item) => item.reloadLsp);
    }

    /**
     * 在终端中执行指定的 sense 命令
     * @param command - 要执行的命令字符串
     * @param options - reloadLsp 决定命令结束后是否重启语言服务，onComplete 在命令结束后调用
     */
    static async execCommand(
        command: string,
        options: { reloadLsp?: boolean; onComplete?: () => void } = {}
    ): Promise<void> {
        const terminal = this.ensureTerminal();

        if (this.pending.length >= MAX_PENDING) {
            this.pending.shift();
        }
        this.pending.push({
            command,
            reloadLsp: options.reloadLsp !== false,
            onComplete: options.onComplete,
        });
        terminal.sendText(command);
        terminal.show(false);
    }

    /** 获取可用的终端，没有或已结束时创建 */
    private static ensureTerminal(): vscode.Terminal {
        if (this.senseTerminal && this.senseTerminal.exitStatus === undefined) {
            return this.senseTerminal;
        }

        const osName = Utility.getOsSystem();
        const defaultProfile = vscode.workspace
            .getConfiguration('terminal.integrated.defaultProfile')
            .get(osName);

        if (checkIsValid(defaultProfile)) {
            this.senseTerminal = vscode.window.createTerminal({ name: TERMINAL_NAME });
            return this.senseTerminal;
        }

        let shellPath = '/bin/bash';
        let shellArgs: string[] = [];
        if (process.platform === 'win32') {
            shellPath = 'C:\\Windows\\System32\\cmd.exe';
            shellArgs = ['/K', 'chcp 65001'];
        }

        const terminal = vscode.window.createTerminal({
            name: TERMINAL_NAME,
            shellPath,
            shellArgs,
        });
        this.senseTerminal = terminal;

        const cangjieHome = Utility.getCangjieHome();
        if (process.platform === 'win32') {
            if (cangjieHome !== '') {
                terminal.sendText(`${path.join(cangjieHome, 'envsetup.bat')}`);
            }
            terminal.sendText('cls');
        } else if (cangjieHome !== '') {
            terminal.sendText(`source ${path.join(cangjieHome, 'envsetup.sh')}`);
            terminal.sendText('clear');
        }
        return terminal;
    }

    /** 释放终端并清空待匹配记录 */
    static clearPanels(): void {
        this.pending = [];
        const terminal = this.senseTerminal;
        this.senseTerminal = undefined;
        if (terminal && terminal.exitStatus === undefined) {
            terminal.dispose();
        }
    }
}
