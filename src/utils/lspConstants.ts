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

/** 连续失败多少次后停止自动重启 */
export const MAX_RESTART_COUNT: number = 5;
/** 首次自动重启的等待时长 */
export const RESTART_DELAY_MS: number = 1000;
/** 自动重启等待时长的上限（指数退避） */
export const MAX_RESTART_DELAY_MS: number = 30000;
/** 稳定运行达到该时长后清零失败计数 */
export const STABLE_RESET_MS: number = 120000;
export const delay500: number = 500;
export const delay100: number = 100;

/** LSP 文档选择器使用的语言标识 */
export const cangjieLanguageId: string = 'Cangjie';

/** 服务端创建进度 token 的方法名 */
export const workDoneProgressCreateMethod: string = 'window/workDoneProgress/create';

/** 服务端上报进度的方法名 */
export const progressNotificationMethod: string = '$/progress';
