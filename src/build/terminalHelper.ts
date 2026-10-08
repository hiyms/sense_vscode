/** @file sense 命令的终端辅助工具 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Utility } from '../utils/utility';
import { checkIsValid } from '../utils/commons';

/** 终端名称 */
const TERMINAL_NAME = 'sense';

/** 待匹配的终端命令执行记录 */
interface PendingExecution {
    command: string;
    reloadLsp: boolean;
    onComplete?: () => void;
}

/**
 * 终端辅助工具类，用于在 VS Code 集成终端里执行 sense 命令
 *
 * 命令结束由 vscode.window.onDidEndTerminalShellExecution 通知，据此在
 * 构建或测试结束后重启语言服务以加载新的产物。
 */
export class TerminalHelper {
    static context: vscode.ExtensionContext | undefined;
    static senseTerminal: vscode.Terminal | undefined;
    private static pending: PendingExecution[] = [];
    private static registered = false;

    /** 注册终端命令结束监听，只注册一次 */
    static register(context: vscode.ExtensionContext): void {
        this.context = context;
        if (this.registered) return;
        this.registered = true;

        context.subscriptions.push(
            vscode.window.onDidEndTerminalShellExecution((event) => {
                if (event.terminal.name !== TERMINAL_NAME) return;
                const commandLine = event.execution.commandLine.trim();
                const index = this.pending.findIndex((item) => item.command.trim() === commandLine);
                if (index < 0) return;
                const [item] = this.pending.splice(index, 1);

                if (item.reloadLsp && Utility.serverRun) {
                    vscode.commands.executeCommand('sense.lsp.reLaunch');
                }
                item.onComplete?.();
            })
        );
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
        this.clearPanels();

        const osName = Utility.getOsSystem();
        const defaultProfile = vscode.workspace
            .getConfiguration('terminal.integrated.defaultProfile')
            .get(osName);

        if (checkIsValid(defaultProfile)) {
            this.senseTerminal = vscode.window.createTerminal({ name: TERMINAL_NAME });
        } else {
            let shellPath = '/bin/bash';
            let shellArgs: string[] = [];

            if (process.platform === 'win32') {
                shellPath = 'C:\\Windows\\System32\\cmd.exe';
                shellArgs = ['/K', 'chcp 65001'];
            }

            this.senseTerminal = vscode.window.createTerminal({
                name: TERMINAL_NAME,
                shellPath,
                shellArgs,
            });

            const cangjieHome = Utility.getCangjieHome();
            if (process.platform === 'win32') {
                if (cangjieHome !== '') {
                    this.senseTerminal.sendText(`${path.join(cangjieHome, 'envsetup.bat')}`);
                }
                this.senseTerminal.sendText('cls');
            } else if (cangjieHome !== '') {
                this.senseTerminal.sendText(`source ${path.join(cangjieHome, 'envsetup.sh')}`);
                this.senseTerminal.sendText('clear');
            }
        }

        this.pending.push({
            command,
            reloadLsp: options.reloadLsp !== false,
            onComplete: options.onComplete,
        });
        this.senseTerminal.sendText(command);
        this.senseTerminal.show(false);
    }

    /** 清理所有已打开的 sense 终端面板 */
    static clearPanels(): void {
        this.pending = [];
        for (const terminal of vscode.window.terminals) {
            if (terminal.name === TERMINAL_NAME) {
                terminal.dispose();
            }
        }
    }
}
