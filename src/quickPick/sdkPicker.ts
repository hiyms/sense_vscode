/**
 * @file SDK 路径选择器 Quick Pick
 *
 * 当工作区内存在含 sense.toml 的工程根目录，且全局与工作区的 sense.sdkPath
 * 都未设置时，弹出 Quick Pick 面板供用户选择 SDK。
 *
 * 面板包含三类选项（以分隔符分隔）：
 * 1. /opt 下扫描到的有效 SDK 目录，标签为 cjc -v 输出的版本号
 * 2. Custom...（手动选择 SDK 目录）
 * 3. Ignore（写入 DISABLE 值，禁用本插件对此工程的 SDK 支持）
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { OutputHelper } from '../utils/outputHelper';
import { Utility } from '../utils/utility';
import { getExecSuffix } from '../utils/commons';

/** 写在 SDK 配置中表示忽略此工程的特殊值，写入后不再弹出 SDK 选择器 */
const DISABLE_VALUE = 'DISABLE';

/** 系统扫描的 SDK 基础目录 */
const SYSTEM_SDK_BASE = '/opt';

/** 系统 SDK 目录前缀，用于匹配 /opt/cangjie* */
const SYSTEM_SDK_PREFIX = 'cangjie';

// ── 扩展的 QuickPickItem 接口 ─────────────────────────────────────

/** 选中项要执行的动作，系统扫描到的 SDK 目录不需要动作 */
type SdkItemAction = 'custom' | 'ignore';

/** 扩展 QuickPickItem，携带实际的 SDK 目录路径，避免把路径放入可视字段 */
interface SdkQuickPickItem extends vscode.QuickPickItem {
    /** SDK 根目录路径（不显示在 UI 中） */
    sdkDir?: string;
    /** 选中后要执行的动作 */
    action?: SdkItemAction;
}

// ── 工具函数 ────────────────────────────────────────────────────────

/**
 * 执行指定 SDK 目录下的 cjc -v 获取版本号
 *
 * @param sdkDir - SDK 根目录路径
 * @returns 版本号字符串，例如 "1.0.4"；获取失败返回空串
 */
function getSdkVersion(sdkDir: string): Promise<string> {
    return new Promise<string>((resolve) => {
        const cjcPath = path.join(sdkDir, 'bin', `cjc${getExecSuffix()}`);
        child_process.exec(`"${cjcPath}" -v`, (error, stdout, stderr) => {
            if (stderr && stderr.trim().length > 0) {
                OutputHelper.appendLine(`[SDK Picker] cjc -v stderr (${sdkDir}): ${stderr.trim()}`, true);
            }
            if (error) {
                OutputHelper.appendLine(
                    `[SDK Picker] Failed to get version: ${sdkDir}, error: ${error.message}`,
                    true
                );
                resolve('');
                return;
            }
            const match = stdout.match(/\d+(\.\d+)*/);
            const version = match ? match[0].toString() : '';
            if (!version) {
                OutputHelper.appendLine(`[SDK Picker] cjc -v output does not contain version (${sdkDir})`, true);
            }
            resolve(version);
        });
    });
}

/**
 * 校验 SDK 目录是否有效：目录存在且包含 envsetup 脚本与 bin/cjc
 *
 * @param sdkDir - SDK 根目录路径
 * @returns 目录存在且全部校验文件存在时返回 true
 */
