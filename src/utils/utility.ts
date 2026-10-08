/**
 * @file 仓颉扩展核心工具类
 *
 * 提供工作区管理、SDK 配置、sense 可执行文件定位、终端命令构造、
 * TOML 解析、环境设置等全扩展通用的静态工具方法。
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import { TextDecoder } from 'util';
import * as vscode from 'vscode';
import { parse as parseToml } from './toml';
import { checkIsValid, findPathInSystemEnv, getExecSuffix } from './commons';
import { OutputHelper } from './outputHelper';
import { senseTomlName } from './constants';

/**
 * 仓颉扩展全局工具类
 *
 * 所有方法均为静态方法，作为无状态的工具函数集合使用。
 */
export class Utility {
    /** LSP 服务是否正在运行 */
    static serverRun = false;
    /** TOML 解析器是否已注册 */
    static tomlRegister = false;
    /** Windows 路径最大长度限制 */
    static readonly MAX_PATH_LENGTH = 260;

    // ── SDK & Platform ──────────────────────────────────────────────

    /** 获取仓颉 SDK 主目录路径（sense.sdkPath 设置优先，其次 CANGJIE_HOME） */
    static getCangjieHome(): string {
        const configured = vscode.workspace.getConfiguration('sense').get<string>('sdkPath');
        if (checkIsValid(configured)) return configured!;
        return process.env.CANGJIE_HOME ?? '';
    }

    /** 校验 SDK 路径是否有效（路径存在 + envsetup 脚本存在） */
    static isValidSdk(): boolean {
        const cangjieHome = Utility.getCangjieHome();
        if (!cangjieHome) return false;
        const setupScript = process.platform === 'win32'
            ? path.resolve(cangjieHome, 'envsetup.bat')
            : path.resolve(cangjieHome, 'envsetup.sh');
        return fs.existsSync(setupScript);
    }

    /** 移除 macOS 上 SDK 目录的 quarantine 扩展属性 */
    static removeSdkAttributes(): void {
        if (os.platform() !== 'darwin') return;
        try {
            const cangjieHome = Utility.getCangjieHome();
            if (!cangjieHome || !fs.existsSync(cangjieHome)) return;
            child_process.execSync(`xattr -dr com.apple.quarantine "${cangjieHome}"`);
        } catch {
            // 忽略属性清理失败
        }
    }

    // ── sense executable ────────────────────────────────────────────

    /** sense 可执行文件名（按平台补 .exe） */
    static getSenseExecutableName(): string {
        return `sense${getExecSuffix()}`;
    }

    /**
     * 定位 sense 可执行文件的绝对路径
     *
     * sense.executablePath 可以是可执行文件本身，也可以是包含 sense 的目录。
     * 未配置时在 PATH 中查找。找不到时返回空串。
     */
    static findSenseExecutable(): string {
        const configured = vscode.workspace.getConfiguration('sense').get<string>('executablePath');
        if (checkIsValid(configured) && fs.existsSync(configured!)) {
            if (fs.statSync(configured!).isDirectory()) {
                const candidate = path.join(configured!, Utility.getSenseExecutableName());
                return fs.existsSync(candidate) ? candidate : '';
            }
            return configured!;
        }
        return Utility.findSenseOnPath();
    }

