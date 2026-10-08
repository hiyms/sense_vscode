/**
 * @file 仓颉 VS Code 扩展的公共工具函数集
 *
 * 提供跨模块使用的基础功能：操作系统检测、路径处理、SDK 配置读取、
 * 有效性校验等。本文件是整个扩展最底层的依赖模块。
 */

import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import * as crypto from 'crypto';

/** 当前扩展的 package.json 内容 */
export const packageJson = vscode.extensions.getExtension('sense.sense')?.packageJSON;

/** 获取当前操作系统简称，用于路径与可执行文件后缀等平台相关逻辑 */
export function getOs(): string {
    switch (os.platform()) {
        case 'win32':
            return 'win';
        case 'darwin':
            return 'mac';
        default:
            return 'linux';
    }
}

/** 获取 CPU 架构（arm 或 x86） */
export function getArch(): string {
    switch (os.arch()) {
        case 'arm':
        case 'arm64':
            return 'arm';
        default:
            return 'x86';
    }
}

/** 获取可执行文件后缀：Windows 为 .exe，其他平台为空 */
export function getExecSuffix(): string {
    return getOs() === 'win' ? '.exe' : '';
}

/**
 * 在系统 PATH 环境变量中搜索指定的可执行文件
 *
 * Windows 下扫描 PATH 目录，Unix 下使用 which 命令。
 */
export async function findPathInSystemEnv(target: string): Promise<string[]> {
    if (getOs() === 'win') {
        const pathEnv = process.env.Path;
        if (!pathEnv) return [];
        const results: string[] = [];
        for (const dir of pathEnv.split(';')) {
            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch (e) {
                continue;
            }
            for (const entry of entries) {
                if (entry.isFile() && path.basename(entry.name) === target) {
                    results.push(path.join(dir, entry.name));
                }
            }
        }
        return results;
    }

    try {
        const output = await execNativeCommand(`which ${target}`);
        if (output && output.length > 0) {
            return [trimSpacesAndLineBreaks(output)];
        }
    } catch (e) {
        return [];
    }
    return [];
}

/**
 * 递归搜索目录中的仓颉源文件（.cj）
 *
 * @param dirPath - 搜索起始路径（可以是文件或目录）
 */
export function searchCangjieSourceFile(dirPath: string): string[] {
    if (fs.statSync(dirPath).isFile() && isCjSourceFile(dirPath)) {
        return [dirPath];
    }
    const results: string[] = [];
    if (fs.statSync(dirPath).isDirectory()) {
        searchDirectory(dirPath, results);
    }
    return results;
}

function searchDirectory(dirPath: string, results: string[]): void {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (e) {
        return;
    }
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchDirectory(fullPath, results);
        } else if (stat.isFile() && isCjSourceFile(entry.name)) {
            results.push(fullPath);
        }
    }
}

/** 统一路径分隔符为正斜杠 */
export function unifySlashOfPath(p: string): string {
    let result = p;
    if (path.sep === '\\') {
        result = result.replace(/\\/g, '/');
    }
    return result;
}

/** 将 VS Code 的 Thenable 转换为标准 Promise */
export function toPromise<T>(thenable: Thenable<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        thenable.then(resolve, reject);
    });
}

/** 异步延迟工具函数 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** 安全检查文件是否存在（排除目录） */
export function isExistingFile(filePath: string): boolean {
    return fs.existsSync(filePath) && fs.lstatSync(filePath).isFile();
}

/** 设置文件可执行权限（Unix），检查并修复权限位为 550 */
export function setExecPermission(filePath: string): void {
    fs.stat(filePath, (err, stats) => {
        if (err) throw err;
        const mode = Array.from(stats.mode.toString(2));
        if (mode[7] === '1' && mode[9] === '1' && mode[10] === '1' && mode[12] === '1') {
            return;
        }
        fs.chmodSync(filePath, '550');
    });
}

/** 从函数创建 Disposable 对象 */
export function createDisposable(disposeFn: () => void): vscode.Disposable {
    return vscode.Disposable.from({ dispose: disposeFn });
}