function isValidSdkDir(sdkDir: string): boolean {
    try {
        if (!fs.existsSync(sdkDir) || !fs.statSync(sdkDir).isDirectory()) {
            return false;
        }
        const setupScript = process.platform === 'win32' ? 'envsetup.bat' : 'envsetup.sh';
        const cjcName = `cjc${getExecSuffix()}`;
        for (const validationFile of [setupScript, path.join('bin', cjcName)]) {
            if (!fs.existsSync(path.join(sdkDir, validationFile))) {
                return false;
            }
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * 扫描 /opt 目录下所有符合 cangjie* 命名且有效的 SDK 目录
 *
 * @returns 有效的 SDK 目录路径数组，按名称排序
 */
function scanSystemSdkDirs(): string[] {
    const results: string[] = [];
    try {
        if (!fs.existsSync(SYSTEM_SDK_BASE)) {
            return results;
        }
        for (const entry of fs.readdirSync(SYSTEM_SDK_BASE)) {
            if (!entry.startsWith(SYSTEM_SDK_PREFIX)) {
                continue;
            }
            const dirPath = path.join(SYSTEM_SDK_BASE, entry);
            if (isValidSdkDir(dirPath)) {
                results.push(dirPath);
            }
        }
    } catch (e) {
        OutputHelper.appendLine(`[SDK Picker] Failed to scan /opt: ${e}`, true);
    }
    results.sort();
    return results;
}

// ── 自定义 SDK 路径 ─────────────────────────────────────────────────

/**
 * 弹出文件夹选择器让用户指定 SDK 目录
 *
 * 选择后校验目录是否包含 envsetup 脚本与 bin/cjc。
 *
 * @returns 有效的 SDK 目录路径，取消选择或目录无效时返回 undefined
 */
async function pickCustomSdkDir(): Promise<string | undefined> {
    const result = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select SDK Directory',
        title: 'Select Cangjie SDK Directory',
    });

    if (!result || result.length === 0) {
        return undefined;
    }

    const selectedPath = result[0].fsPath;
    if (!isValidSdkDir(selectedPath)) {
        vscode.window.showErrorMessage(
            'The selected directory is not a valid Cangjie SDK (missing envsetup script or bin/cjc)'
        );
        OutputHelper.appendLine(`[SDK Picker] Invalid custom SDK dir: ${selectedPath}`, true);
        return undefined;
    }

    return selectedPath;
}

// ── 写入配置 ────────────────────────────────────────────────────────

/**
 * 把选择结果写入工作区级别的 sense.sdkPath 配置
 *
 * 值相同时跳过写入，避免产生无意义的配置变更。
 *
 * @param value - SDK 路径，或表示忽略的 DISABLE
 */
async function writeSdkConfig(value: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('sense');
    const current = config.inspect<string>('sdkPath');
    if (current?.workspaceValue !== value) {
        await config.update('sdkPath', value, vscode.ConfigurationTarget.Workspace);
        OutputHelper.appendLine(`[SDK Picker] Wrote workspace config sense.sdkPath = ${value}`, true);
    }
}

// ── 主入口 ──────────────────────────────────────────────────────────

/** SDK 选择结果，返回选中的路径与操作类型 */
export interface SdkPickerResult {
    /** 选中的 SDK 路径，或表示忽略的 "DISABLE" */
    value: string;
    /** 是否为忽略操作 */
    ignored: boolean;
}

/**
 * 检查是否需要弹出 SDK 选择器
 *
 * 条件：存在含 sense.toml 的工程根目录，且 sense.sdkPath 的全局值与工作区值都为空。
 *
 * @returns 需要弹出选择器时返回 true
 */
export function shouldShowSdkPicker(): boolean {
    if (Utility.getProjectRoots().length === 0) {
        return false;
    }

    const inspected = vscode.workspace.getConfiguration('sense').inspect<string>('sdkPath');
    const globalValue = (inspected?.globalValue ?? '').trim();
    const workspaceValue = (inspected?.workspaceValue ?? '').trim();
    if (globalValue !== '' || workspaceValue !== '') {
        return false;
    }

    // 环境变量已经提供 SDK 时无需再询问
    const fromEnvironment = (process.env.CANGJIE_HOME ?? '').trim();
    return fromEnvironment === '';
}

/**
 * 弹出 SDK 选择器 Quick Pick 面板
 *
 * 面板包含三类选项（以 QuickPickItemKind.Separator 分隔）：
 * 1. /opt/cangjie* 中有效的 SDK 目录
 * 2. Custom... 与 Ignore
 *
 * @returns 用户选择结果，取消时返回 undefined
 */
export async function showSdkPicker(): Promise<SdkPickerResult | undefined> {
    const items: SdkQuickPickItem[] = [];

    // ── 系统扫描到的 SDK 目录 ──
    const systemDirs = scanSystemSdkDirs();
    if (systemDirs.length > 0) {
        items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
        for (const sdkDir of systemDirs) {
            const version = await getSdkVersion(sdkDir);
            items.push({
                label: version || path.basename(sdkDir),
                description: sdkDir,
                sdkDir: sdkDir,
            });
        }
        OutputHelper.appendLine(`[SDK Picker] Found ${systemDirs.length} system SDK directories`, true);
    }

    // ── Custom / Ignore ──
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
    items.push({
        label: '$(folder-opened) Custom...',
        description: 'Manually select SDK directory',
        action: 'custom',
    });
    items.push({
        label: '$(circle-slash) Ignore',
        description: 'Disable Cangjie extension features',
        action: 'ignore',
    });

    const selected = await vscode.window.showQuickPick(items, {
        title: 'Select Cangjie SDK',
        placeHolder: 'Select a Cangjie SDK for this project',
        ignoreFocusOut: true,
        matchOnDescription: true,
    });

    if (!selected) {
        OutputHelper.appendLine('[SDK Picker] User cancelled selection', true);
        return undefined;
    }

    if (selected.action === 'ignore') {
        await writeSdkConfig(DISABLE_VALUE);
        vscode.window.showInformationMessage(
            'Cangjie extension features disabled for this project. You can change this in settings.'
        );
        return { value: DISABLE_VALUE, ignored: true };
    }

    if (selected.action === 'custom') {
        const customDir = await pickCustomSdkDir();
        if (!customDir) {
            return undefined;
        }
        await writeSdkConfig(customDir);
        vscode.window.showInformationMessage(`Cangjie SDK path set to: ${customDir}`);
        return { value: customDir, ignored: false };
    }

    const sdkDir = selected.sdkDir ?? '';
    if (!sdkDir) {
        OutputHelper.appendLine('[SDK Picker] Selected item has no path info', true);
        return undefined;
    }

    await writeSdkConfig(sdkDir);
    vscode.window.showInformationMessage(`Cangjie SDK path set to: ${sdkDir}`);
    return { value: sdkDir, ignored: false };
}
