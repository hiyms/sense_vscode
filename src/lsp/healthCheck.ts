/** @file LSP 健康检查，监听服务端 cjo 文件版本不兼容通知并展示错误信息 */

import * as vscode from 'vscode';
import { Utility } from '../utils/utility';
import { SenseContext } from './context';

/**
 * 注册健康检查特性到 LSP 客户端。
 */
export function activate(context: SenseContext): void {
    const feature = new HealthCheckFeature(context);
    context.client?.registerFeature(feature as any);
}

/**
 * 健康检查特性类。
 * 监听 textDocument/checkHealthy 通知，解析 cjo 文件版本不兼容信息并展示给用户。
 */
class HealthCheckFeature {
    private context: SenseContext;

    constructor(context: SenseContext) {
        this.context = context;
        context.client?.onNotification('textDocument/checkHealthy', (params: any) => {
            if (!Utility.checkIsValid(params.message)) {
                return;
            }

            const message = params.message as string;
            const regex = /'(?<content>[^']*)'/g;
            const matches: string[] = [];
            let match: RegExpExecArray | null;

            while ((match = regex.exec(message)) !== null) {
                const content = match.groups?.content;
                if (content) {
                    matches.push(content);
                }
            }

            if (matches.length === 3) {
                vscode.window.showErrorMessage(
                    `Incompatible cjo file version! Package ${matches[0]} is ${matches[1]} but current sdk is ${matches[2]}.`
                );
            } else {
                vscode.window.showErrorMessage(`Incompatible cjo file version! ${message}`);
            }

            vscode.commands.executeCommand('sense.lsp.stop');
        });
    }

    fillInitializeParams(_params: any): void {}
    fillClientCapabilities(_capabilities: any): void {}
    initialize(_capabilities: any, _documentSelector: any): void {}
    dispose(): void {}
    getState(): { kind: string } {
        return { kind: 'static' };
    }
    clear(): void {}
}
