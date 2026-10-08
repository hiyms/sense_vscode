/** @file sense 清单与锁文件的数据模型，负责把依赖信息读成树视图可用的结构 */

import * as path from 'path';
import { Utility } from '../utils/utility';
import { senseTomlName, senseLockName } from '../utils/constants';

/** 一个依赖条目，来源可能是本地路径，也可能是 git 仓库 */
export interface SenseDependency {
    /** 依赖名，取自依赖表的键 */
    name: string;
    /** 依赖来源类型 */
    kind: 'path' | 'git';
    /** 本地路径；git 依赖时表示仓库内子目录 */
    path?: string;
    /** git 仓库地址 */
    git?: string;
    /** git 分支 */
    branch?: string;
    /** git 标签 */
    tag?: string;
    /** git 提交哈希（用户指定） */
    hash?: string;
    /** 启用的 feature 列表 */
    features?: string[];
    /** 是否为可选依赖 */
    optional?: boolean;
    /** 解析出的版本号，来自锁文件 */
    version?: string;
    /** 锁文件记录的提交号 */
    commitId?: string;
    /** git 简写中 `#dir=` 指定的仓库内子目录 */
    dir?: string;
    /** 依赖所属的表名，用于分组展示 */
    group?: string;
}

/** 依赖所在的表名，按此顺序分组展示 */
export const dependencyGroups: string[] = ['dependencies', 'script-dependencies'];

/** 判断值是否为普通对象（排除数组与 null） */
function isRecord(value: any): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 读取字符串字段，类型不符时返回 undefined */
function readString(value: any): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

/** 读取布尔字段，类型不符时返回 undefined */
function readBool(value: any): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

/** 读取字符串数组字段，类型不符时返回 undefined */
function readStringArray(value: any): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.filter((item): item is string => typeof item === 'string');
}

/** 返回仓库地址中路径部分的起始下标，避免把 userinfo 里的 `@` 当作分支分隔符 */
function pathStart(repo: string): number {
    const schemeSeparator = repo.indexOf('://');
    if (schemeSeparator >= 0) {
        const afterScheme = schemeSeparator + 3;
        const slash = repo.indexOf('/', afterScheme);
        return slash < 0 ? repo.length : slash;
    }
    const colon = repo.indexOf(':');
    return colon < 0 ? 0 : colon;
}

/** 解析 `git+` 之后的简写，形如 `<uri>[@<branch>][#dir=<subdir>]` */
function parseGitShorthand(body: string): { git: string; branch?: string; dir?: string } {
    let repo = body;
    let dir: string | undefined;

    const hash = repo.indexOf('#');
    if (hash >= 0) {
        for (const part of repo.substring(hash + 1).split('&')) {
            if (part.startsWith('dir=')) {
                dir = part.substring('dir='.length);
            }
        }
        repo = repo.substring(0, hash);
    }

    let branch: string | undefined;
    const start = pathStart(repo);
    const at = repo.lastIndexOf('@');
    if (at >= start && at + 1 < repo.length) {
        branch = repo.substring(at + 1);
        repo = repo.substring(0, at);
    }

    return { git: repo, branch, dir };
}

/** 解析字符串简写形式的依赖 */
function parseShorthandDependency(name: string, raw: string, group: string): SenseDependency {
    if (raw.startsWith('file:')) {
        return { name, kind: 'path', group, path: raw.substring('file:'.length) };
    }
    if (raw.startsWith('git+')) {
        const parsed = parseGitShorthand(raw.substring('git+'.length));
        return { name, kind: 'git', group, git: parsed.git, branch: parsed.branch, dir: parsed.dir };
    }
    return { name, kind: 'path', group, path: raw };
}

/** 解析表形式的依赖，来源由是否存在 git 字段决定 */
function parseTableDependency(name: string, raw: Record<string, any>, group: string): SenseDependency | undefined {
    const git = readString(raw.git);
    const localPath = readString(raw.path);

    if (git !== undefined) {
        return {
            name,
            kind: 'git',
            group,
            git,
            path: localPath,
            branch: readString(raw.branch),
            tag: readString(raw.tag),
            hash: readString(raw.hash),
            features: readStringArray(raw.features),
            optional: readBool(raw.optional),
        };
    }

    if (localPath !== undefined) {
        return {
            name,
            kind: 'path',
            group,
            path: localPath,
            features: readStringArray(raw.features),
            optional: readBool(raw.optional),
        };
    }

    return undefined;
}

/** 解析依赖表中的一个条目，无法识别来源时返回 undefined */
function parseDependency(name: string, raw: any, group: string): SenseDependency | undefined {
    if (typeof raw === 'string') {
        return parseShorthandDependency(name, raw, group);
    }
    if (isRecord(raw)) {
        return parseTableDependency(name, raw, group);
    }
    return undefined;
}

/** 读取工程根目录下 sense.toml 声明的全部依赖，按表名分组标记 */
export function readManifestDependencies(projectDir: string): SenseDependency[] {
    const content = Utility.getTomlContent(path.join(projectDir, senseTomlName));
    const result: SenseDependency[] = [];

    for (const group of dependencyGroups) {
        const table = content[group];
        if (!isRecord(table)) continue;
        for (const name of Object.keys(table)) {
            const dependency = parseDependency(name, table[name], group);
            if (dependency !== undefined) {
                result.push(dependency);
            }
        }
    }

    return result;
}

/** 普通依赖与构建脚本依赖各自的清单表与锁文件表 */
const LOCK_TABLES: Array<{ group: string; table: string }> = [
    { group: 'dependencies', table: 'requires' },
    { group: 'script-dependencies', table: 'script-requires' },
];

/**
 * 读取 sense.lock 的 `[requires]` 与 `[script-requires]`，把版本、来源路径、
 * 仓库地址与提交号合并到 sense.toml 声明的对应依赖上。
 */
export function readLockDependencies(projectDir: string): SenseDependency[] {
    const dependencies = readManifestDependencies(projectDir);
    const content = Utility.getTomlContent(path.join(projectDir, senseLockName));

    const byGroupAndName = new Map<string, SenseDependency>();
    for (const dependency of dependencies) {
        byGroupAndName.set(`${dependency.group ?? ''}|${dependency.name}`, dependency);
    }

    for (const { group, table } of LOCK_TABLES) {
        const requires = content[table];
        if (!isRecord(requires)) continue;

        for (const name of Object.keys(requires)) {
            const dependency = byGroupAndName.get(`${group}|${name}`);
            if (dependency === undefined) continue;
            const entry = requires[name];
            if (!isRecord(entry)) continue;

            const version = readString(entry.version);
            if (version !== undefined) {
                dependency.version = version;
            }

            if (dependency.kind === 'git') {
                const git = readString(entry.git);
                const commitId = readString(entry.commitId);
                if (git !== undefined) dependency.git = git;
                if (commitId !== undefined) dependency.commitId = commitId;
            } else {
                const localPath = readString(entry.path);
                if (localPath !== undefined) dependency.path = localPath;
            }
        }
    }

    return dependencies;
}

/** 读取工程根目录的模块名、版本与工作区成员目录 */
export function readManifestInfo(projectDir: string): { name: string; version: string; members: string[] } {
    const content = Utility.getTomlContent(path.join(projectDir, senseTomlName));
    const module = content['module'];

    const name = isRecord(module) && typeof module.name === 'string'
        ? module.name
        : path.basename(projectDir);
    const version = isRecord(module) && typeof module.version === 'string' ? module.version : '';

    const workspace = content['workspace'];
    const members = isRecord(workspace) ? (readStringArray(workspace.member) ?? []) : [];

    return { name, version, members };
}
