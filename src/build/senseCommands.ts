/** @file sense 命令集合：构建、测试、清理、取回依赖、文档生成与运行 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import { Utility } from '../utils/utility';
import { checkIsValid } from '../utils/commons';
import { senseTomlName, targetDirName } from '../utils/constants';
import { SenseCli, BuildOptions } from './senseCli';
import { TerminalHelper } from './terminalHelper';

/** 从设置里读取自定义产物目录 */
function getTargetDirSetting(): string {
    return vscode.workspace.getConfiguration('sense').get<string>('build.targetDir') ?? '';
}

/** 获取首个工程根目录，没有时返回空串 */
function getProjectRoot(): string {
    const roots = Utility.getProjectRoots();
    return roots.length > 0 ? roots[0] : '';
}

/** 要求当前存在工程根，否则报错并返回空串 */
function requireProjectRoot(): string {
    const root = getProjectRoot();
    if (root === '') {
        Utility.noSenseConfig();
    }
    return root;
}

/** 在终端执行 sense 命令 */
function runCommand(
    command: string,
    options: { reloadLsp?: boolean; onComplete?: () => void } = {}
): void {
    TerminalHelper.execCommand(command, options);
}

/** 询问并发任务数 */
async function askJobs(baseCommand: (jobs: string) => string): Promise<void> {
    const cpuCount = os.cpus().length;
    const input = await vscode.window.showInputBox({
        prompt: `Input the number of parallel jobs. The support range is (0, ${cpuCount * 2}].`,
        ignoreFocusOut: true,
    });
    if (input === undefined) return;
    const value = input === '' ? String(cpuCount) : input;
    const numVal = Number(value);
    if (Number.isNaN(numVal) || numVal <= 0) {
        vscode.window.showErrorMessage('Invalid input. The input should be a positive number.');
        return;
    }
    const jobs = numVal > cpuCount * 2 ? String(cpuCount) : String(numVal);
    runCommand(baseCommand(jobs));
}

