/** @file 服务端进度展示：从 LSP 报文中取出工作进度并显示到 Sense 状态栏 */

import { Message, MessageStrategy } from 'vscode-languageclient/node';

import * as lspConstants from '../utils/lspConstants';
import { getStatusBar, ProgressInfo } from './statusBar';

/** 状态栏进度使用的 token 类型 */
type ProgressToken = string | number;

/** 记录服务端创建的进度 token，并把进度投影到状态栏 */
export class ProgressTracker {
    private readonly tokens = new Set<ProgressToken>();

    /** 记录一个服务端创建的进度 token */
    create(token: ProgressToken): void {
        this.tokens.add(token);
    }

    /** 服务端是否创建过该 token */
    knows(token: ProgressToken): boolean {
        return this.tokens.has(token);
    }

    /** 写入一条进度 */
    report(token: ProgressToken, value: ProgressInfo): void {
        getStatusBar().setProgress(token, value);
    }

    /** 结束一条进度 */
    end(token: ProgressToken): void {
        this.tokens.delete(token);
        getStatusBar().clearProgress(token);
    }

    /** 结束全部进度 */
    clear(): void {
        this.tokens.clear();
        getStatusBar().clearProgress();
    }
}

let tracker: ProgressTracker | undefined;

/** 获取进度记录单例 */
export function getProgressTracker(): ProgressTracker {
    if (!tracker) {
        tracker = new ProgressTracker();
    }
    return tracker;
}

/**
 * 构造 LSP 报文拦截策略。
 *
 * sense lsp 在 initialize 响应之前就会发出 window/workDoneProgress/create 与 $/progress，
 * 此时语言客户端还没有注册任何处理器，报文会被丢弃。因此在这里先取出进度。
 */
export function createProgressMessageStrategy(progress: ProgressTracker): MessageStrategy {
    return {
        handleMessage(message, next) {
            if (Message.isNotification(message)) {
                observeNotification(message.method, message.params, progress);
            }
            return next(message);
        },
    };
}

/** 处理一条服务端通知 */
function observeNotification(method: string, params: any, progress: ProgressTracker): void {
    if (method === lspConstants.workDoneProgressCreateMethod) {
        const token = params?.token;
        if (token !== undefined) {
            progress.create(token);
        }
        return;
    }

    if (method !== lspConstants.progressNotificationMethod) {
        return;
    }

    const token = params?.token;
    const value = params?.value;
    if (token === undefined || value === undefined || !progress.knows(token)) {
        return;
    }

    switch (value.kind) {
        case 'begin':
        case 'report':
            progress.report(token, value);
            break;
        case 'end':
            progress.end(token);
            break;
    }
}
