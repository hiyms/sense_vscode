/** @file 项目输出类型枚举与可选列表 */

/** 项目输出类型枚举 */
export enum ProjectType {
    EXECUTABLE = 'executable',
    LIBRARY = 'library',
}

/** 单个输出类型选项，供 QuickPick 与 WebView 使用 */
export interface ProjectTypeOption {
    displayName: string;
    type: ProjectType;
}

/** 可选项目输出类型列表 */
export const projectTypes: ProjectTypeOption[] = [
    {
        displayName: 'Create Executable Output Cangjie project',
        type: ProjectType.EXECUTABLE,
    },
    {
        displayName: 'Create Library Output Cangjie project',
        type: ProjectType.LIBRARY,
    },
];