/** 读取 SDK 下的目标目录名，用于提示可选目标 */
function listSdkModules(): string[] {
    const cangjieHome = Utility.getCangjieHome();
    if (cangjieHome === '') return [];
    const modulesDir = path.join(cangjieHome, 'modules');
    if (!fs.existsSync(modulesDir)) return [];
    return fs
        .readdirSync(modulesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
}

/** 从 cjc -v 的输出中读取宿主目标三元组 */
function getHostTriple(): Promise<string> {
    return new Promise((resolve) => {
        child_process.exec(Utility.getExecCmd('cjc -v'), (error, stdout) => {
            if (error) {
                resolve('');
                return;
            }
            const match = stdout.match(/Target:\s*(\S+)/);
            resolve(match ? match[1].toString() : '');
        });
    });
}

/** 判断输入是否为 {ARCH}-{VENDOR}-{SYSTEM}-{ENV} 或 {ARCH}-{SYSTEM}-{ENV} 形式 */
function isValidTriple(value: string): boolean {
    const parts = value.split('-');
    if (parts.length !== 3 && parts.length !== 4) return false;
    return parts.every((part) => /^[A-Za-z0-9_]+$/.test(part));
}

/** 按当前工程设置运行按钮的上下文键 */
export function refreshRunState(): void {
    const root = getProjectRoot();
    const info = root === '' ? { name: '' } : SenseCli.readModuleInfo(root);
    vscode.commands.executeCommand('setContext', 'sense.run.state', info.name !== '');
}

/** 读取清单里声明的 feature 名字 */
function readFeatures(projectRoot: string): string[] {
    const content = Utility.getTomlContent(path.join(projectRoot, senseTomlName));
    const features = Utility.getTomlValueByTreeKeys(['features'], content, false) as Record<string, any>;
    if (!checkIsValid(features)) return [];
    return Object.keys(features).filter((name) => name !== 'defaults');
}

/** 把构建选项转成 sense build 命令 */
function buildCmd(options: BuildOptions = {}): string {
    return SenseCli.buildCommand(options);
}

/**
 * 注册全部 sense 命令
 */
export function registerSenseCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('sense.build', () => {
            if (!requireProjectRoot()) return;
            runCommand(buildCmd());
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.build.release', () => {
            if (!requireProjectRoot()) return;
            runCommand(buildCmd({ release: true }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.build.clean', () => {
            if (!requireProjectRoot()) return;
            runCommand(SenseCli.cleanCommand({ targetDir: getTargetDirSetting() || undefined }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.build.fetch', () => {
            if (!requireProjectRoot()) return;
            runCommand(SenseCli.fetchCommand(), { reloadLsp: false });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.build.update', () => {
            if (!requireProjectRoot()) return;
            runCommand(SenseCli.updateCommand(), { reloadLsp: false });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.build.workspace', () => {
            if (!requireProjectRoot()) return;
            runCommand(buildCmd({ workspace: true }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.build.targetDir', async () => {
            if (!requireProjectRoot()) return;
            const current = getTargetDirSetting();
            const input = await vscode.window.showInputBox({
                prompt: 'Input the artifact root directory.',
                value: current,
                ignoreFocusOut: true,
            });
            if (input === undefined) return;
            await vscode.workspace
                .getConfiguration('sense')
                .update('build.targetDir', input, vscode.ConfigurationTarget.Workspace);
            runCommand(buildCmd({ targetDir: input === '' ? undefined : input }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.build.jobs', async () => {
            if (!requireProjectRoot()) return;
            await askJobs((jobs) => buildCmd({ jobs }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.build.target', async () => {
            if (!requireProjectRoot()) return;
            const hostTriple = await getHostTriple();
            const modules = listSdkModules();
            const hint = modules.length > 0 ? `SDK target directories: ${modules.join(', ')}.` : '';
            const input = await vscode.window.showInputBox({
                prompt: `Input the target triple, e.g. x86_64-unknown-linux-gnu. ${hint}`,
                value: hostTriple,
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (value === '') return 'The target triple cannot be empty.';
                    if (!isValidTriple(value)) {
                        return 'The target must be {ARCH}-{VENDOR}-{SYSTEM}-{ENV} or {ARCH}-{SYSTEM}-{ENV}.';
                    }
                    return '';
                },
            });
            if (input === undefined) return;
            runCommand(buildCmd({ target: input }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.build.feature', async () => {
            const root = requireProjectRoot();
            if (root === '') return;
            const features = readFeatures(root);
            if (features.length === 0) {
                vscode.window.showWarningMessage(
                    `There is no [features] table in ${senseTomlName}, please configure it first.`
                );
                return;
            }
            const selected = await vscode.window.showQuickPick(features, {
                placeHolder: 'Select one or more features to enable',
                canPickMany: true,
                ignoreFocusOut: true,
            });
            if (!checkIsValid(selected)) return;
            runCommand(buildCmd({ features: selected as string[] }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.run', async () => {
            const root = requireProjectRoot();
            if (root === '') return;
            await vscode.workspace.saveAll(false);

            const info = SenseCli.readModuleInfo(root);
            if (!checkIsValid(info.name)) {
                vscode.window.showErrorMessage(
                    `${senseTomlName} has no [module].name, cannot determine the executable to run.`
                );
                return;
            }

            const binary = SenseCli.getBinaryPath(
                root,
                info.name,
                'dev',
                getTargetDirSetting() || undefined
            );
            if (!fs.existsSync(binary)) {
                vscode.window.showInformationMessage(
                    `The executable ${binary} does not exist yet. Run sense.build first.`
                );
            }
            runCommand(`${buildCmd({ targetDir: getTargetDirSetting() || undefined })} && ${SenseCli.quote(binary)}`, {
                reloadLsp: false,
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.test', () => {
            if (!requireProjectRoot()) return;
            runCommand(SenseCli.testCommand());
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.test.noRun', () => {
            if (!requireProjectRoot()) return;
            runCommand(SenseCli.testCommand({ noRun: true }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.test.skipBuild', () => {
            if (!requireProjectRoot()) return;
            runCommand(SenseCli.testCommand({ skipBuild: true }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.test.coverage', () => {
            if (!requireProjectRoot()) return;
            runCommand(SenseCli.testCommand({ coverage: true }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.test.jobs', async () => {
            if (!requireProjectRoot()) return;
            await askJobs((jobs) => SenseCli.testCommand({ jobs }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.test.filter', async () => {
            if (!requireProjectRoot()) return;
            const input = await vscode.window.showInputBox({
                prompt: 'Input the test name pattern to filter.',
                ignoreFocusOut: true,
            });
            if (input === undefined || input === '') return;
            runCommand(SenseCli.testCommand({ filter: input }));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.docs', () => {
            const root = requireProjectRoot();
            if (root === '') return;
            runCommand(SenseCli.docsCommand({ targetDir: getTargetDirSetting() || undefined }), {
                reloadLsp: false,
                onComplete: () => {
                    const targetRoot = getTargetDirSetting() || path.join(root, targetDirName);
                    const index = path.join(targetRoot, 'docs', SenseCli.readModuleInfo(root).name, 'index.html');
                    if (fs.existsSync(index)) {
                        vscode.env.openExternal(vscode.Uri.file(index));
                    }
                },
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('sense.lsp.activate', async () => {
            vscode.commands.executeCommand('sense.lsp.reLaunch');
        })
    );

    refreshRunState();
}
