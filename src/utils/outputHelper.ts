/** @file 输出通道辅助类 */

import * as vscode from 'vscode';
import { checkIsValid } from './commons';
import { extensionOutputChannelName } from './constants';

/**
 * 输出通道辅助类，统一管理扩展的输出通道
 */
export class OutputHelper {
    static outputChannel: vscode.OutputChannel;

    /** 获取输出通道，首次调用时创建 */
    static getChannel(): vscode.OutputChannel {
        if (!checkIsValid(this.outputChannel)) {
            this.outputChannel = vscode.window.createOutputChannel(extensionOutputChannelName);
        }
        return this.outputChannel;
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