    /** 同步扫描 PATH 查找 sense 可执行文件 */
    static findSenseOnPath(): string {
        const name = Utility.getSenseExecutableName();
        const pathEnv = process.env.PATH ?? '';
        for (const dir of pathEnv.split(path.delimiter)) {
            if (!dir) continue;
            const candidate = path.join(dir, name);
            try {
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    return candidate;
                }
            } catch {
                // 跳过无法访问的目录
            }
        }
        return '';
    }

    /** 获取 sense 可执行文件所在目录，未配置时返回空串 */
    static getSenseBinDir(): string {
        const executable = Utility.findSenseExecutable();
        return executable === '' ? '' : path.dirname(executable);
    }

    /** 异步在 PATH 中查找 sense，用于首次配置提示 */
    static async findSenseOnPathAsync(): Promise<string[]> {
        return findPathInSystemEnv(Utility.getSenseExecutableName());
    }

    // ── Workspace ───────────────────────────────────────────────────

    /**
     * 获取当前默认工作区文件夹
     *
     * 单文件夹时直接返回；多文件夹时优先返回活动编辑器所在的工作区。
     */
    static getDefaultWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
        if (vscode.workspace.workspaceFolders !== undefined) {
            if (vscode.workspace.workspaceFolders.length === 1) {
                return vscode.workspace.workspaceFolders[0];
            }
            if (checkIsValid(vscode.window.activeTextEditor)) {
                return vscode.workspace.getWorkspaceFolder(
                    vscode.window.activeTextEditor!.document.uri
                ) ?? undefined;
            }
        }
        return undefined;
    }

    /** 获取首个工作区文件夹的 fsPath */
    static getWorkspaceFolders(): string {
        if (checkIsValid(vscode.workspace.workspaceFolders)) {
            return vscode.workspace.workspaceFolders![0].uri.fsPath;
        }
        OutputHelper.appendLine('no open work folder!');
        return '';
    }

    /**
     * 收集全部仓颉工程根目录
     *
     * 来源有两处：含 sense.toml 的工作区根目录；以及用户打开的任意位置
     * 的 sense.toml 所在目录。返回值去重后的绝对路径数组。
     */
    static getProjectRoots(): string[] {
        const roots: string[] = [];
        const push = (dir: string) => {
            if (dir && !roots.includes(dir)) roots.push(dir);
        };

        for (const folder of vscode.workspace.workspaceFolders ?? []) {
            if (fs.existsSync(path.join(folder.uri.fsPath, senseTomlName))) {
                push(folder.uri.fsPath);
            }
        }

        for (const document of vscode.workspace.textDocuments) {
            if (path.basename(document.uri.fsPath) === senseTomlName) {
                push(path.dirname(document.uri.fsPath));
            }
        }

        return roots;
    }

    /** 判断某个工作区根目录（或给定目录）下是否存在 sense.toml */
    static hasSenseToml(dirPath: string = ''): boolean {
        const basePath = checkIsValid(dirPath) ? dirPath : Utility.getWorkspaceFolders();
        if (!basePath) return false;
        return fs.existsSync(path.join(basePath, senseTomlName));
    }

    /** 判断当前工作区是否为仓颉工程 */
    static isCangjieProject(): boolean {
        return Utility.getProjectRoots().length > 0;
    }

    /** 弹出 sense.toml 缺失的错误提示 */
    static noSenseConfig(): void {
        vscode.window.showErrorMessage(
            'The project has no sense.toml file. Run sense or create one before using this command.'
        );
    }

    /** 获取右键菜单操作的路径 */
    static rightClickPath(uri?: vscode.Uri): string {
        if (checkIsValid(uri)) {
            return uri!.fsPath;
        }
        return vscode.window.activeTextEditor?.document.fileName ?? '';
    }

    /** 列出目录下的所有条目名称 */
    static getBasePathAllFolders(dirPath: string): string[] {
        return fs.readdirSync(dirPath);
    }

    // ── TOML helpers ────────────────────────────────────────────────

    /** 解析 TOML 配置文件内容 */
    static getTomlContent(tomlFilePath?: string): Record<string, any> {
        let filePath: string;
        if (checkIsValid(tomlFilePath)) {
            filePath = tomlFilePath!;
        } else {
            const workspacePath = Utility.getWorkspaceFolders();
            if (!workspacePath) return {};
            filePath = path.join(workspacePath, senseTomlName);
        }

        if (!fs.existsSync(filePath)) return {};

        const content = fs.readFileSync(filePath).toString();
        try {
            return parseToml(content);
        } catch {
            return {};
        }
    }

    /** 按键路径树逐层访问 TOML 对象的属性 */
    static getTomlValueByTreeKeys(
        keys: string[],
        tomlContent: Record<string, any>,
        returnUndefinedIfMissing: boolean = true
    ): any {
        if (!checkIsValid(keys)) {
            return returnUndefinedIfMissing ? undefined : {};
        }
        if (!checkIsValid(tomlContent)) {
            return returnUndefinedIfMissing ? undefined : {};
        }
        return Utility.getValueByKeys([...keys], tomlContent, returnUndefinedIfMissing);
    }

    /** 递归按键路径访问嵌套对象的属性 */
    static getValueByKeys(
        keys: string[],
        obj: any,
        returnUndefinedIfMissing: boolean = true
    ): any {
        if (!checkIsValid(obj)) {
            return returnUndefinedIfMissing ? undefined : {};
        }
        if (!checkIsValid(keys) || keys.length === 0) {
            return obj;
        }
        const key = keys.shift()!;
        if (!Object.prototype.hasOwnProperty.call(obj, key)) {
            return returnUndefinedIfMissing ? undefined : {};
        }
        return Utility.getValueByKeys(keys, obj[key], returnUndefinedIfMissing);
    }

    // ── SDK command execution ───────────────────────────────────────

    /**
     * 包装命令使其在 SDK 与 sense 环境下执行
     *
     * 先 source envsetup 脚本设置 PATH、LD_LIBRARY_PATH 等变量，
     * 再把 sense 所在目录前置到 PATH，使用户配置的 sense 优先。
     */
    static getExecCmd(command: string): string {
        const cangjieHome = Utility.getCangjieHome();
        const senseBinDir = Utility.getSenseBinDir();
        const pathPrefix = senseBinDir === ''
            ? ''
            : `export PATH='${senseBinDir}':"$PATH"; `;

        if (process.platform === 'win32') {
            const setup = cangjieHome ? `"${cangjieHome}"\\envsetup.bat && ` : '';
            const winPrefix = senseBinDir === '' ? '' : `set PATH=${senseBinDir};%PATH%&& `;
            return `${setup}${winPrefix}${command}`;
        }
        if (process.platform === 'linux' || process.platform === 'darwin') {
            const setup = cangjieHome ? `source '${cangjieHome}'/envsetup.sh && ` : '';
            return `bash -c "${setup}${pathPrefix}${command}"`;
        }
        return command;
    }

    // ── SDK environment / envsetup ──────────────────────────────────

    /** 解析 envsetup 脚本中的环境变量导出语句 */
    static getenvPaths(): string[] {
        const cangjieHome = Utility.getCangjieHome();
        try {
            if (!cangjieHome || !fs.existsSync(cangjieHome)) {
                throw new Error('The Cangjie SDK path has not been configured properly. Please configure it first.');
            }

            let content: string;
            let scriptDirPattern: RegExp;
            let cangjieHomePattern: RegExp;
            let exportPattern: RegExp;

            if (process.platform === 'win32') {
                content = fs.readFileSync(path.join(cangjieHome, 'envsetup.bat'), 'utf8');
                scriptDirPattern = /%~dp0/g;
                cangjieHomePattern = /%CANGJIE_HOME%/g;
                exportPattern = /set(?<id>.)*/g;
            } else {
                content = fs.readFileSync(path.join(cangjieHome, 'envsetup.sh'), 'utf8');
                scriptDirPattern = /\${script_dir}/g;
                cangjieHomePattern = /\${CANGJIE_HOME}/g;
                exportPattern = /export(?<id>.)*/g;
            }

            if (!checkIsValid(content)) {
                throw new Error('envsetup.sh is empty');
            }

            content = content.replace(scriptDirPattern, cangjieHome);
            if (process.platform === 'linux' || process.platform === 'darwin') {
                content = content.replace(cangjieHomePattern, cangjieHome);
            } else {
                content = content.replace(cangjieHomePattern, `${cangjieHome}\\`);
            }

            return content.match(exportPattern) ?? [];
        } catch (e) {
            OutputHelper.appendLine(`[error]: ${e}`, true);
            return [];
        }
    }

    /** 执行 envsetup 脚本并捕获完整的环境快照 */
    static async getScriptEnv(): Promise<Map<string, string>> {
        return new Promise<Map<string, string>>((resolve) => {
            const cangjieHome = Utility.getCangjieHome();
            if (!cangjieHome || !fs.existsSync(cangjieHome)) {
                resolve(Utility.convertEnvToMap(process.env));
                return;
            }

            let setupScript = '';
            let envCmd = 'env';

            if (process.platform === 'win32') {
                setupScript = `"${cangjieHome}"\\envsetup.bat`;
                envCmd = 'set';
            }
            if (process.platform === 'linux' || process.platform === 'darwin') {
                setupScript = `bash -c "source '${cangjieHome}'/envsetup.sh`;
                envCmd = 'env"';
            }

            child_process.exec(`${setupScript} && ${envCmd}`, (error, stdout) => {
                if (error) {
                    resolve(Utility.convertEnvToMap(process.env));
                    return;
                }
                const result = new Map<string, string>();
                stdout.split('\n').forEach(line => {
                    Utility.convertStrLineToMap(line, result);
                });
                resolve(result.size > 0 ? result : Utility.convertEnvToMap(process.env));
            });
        });
    }

    /** 将单行环境变量字符串解析并存入 Map */
    static convertStrLineToMap(line: string, map: Map<string, string>): void {
        const idx = line.indexOf('=');
        if (idx < 0) return;
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        if (key) {
            map.set(key, value);
        }
    }

    /** 将 ProcessEnv 转换为标准 Map */
    static convertEnvToMap(env: NodeJS.ProcessEnv): Map<string, string> {
        const result = new Map<string, string>();
        for (const key in env) {
            if (!Object.prototype.hasOwnProperty.call(env, key)) continue;
            const value = env[key];
            if (value !== undefined) {
                result.set(key, value);
            }
        }
        return result;
    }

    // ── Terminal environment configuration ─────────────────────────

    /**
     * 配置 VS Code 集成终端环境使 sense 可用
     *
     * 读取 SDK envsetup 导出的环境变量，结合 sense 目录，
     * 更新 terminal.integrated.env 设置项。
     */
    static async configTerminalEnv(): Promise<void> {
        if (process.platform !== 'linux' && process.platform !== 'win32' && process.platform !== 'darwin') return;

        const cangjieHome = Utility.getCangjieHome();
        if (!cangjieHome || !fs.existsSync(cangjieHome)) return;

        const envPaths = Utility.getenvPaths();
        const envConfig: Record<string, string> = {};

        if (process.platform === 'linux' || process.platform === 'darwin') {
            envPaths.forEach(envLine => {
                const parts = envLine.replace('export ', '').split('=');
                const [key, value] = parts;
                if (checkIsValid(envConfig[key])) {
                    envConfig[key] = `${envConfig[key]}:${value}`;
                } else {
                    envConfig[key] = value;
                }
            });
            if (process.platform === 'linux' && envConfig.LD_LIBRARY_PATH !== undefined) {
                envConfig.LD_LIBRARY_PATH = envConfig.LD_LIBRARY_PATH.replace(/:\$\{LD_LIBRARY_PATH\}/g, '');
            }
            if (process.platform === 'darwin' && envConfig.DYLD_LIBRARY_PATH !== undefined) {
                envConfig.DYLD_LIBRARY_PATH = envConfig.DYLD_LIBRARY_PATH.replace(/:\$\{DYLD_LIBRARY_PATH\}/g, '');
            }
        } else {
            envPaths.forEach(envLine => {
                const parts = envLine.replace(/"/g, '').replace('set ', '').split('=');
                const [key, value] = parts;
                envConfig[key] = value;
            });
        }

        await Utility.addTerminalPathConfig(cangjieHome, envConfig);
    }

    /**
     * 向 VS Code 终端环境配置中添加 Cangjie 与 sense 路径
     */
    static async addTerminalPathConfig(sdkPath: string, envConfig: Record<string, string>): Promise<void> {
        const scriptEnv = await Utility.getScriptEnv();
        const osName = Utility.getOsSystem();
        const config = vscode.workspace.getConfiguration('terminal.integrated.env');
        const terminalEnv = JSON.parse(
            JSON.stringify(config.get<Record<string, string>>(osName))
        ) as Record<string, string>;

        terminalEnv.CANGJIE_HOME = sdkPath;
        const senseBinDir = Utility.getSenseBinDir();

        if (process.platform === 'linux') {
            const home = process.env.HOME;
            terminalEnv.CANGJIE_PATH = `${sdkPath}/bin:${sdkPath}/tools/bin${senseBinDir ? ':' + senseBinDir : ''}`;
            terminalEnv.CANGJIE_LD_LIBRARY_PATH = `${(scriptEnv.get('LD_LIBRARY_PATH') ?? '').replace(process.env.LD_LIBRARY_PATH ?? '', '')}:`;
            terminalEnv.JET_JRE_HOME = envConfig.JET_JRE_HOME;

            const ldRef = `\${config:terminal.integrated.env.${osName}.CANGJIE_LD_LIBRARY_PATH}`;
            if ('LD_LIBRARY_PATH' in terminalEnv) {
                if (!terminalEnv.LD_LIBRARY_PATH?.includes(ldRef)) {
                    terminalEnv.LD_LIBRARY_PATH = `${ldRef}${path.delimiter}${terminalEnv.LD_LIBRARY_PATH}`;
                }
            } else {
                terminalEnv.LD_LIBRARY_PATH = `${ldRef}${path.delimiter}\${env:LD_LIBRARY_PATH}`;
            }
        } else if (process.platform === 'win32') {
            terminalEnv.CANGJIE_PATH = `${envConfig.PATH}`
                .replace('%USERPROFILE%', process.env.USERPROFILE ?? '')
                .replace('%PATH%;', '');
        } else if (process.platform === 'darwin') {
            terminalEnv.CANGJIE_PATH = `${sdkPath}/bin:${sdkPath}/tools/bin${senseBinDir ? ':' + senseBinDir : ''}`;
            terminalEnv.CANGJIE_LD_LIBRARY_PATH = `${(scriptEnv.get('LD_LIBRARY_PATH') ?? '').replace(process.env.LD_LIBRARY_PATH ?? '', '')}:`;

            const dyldRef = `\${config:terminal.integrated.env.${osName}.CANGJIE_LD_LIBRARY_PATH}`;
            if ('DYLD_LIBRARY_PATH' in terminalEnv) {
                if (!terminalEnv.DYLD_LIBRARY_PATH?.includes(dyldRef)) {
                    terminalEnv.DYLD_LIBRARY_PATH = `${dyldRef}${path.delimiter}${terminalEnv.DYLD_LIBRARY_PATH}`;
                }
            } else {
                terminalEnv.DYLD_LIBRARY_PATH = `${dyldRef}${path.delimiter}\${env:DYLD_LIBRARY_PATH}`;
            }
        }

        const pathRef = `\${config:terminal.integrated.env.${osName}.CANGJIE_PATH}`;
        if ('PATH' in terminalEnv) {
            if (!terminalEnv.PATH?.includes(pathRef)) {
                terminalEnv.PATH = `${pathRef}${path.delimiter}${terminalEnv.PATH}`;
            }
        } else {
            terminalEnv.PATH = `${pathRef}${path.delimiter}\${env:PATH}`;
        }

        await config.update(osName, terminalEnv);
    }

    /** 获取终端集成环境的平台标识：linux/win32 对应 linux/windows，其余为 osx */
    static getOsSystem(): string {
        if (process.platform === 'linux') return 'linux';
        if (process.platform === 'win32') return 'windows';
        return 'osx';
    }

    // ── Validation helpers ──────────────────────────────────────────

    /** 类型安全的值有效性检查（TypeScript 类型守卫） */
    static checkIsValid<T>(value: T | null | undefined): value is T {
        if (value == null) return false;
        if (typeof value === 'string' && value === '') return false;
        if (typeof value === 'number' && value === 0) return false;
        if (typeof value === 'boolean' && !value) return false;
        return true;
    }

    /** Promise 形式的延迟等待 */
    static delay(ms: number): Promise<void> {
        return new Promise<void>(resolve => setTimeout(resolve, ms));
    }

    /** 递归检查目录树中是否存在路径超长问题 */
    static checkPathLength(dirPath: string): boolean {
        let valid = true;
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry);
            if (fullPath.length >= this.MAX_PATH_LENGTH) {
                valid = false;
                break;
            }
            if (fs.lstatSync(fullPath).isDirectory()) {
                if (!this.checkPathLength(fullPath)) {
                    valid = false;
                    break;
                }
            }
        }
        return valid;
    }

    // ── Message / charset helpers ───────────────────────────────────

    /** 将 SDK 工具输出的二进制数据转为正确编码的字符串 */
    static translateMessage(data: string): string {
        const buf = Buffer.from(data, 'binary');
        if (Utility.isUTF8(buf)) {
            return buf.toString('utf-8');
        }
        return new TextDecoder('gb2312').decode(new Uint8Array(buf));
    }

    /** 判断 Buffer 是否为合法的 UTF-8 编码 */
    static isUTF8(data: Buffer): boolean {
        let i = 0;
        while (i < data.length) {
            if (data[i] & 0x80) {
                if ((data[i] & 0xe0) === 0xc0) {
                    if ((data[i + 1] & 0xc0) !== 0x80) return false;
                    i += 2;
                } else if ((data[i] & 0xf0) === 0xe0) {
                    if ((data[i + 1] & 0xc0) !== 0x80 || (data[i + 2] & 0xc0) !== 0x80) return false;
                    i += 3;
                } else {
                    return false;
                }
            } else {
                i++;
            }
        }
        return true;
    }
}
