/** @file 项目创建流程控制器，通过 QuickPick 向导引导用户创建 sense 工程 */

import * as vscode from 'vscode';
import { Utility } from '../utils/utility';
import { OutputHelper } from '../utils/outputHelper';
import { projectTypes, ProjectType } from './projectTypes';
import { CreateProjectUtils } from './createProjectUtils';

/**
 * 项目创建流程控制器，通过 QuickPick 向导选择输出类型、目录与工程名后完成创建
 */
export class ProjectController implements vscode.Disposable {
    private context: vscode.ExtensionContext;
    private disposable: vscode.Disposable;

    /**
     * 注册 "sense.project.create" 命令，支持 Linux/Windows/macOS
     * @param context - VS Code 扩展上下文
     */
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.disposable = vscode.Disposable.from(
            vscode.commands.registerCommand('sense.project.create', () => {
                if (
                    process.platform === 'linux' ||
                    process.platform === 'win32' ||
                    process.platform === 'darwin'
                ) {
                    this.createSenseProject().catch((err: any) => {
                        OutputHelper.appendLine(err);
                    });
                } else {
                    vscode.window.showInformationMessage(
                        'This command applies only to Linux, Windows and Mac.'
                    );
                }
            })
        );
    }

    /** 销毁命令注册 */
    dispose(): void {
        this.disposable.dispose();
    }

    /** 选择输出类型后进入工程位置与名称的填写 */
    private async createSenseProject(): Promise<void> {
        const typeItems = projectTypes.map((item) => ({
            label: item.displayName,
            type: item.type,
        }));

        const selectedType = await vscode.window.showQuickPick(typeItems, {
            ignoreFocusOut: true,
            placeHolder: 'Select the output type',
        });

        if (!Utility.checkIsValid(selectedType)) return;

        await this.startProjectCreation(selectedType!.type);
    }

    /** 选择项目路径和名称后执行创建 */
    private async startProjectCreation(projectType: ProjectType): Promise<void> {
        const selectedPath = await CreateProjectUtils.selectPath();
        if (!Utility.checkIsValid(selectedPath)) return;

        const existingFolders = Utility.getBasePathAllFolders(selectedPath!);

        const projectName = await vscode.window.showInputBox({
            prompt: 'Input a Cangjie project name.',
            ignoreFocusOut: true,
            validateInput: async (input: string) => {
                if (input === '' || input == null || !input.match(/^[^*~\\/]+$/)) {
                    return 'Please input a valid project name.';
                }
                if (existingFolders.includes(input)) {
                    return 'Repeats file name.';
                }
                return '';
            },
        });

        if (!Utility.checkIsValid(projectName)) return;

        await CreateProjectUtils.createProject(projectType, selectedPath!, projectName!);
    }
}
