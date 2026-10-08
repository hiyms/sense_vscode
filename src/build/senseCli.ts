/** @file sense 命令行构造，把各功能选项拼装成 sense 子命令 */

import * as path from 'path';
import * as fs from 'fs';
import { Utility } from '../utils/utility';
import { checkIsValid, getExecSuffix } from '../utils/commons';
import { senseTomlName } from '../utils/constants';

/** 构建与测试共用的选项 */
export interface BuildOptions {
    release?: boolean;
    targetDir?: string;
    target?: string;
    sysroot?: string;
    jobs?: string;
    features?: string[];
    disableDefaultFeatures?: boolean;
    packages?: string[];
    workspace?: boolean;
    manifestPath?: string;
}

/** sense test 专有选项 */
export interface TestOptions extends BuildOptions {
    filter?: string;
    includeTags?: string[];
    excludeTags?: string[];
    timeoutEach?: string;
    parallel?: string;
    coverage?: boolean;
    noRun?: boolean;
    skipBuild?: boolean;
}

/** 构建配置名，dev 对应 target/debug，release 对应 target/release */
export type Profile = 'dev' | 'release';

/**
 * sense 命令行构造工具类
 */
export class SenseCli {
    /** 按平台给单个参数加引号 */
    static quote(arg: string): string {
        if (process.platform === 'win32') {
            return `"${arg}"`;
        }
        return `'${arg.replace(/'/g, `'\\''`)}'`;
    }

    /** sense 可执行文件的绝对路径，找不到时抛出异常 */
    static executable(): string {
        const executable = Utility.findSenseExecutable();
        if (executable === '') {
            throw new Error(
                'The sense executable was not found. Set sense.executablePath or add sense to PATH.'
            );
        }
        return executable;
    }

    /** 拼装通用选项 */
    private static appendCommon(args: string[], options: BuildOptions): void {
        if (options.release) args.push('--release');
        if (checkIsValid(options.targetDir)) args.push('--target-dir', SenseCli.quote(options.targetDir!));
        if (checkIsValid(options.target)) args.push('--target', SenseCli.quote(options.target!));
        if (checkIsValid(options.sysroot)) args.push('--sysroot', SenseCli.quote(options.sysroot!));
        if (checkIsValid(options.jobs)) args.push('-j', options.jobs!);
        for (const feature of options.features ?? []) {
            if (feature !== '') args.push('--feature', feature);
        }
        if (options.disableDefaultFeatures) args.push('--disable-default-features');
        for (const pkg of options.packages ?? []) {
            if (pkg !== '') args.push('-p', pkg);
        }
        if (options.workspace) args.push('--workspace');
        if (checkIsValid(options.manifestPath)) args.push('--manifest-path', SenseCli.quote(options.manifestPath!));
    }

    /** sense build 命令 */
    static buildCommand(options: BuildOptions = {}): string {
        const args = ['build'];
        SenseCli.appendCommon(args, options);
        return `${SenseCli.quote(SenseCli.executable())} ${args.join(' ')}`.trim();
    }

    /** sense test 命令 */
    static testCommand(options: TestOptions = {}): string {
        const args = ['test'];
        SenseCli.appendCommon(args, options);
        if (checkIsValid(options.filter)) args.push('--filter', SenseCli.quote(options.filter!));
        for (const tag of options.includeTags ?? []) {
            if (tag !== '') args.push('--include-tags', tag);
        }
        for (const tag of options.excludeTags ?? []) {
            if (tag !== '') args.push('--exclude-tags', tag);
        }
        if (checkIsValid(options.timeoutEach)) args.push('--timeout-each', options.timeoutEach!);
        if (checkIsValid(options.parallel)) args.push('--parallel', options.parallel!);
        if (options.coverage) args.push('--coverage');
        if (options.noRun) args.push('--no-run');
        if (options.skipBuild) args.push('--skip-build');
        return `${SenseCli.quote(SenseCli.executable())} ${args.join(' ')}`.trim();
    }

    /** sense clean 命令 */
    static cleanCommand(options: BuildOptions = {}): string {
        const args = ['clean'];
        if (options.release) {
            args.push('--release');
        }
        if (checkIsValid(options.target)) args.push('--target', SenseCli.quote(options.target!));
        if (checkIsValid(options.targetDir)) args.push('--target-dir', SenseCli.quote(options.targetDir!));
        if (checkIsValid(options.manifestPath)) args.push('--manifest-path', SenseCli.quote(options.manifestPath!));
        return `${SenseCli.quote(SenseCli.executable())} ${args.join(' ')}`.trim();
    }

    /** sense fetch 命令 */
    static fetchCommand(options: BuildOptions = {}): string {
        const args = ['fetch'];
        if (checkIsValid(options.jobs)) args.push('-j', options.jobs!);
        if (checkIsValid(options.manifestPath)) args.push('--manifest-path', SenseCli.quote(options.manifestPath!));
        return `${SenseCli.quote(SenseCli.executable())} ${args.join(' ')}`.trim();
    }

    /** sense update 命令 */
    static updateCommand(options: BuildOptions = {}): string {
        const args = ['update'];
        if (checkIsValid(options.jobs)) args.push('-j', options.jobs!);
        if (checkIsValid(options.manifestPath)) args.push('--manifest-path', SenseCli.quote(options.manifestPath!));
        return `${SenseCli.quote(SenseCli.executable())} ${args.join(' ')}`.trim();
    }

    /** sense docs 命令 */
    static docsCommand(options: BuildOptions & { frontend?: string } = {}): string {
        const args = ['docs'];
        if (options.release) args.push('--release');
        for (const pkg of options.packages ?? []) {
            if (pkg !== '') args.push('-p', pkg);
        }
        if (options.workspace) args.push('--workspace');
        if (checkIsValid(options.manifestPath)) args.push('--manifest-path', SenseCli.quote(options.manifestPath!));
        if (checkIsValid(options.targetDir)) args.push('--target-dir', SenseCli.quote(options.targetDir!));
        if (checkIsValid(options.frontend)) args.push('--frontend', SenseCli.quote(options.frontend!));
        return `${SenseCli.quote(SenseCli.executable())} ${args.join(' ')}`.trim();
    }

    /** sense locate-project 命令 */
    static locateProjectCommand(options: BuildOptions = {}): string {
        const args = ['locate-project'];
        if (options.workspace) args.push('--workspace');
        if (checkIsValid(options.manifestPath)) args.push('--manifest-path', SenseCli.quote(options.manifestPath!));
        return `${SenseCli.quote(SenseCli.executable())} ${args.join(' ')}`.trim();
    }

    /**
     * 读取工程清单里的模块名与版本
     *
     * 返回 { name, version }，清单缺失或没有 [module] 时 name 为空串。
     */
    static readModuleInfo(projectDir: string): { name: string; version: string } {
        const manifestPath = path.join(projectDir, senseTomlName);
        if (!fs.existsSync(manifestPath)) {
            return { name: '', version: '' };
        }
        const content = Utility.getTomlContent(manifestPath);
        const moduleTable = Utility.getTomlValueByTreeKeys(['module'], content, false) as Record<string, any>;
        return {
            name: (moduleTable?.name as string) ?? '',
            version: (moduleTable?.version as string) ?? '',
        };
    }

    /** 计算构建产物的可执行文件路径 */
    static getBinaryPath(projectDir: string, moduleName: string, profile: Profile, targetDir?: string): string {
        const root = checkIsValid(targetDir) ? targetDir! : path.join(projectDir, 'target');
        const profileDir = profile === 'release' ? 'release' : 'debug';
        return path.join(root, profileDir, 'bin', `${moduleName}${getExecSuffix()}`);
    }
}
