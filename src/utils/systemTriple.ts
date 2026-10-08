/** @file SystemTriple 匹配工具类 */

import { getArch, getOs } from "./commons";

/**
 * SystemTriple 匹配工具类
 * 用于判断给定的目标三元组（如 x86_64-linux）是否与当前系统架构和操作系统匹配
 */
export class SystemTriple {
    /** 架构名称映射表：将标准架构名映射为内部缩写 */
    private static archMap: { [key: string]: string } = {
        x86_64: "x86",
        aarch64: "arm",
    };

    /** 操作系统标识映射表：将不同格式的系统标识映射为内部缩写 */
    private static osTokens: { [key: string]: string } = {
        w64: "win",
        windows: "win",
        mingw32: "win",
        linux: "linux",
        darwin: "mac",
        macos: "mac",
        mac: "mac",
    };

    /**
     * 判断目标三元组是否匹配当前系统环境
     * @param e - 目标三元组字符串，格式如 "x86_64-linux"
     * @returns 是否匹配
     */
    static isMatching(e: string): boolean {
        const t = e.toLowerCase().split("-");
        if (t.length < 2) return false;

        const i = SystemTriple.archMap[t[0]];
        const r = t.slice(1).find((e) => e in SystemTriple.osTokens);
        if (!r) return false;

        const s = SystemTriple.osTokens[r];
        const a = getArch();
        const c = getOs();

        return !(!a || !c) && (i === a && s === c);
    }
}
