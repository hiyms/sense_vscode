/** @file 输出通道辅助类 */

import * as vscode from 'vscode';
import { checkIsValid } from './commons';
import { extensionOutputChannelName } from './constants';

/**
 * 输出通道辅助类，统一管理扩展的输出通道
 *
 * 通道以日志通道形式创建，同时承载扩展自身的诊断输出与语言客户端的
 * 日志和 JSON-RPC 跟踪（sense.trace.server）。
 */
export class OutputHelper {
    private static channel: vscode.LogOutputChannel | undefined;

    /** 获取输出通道，首次调用时创建 */
    static getChannel(): vscode.LogOutputChannel {
        if (!checkIsValid(OutputHelper.channel)) {
            OutputHelper.channel = vscode.window.createOutputChannel(extensionOutputChannelName, { log: true });
        }
        return OutputHelper.channel!;
    }

    /** 向输出通道追加一行消息 */
    static appendLine(message: string, noTimestamp?: boolean): void {
        const channel = OutputHelper.getChannel();
        if (!noTimestamp) {
            channel.appendLine(`[Execute Time - ${new Date().toLocaleString()}]`);
        }
        channel.appendLine(message);
    }

    /** 显示输出通道 */
    static show(): void {
        OutputHelper.getChannel().show();
    }
}
