/** @file 输出通道辅助类 */

import * as vscode from 'vscode';
import { checkIsValid } from './commons';
import { extensionOutputChannelName } from './constants';

/** JSON-RPC 跟踪通道名 */
const TRACE_CHANNEL_NAME = `${extensionOutputChannelName} Trace`;

/**
 * 输出通道辅助类，统一管理扩展的两个日志通道
 *
 * - 主通道承载扩展自身的诊断输出、sense lsp 的 stderr 与语言客户端日志；
 * - 跟踪通道承载语言客户端的 JSON-RPC 报文跟踪（sense.trace.server）。
 *
 * 两个通道都以日志通道形式创建。日志通道按级别过滤，跟踪报文只有在通道
 * 级别被用户调到 Trace 时才会写出。
 */
export class OutputHelper {
    private static channel: vscode.LogOutputChannel | undefined;
    private static traceChannel: vscode.LogOutputChannel | undefined;

    /** 获取主输出通道，首次调用时创建 */
    static getChannel(): vscode.LogOutputChannel {
        if (!checkIsValid(OutputHelper.channel)) {
            OutputHelper.channel = vscode.window.createOutputChannel(extensionOutputChannelName, { log: true });
        }
        return OutputHelper.channel!;
    }

    /** 获取跟踪通道，首次调用时创建 */
    static getTraceChannel(): vscode.LogOutputChannel {
        if (!checkIsValid(OutputHelper.traceChannel)) {
            OutputHelper.traceChannel = vscode.window.createOutputChannel(TRACE_CHANNEL_NAME, { log: true });
        }
        return OutputHelper.traceChannel!;
    }

    /** 向主输出通道追加一行消息 */
    static appendLine(message: string, noTimestamp?: boolean): void {
        const channel = OutputHelper.getChannel();
        if (!noTimestamp) {
            channel.appendLine(`[Execute Time - ${new Date().toLocaleString()}]`);
        }
        channel.appendLine(message);
    }

    /** 显示主输出通道 */
    static show(): void {
        OutputHelper.getChannel().show();
    }

    /** 显示跟踪通道 */
    static showTrace(): void {
        OutputHelper.getTraceChannel().show();
    }
}
