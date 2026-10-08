/** @file LSP 常量定义 */

/** LSP 服务状态枚举 */
export enum State {
    Stopped = 1,
    Starting = 2,
    Running = 3,
    Updating = 4,
    Error = 5,
    Building = 6,
}

export const MAX_RESTART_COUNT: number = 5;
export const RESTART_DELAY_MS: number = 2000;
export const RESTART_WINDOW_MS: number = 5 * 60 * 1000;
export const delay500: number = 500;
export const delay100: number = 100;

/** LSP 文档选择器使用的语言标识 */
export const cangjieLanguageId: string = 'Cangjie';
