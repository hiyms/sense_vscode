/** @file VS Code 扩展入口，按顺序激活主流程、LSP 与文件监听模块 */

import * as vscode from 'vscode';

import { activate as lspActivate } from './lsp/activate';
import { activate as mainActivate, registerTomlUtil, registerFileWatcher } from './main/activate';
import { Utility } from './utils/utility';
import { OutputHelper } from './utils/outputHelper';
import { shouldShowSdkPicker, showSdkPicker } from './quickPick/sdkPicker';
import { senseTomlName } from './utils/constants';

/** 与本插件不兼容的原版仓颉插件标识 */
const INCOMPATIBLE_EXTENSION_IDS = ['IDE-Innovation-Lab.cangjie', 'OpenCJ.cangjie'];

/** sense.sdkPath 的忽略值，写入后该工作区的扩展功能停用 */
const SDK_DISABLED_VALUE = 'DISABLE';

/** 用户取消过 SDK 选择后，本次会话不再重复弹出 */
let sdkPickerDeclined = false;

/**
 * 在有工程时启动 LSP，必要时先弹出 SDK 选择器
 *
 * 可重复调用：语言服务的启动由 SenseContext 保证幂等。
 */
async function startLsp(context: vscode.ExtensionContext): Promise<void> {
    if (sdkPickerDeclined) return;

    const sdkSetting = vscode.workspace.getConfiguration('sense').get<string>('sdkPath');
    if (sdkSetting === SDK_DISABLED_VALUE) {
        vscode.window.showInformationMessage(
            'sense (Cangjie) features are disabled for this workspace.'
        );
        return;
    }

    if (shouldShowSdkPicker()) {
        const pickResult = await showSdkPicker();
        if (!pickResult) {
            sdkPickerDeclined = true;
            OutputHelper.appendLine(
                '[SDK Picker] User cancelled, LSP activation skipped (no SDK configured)',
                true
            );
            return;
        }
        if (pickResult.ignored) {
            OutputHelper.appendLine(
                '[SDK Picker] User chose to ignore, extension features disabled for this workspace',
                true
            );
            return;
        }
    }

    await lspActivate(context);
}

/** 监听 sense.toml 的出现，出现后启动 LSP */
function registerDeferredActivation(context: vscode.ExtensionContext): void {
    const tryStart = () => {
        if (Utility.isCangjieProject()) {
            void startLsp(context);
        }
    };

    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(tryStart));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(tryStart));

    const watcher = vscode.workspace.createFileSystemWatcher(`**/${senseTomlName}`);
    context.subscriptions.push(watcher);
    context.subscriptions.push(watcher.onDidCreate(tryStart));
}

/**
 * 插件激活入口
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    for (const id of INCOMPATIBLE_EXTENSION_IDS) {
        const installed = vscode.extensions.getExtension(id);
        if (!installed) continue;
        const selection = await vscode.window.showWarningMessage(
            'sense (Cangjie) is not compatible with the original Cangjie extension. ' +
            'Please disable or uninstall one of them. All sense (Cangjie) features are disabled.',
            'Disable the other extension',
            'Dismiss'
        );
        if (selection === 'Disable the other extension') {
            await vscode.commands.executeCommand(
                'workbench.extensions.search',
                `@id:${id}`
            );
        }
        return;
    }

    registerTomlUtil();
    await mainActivate(context);
    registerFileWatcher(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.sdk.select', async () => {
            const pickResult = await showSdkPicker();
            if (!pickResult || pickResult.ignored) {
                return;
            }
            sdkPickerDeclined = false;
            const restart = await vscode.window.showInformationMessage(
                'SDK path updated. Restart the sense language server to apply?',
                'Restart Now',
                'Later'
            );
            if (restart === 'Restart Now') {
                vscode.commands.executeCommand('sense.lsp.reLaunch');
            }
        })
    );

    if (Utility.isCangjieProject()) {
        await startLsp(context);
    } else {
        registerDeferredActivation(context);
    }
}
