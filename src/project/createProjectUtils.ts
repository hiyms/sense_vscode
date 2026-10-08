/** @file 项目创建工具类，负责路径选择与 sense 工程文件生成 */

import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Utility } from '../utils/utility';
import { senseTomlName } from '../utils/constants';
import { ProjectType } from './projectTypes';

/** 可执行输出类型的入口文件名 */
const executableEntryFile = 'main.cj';
/** 库输出类型的示例源文件名 */
const libraryEntryFile = 'lib.cj';

/**
 * 项目创建工具类，生成 sense 清单与起始源码，并写入 SDK 路径设置
 */
export class CreateProjectUtils {
    /** 图形化创建面板实例 */
    static panel: vscode.WebviewPanel | undefined;

    /**
     * 打开系统文件夹选择对话框
     * @returns 用户选择的路径，取消则返回 undefined
     */
    static selectPath(): Promise<string | undefined> {
        return new Promise<string | undefined>((resolve) => {
            const defaultFolder = Utility.getDefaultWorkspaceFolder();
            let defaultUri: vscode.Uri | undefined;

            if (Utility.checkIsValid(defaultFolder)) {
                defaultUri = vscode.Uri.file(path.resolve(defaultFolder.uri.fsPath, '..'));
            }

            vscode.window.showOpenDialog({
                defaultUri,
                canSelectFiles: false,
                canSelectFolders: true,
                openLabel: 'Select the project location',
            }).then((result) => {
                if (Utility.checkIsValid(result) && result!.length !== 0) {
                    resolve(result![0].fsPath);
                } else {
                    resolve(undefined);
                }
            });
        });
    }

    /**
     * 创建 sense 工程：写出 sense.toml、起始源码与 .vscode/settings.json，然后打开工程目录
     * @param projectType - 项目输出类型
     * @param selectedPath - 项目父目录路径
     * @param projectName - 项目名称
     */
    static async createProject(
        projectType: ProjectType,
        selectedPath: string,
        projectName: string
    ): Promise<void> {
        const projectDir = path.join(selectedPath, projectName);
        try {
            fs.mkdirSync(projectDir);
            const srcDir = path.join(projectDir, 'src');
            fs.mkdirSync(srcDir);

            fs.writeFileSync(
                path.join(projectDir, senseTomlName),
                `[module]\nname = "${projectName}"\nversion = "0.1.0"\n`
            );
            fs.writeFileSync(
                path.join(srcDir, projectType === ProjectType.EXECUTABLE ? executableEntryFile : libraryEntryFile),
                CreateProjectUtils.buildSourceContent(projectType, projectName)
            );
            CreateProjectUtils.writeSdkSetting(projectDir);
        } catch (e) {
            vscode.window.showErrorMessage('Failed to create the file. Please try again');
            return;
        }

        try {
            await vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.file(projectDir),
                true
            );
            CreateProjectUtils.closePanel();
            vscode.window.showInformationMessage('Created successfully');
        } catch (e) {
            vscode.window.showErrorMessage('Failed to open the file. Please open the file again');
        }
    }

    /** 关闭图形化创建面板并清理引用 */
    static closePanel(): void {
        if (Utility.checkIsValid(CreateProjectUtils.panel)) {
            CreateProjectUtils.panel!.dispose();
            CreateProjectUtils.panel = undefined;
        }
    }

    /** 按输出类型生成起始源码内容 */
    private static buildSourceContent(projectType: ProjectType, projectName: string): string {
        if (projectType === ProjectType.EXECUTABLE) {
            return `package ${projectName}\n\nmain(): Int64 {\n    println("Hello, World!")\n    return 0\n}\n`;
        }
        return `package ${projectName}\n\npublic func add(left: Int64, right: Int64): Int64 {\n    return left + right\n}\n`;
    }

    /** 把已配置的 sense.sdkPath 写入工程的 .vscode/settings.json，未配置时跳过 */
    private static writeSdkSetting(projectDir: string): void {
        const sdkPath = vscode.workspace.getConfiguration('sense').get<string>('sdkPath');
        if (!Utility.checkIsValid(sdkPath)) return;

        const vscodeDir = path.join(projectDir, '.vscode');
        const settingsPath = path.join(vscodeDir, 'settings.json');
        fs.mkdirSync(vscodeDir, { recursive: true });

        let settings: Record<string, any> = {};
        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        }
        settings['sense.sdkPath'] = sdkPath;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, '\t'));
    }
}