/** 生成指定长度的随机字符串，使用加密安全的随机源 */
export function randomStr(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(length);
    const result = new Array(length);
    for (let i = 0; i < length; i++) {
        result[i] = chars[bytes[i] % 62];
    }
    return result.join('');
}

/** 判断文件名是否为仓颉源文件（.cj 后缀） */
export function isCjSourceFile(fileName: string): boolean {
    return fileName.endsWith('.cj');
}

/** 首字母大写 */
export function firstToUpperCase(str: string): string {
    if (str.length === 0) return str;
    return str.charAt(0).toUpperCase() + str.substring(1);
}

/** 获取 CPU 核心数，用于确定并行编译任务数 */
export function getNumberOfCores(): number {
    return os.cpus().length;
}

/**
 * 执行原生 shell 命令并返回 stdout
 *
 * stderr 有输出时视为失败，因为工具链的错误信息都输出到 stderr。
 */
export function execNativeCommand(command: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        child_process.exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else if (stderr && stderr.length > 0) {
                reject(stderr);
            } else {
                resolve(stdout);
            }
        });
    });
}

/** 使用 spawn 执行原生进程，返回进程退出码 */
export function execNativeProcess(command: string, args: string[]): Promise<number | undefined> {
    return new Promise<number | undefined>((resolve, reject) => {
        const proc = child_process.spawn(command, args);
        proc.on('error', err => reject(err));
        proc.on('exit', code => {
            if (code === 0) {
                resolve(code);
            } else {
                reject(code);
            }
        });
    });
}

/** 去除字符串首尾空白字符 */
export function trimSpacesAndLineBreaks(str: string): string {
    return str.replace(/^\s+|\s+$/g, '');
}

/** 去除字符串开头的所有空格 */
export function trimAllStartSpace(str: string): string {
    let result = str;
    while (result.charAt(0) === ' ') {
        result = result.substring(1);
    }
    return result;
}

/** 获取分隔符之后的部分 */
export function getEndString(str: string, delimiter: string): string {
    const index = str.lastIndexOf(delimiter);
    return str.substring(index + 1);
}

/** 获取分隔符之前的部分 */
export function getStartString(str: string, delimiter: string): string {
    const index = str.lastIndexOf(delimiter);
    return index === -1 ? str : str.substring(0, index);
}

/** 检查字段值非空且去除空白后不为空字符串 */
export function checkFieldNotBlank(value: any): boolean {
    return checkIsValid(value) && trimSpacesAndLineBreaks(value) !== '';
}

/** 检查字段值不为 null/undefined */
export function checkFieldNotEmpty(value: any): boolean {
    return !isEmpty(value);
}

/** 检查值是否为 null 或 undefined */
export function isEmpty(value: any): boolean {
    return value == null;
}

/**
 * 检查值是否有效
 *
 * 将空字符串、0、false 视为无效值，用于配置字段的严格校验。
 */
export function checkIsValid(value: any): boolean {
    if (value == null) return false;
    if (typeof value === 'string' && value === '') return false;
    if (typeof value === 'number' && value === 0) return false;
    if (typeof value === 'boolean' && !value) return false;
    return true;
}

/** 将字符串中的 ${ENV_VAR} 占位符替换为实际环境变量值 */
export function replaceWithEnv(str: string): string {
    if (!checkIsValid(str)) return '';
    return str.replace(/\${(?<envVar>\w+)}/g, (match, envVar: string) => {
        const value = process.env[envVar]?.replace(/\\/g, '/');
        return value !== undefined ? value : '';
    });
}

/**
 * 获取仓颉 SDK 路径
 *
 * 优先读取 sense.sdkPath 设置，未设置时使用 CANGJIE_HOME 环境变量。
 * 路径未配置或不存在时抛出异常。
 */
export function getSdkPath(): string {
    const configured = vscode.workspace.getConfiguration('sense').get<string>('sdkPath');
    const sdkPath = checkIsValid(configured) ? configured! : (process.env.CANGJIE_HOME ?? '');
    if (!sdkPath || !fs.existsSync(sdkPath)) {
        throw new Error('The Cangjie SDK path has not been configured properly. Please configure it first.');
    }
    return sdkPath;
}
