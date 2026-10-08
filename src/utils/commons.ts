/**
 * @file 仓颉 VS Code 扩展的公共工具函数集
 */

import * as os from 'os';

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

/** 获取可执行文件后缀：Windows 为 .exe，其他平台为空 */
export function getExecSuffix(): string {
    return getOs() === 'win' ? '.exe' : '';
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
