/** @file LSP 中间件，实现文档打开、补全、文档链接、定义跳转和 CodeLens 的自定义处理 */

import * as vscode from 'vscode';
import { context } from './context';

/**
 * 文档打开中间件：仅处理 .cj 文件，其余文件跳过。
 */
export function didOpenMidware(
    document: vscode.TextDocument,
    next: (document: vscode.TextDocument) => Promise<void>
): Promise<void> {
    if (isCangjieDocument(document)) {
        return next(document);
    }
    return Promise.resolve();
}

/**
 * 补全中间件：在所有补全项上附加跟踪命令，用于记录用户选择的补全项。
 */
export async function completionMidware(
    document: vscode.TextDocument,
    position: vscode.Position,
    context_: vscode.CompletionContext,
    token: vscode.CancellationToken,
    next: (
        document: vscode.TextDocument,
        position: vscode.Position,
        context_: vscode.CompletionContext,
        token: vscode.CancellationToken
    ) => Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined | null>
): Promise<vscode.CompletionList | undefined> {
    const result = await next(document, position, context_, token);
    const items = Array.isArray(result) ? result : result?.items;

    const trackedItems = items?.map((item) => {
        item.command = {
            title: 'Apply Completion and Track Usage',
            command: 'sense.lsp.trackCompletion',
            arguments: [item],
        };
        return item;
    });

    if (trackedItems === undefined) {
        return undefined;
    }
    return new vscode.CompletionList(trackedItems, true);
}

/**
 * 文档链接中间件：仅对 .cj 文件处理文档链接。
 */
export function documentLinkMidware(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    next: (document: vscode.TextDocument, token: vscode.CancellationToken) => vscode.ProviderResult<vscode.DocumentLink[]>
): vscode.ProviderResult<vscode.DocumentLink[]> {
    if (isCangjieDocument(document)) {
        return next(document, token);
    }
    return undefined;
}

/**
 * 定义跳转中间件：仅对 .cj 文件处理定义跳转。
 */
export function definitionMidware(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    next: (document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) => vscode.ProviderResult<vscode.Definition>
): vscode.ProviderResult<vscode.Definition> {
    if (!isCangjieDocument(document)) {
        return null;
    }
    const client = context.client;
    if (!client) {
        return next(document, position, token);
    }
    return Promise.resolve(next(document, position, token)).then((result) => {
        if (token.isCancellationRequested) {
            return null;
        }
        if (Array.isArray(result) && result.length > 0 && (result[0] as any)?.crossMessage !== undefined) {
            return client.protocol2CodeConverter.asDefinitionResult(result as any, token);
        }
        if ((result as any)?.crossMessage !== undefined) {
            return client.protocol2CodeConverter.asDefinitionResult(result as any, token);
        }
        return result;
    });
}

/**
 * CodeLens 中间件：仅对测试文件（_test.cj 且在 src 目录下）展示 CodeLens。
 */
export function codeLensMidware(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    next: (document: vscode.TextDocument, token: vscode.CancellationToken) => vscode.ProviderResult<vscode.CodeLens[]>
): vscode.ProviderResult<vscode.CodeLens[]> {
    if (document.uri.toString().endsWith('_test.cj') && document.uri.toString().includes('/src/')) {
        return next(document, token);
    }
    return undefined;
}

/** 判断文档是否为仓颉源文件 */
function isCangjieDocument(document: vscode.TextDocument): boolean {
    const uri = document.uri.toString();
    return uri.endsWith('.cj') || uri.endsWith('.cj.macrocall');
}
