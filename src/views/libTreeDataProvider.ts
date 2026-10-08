/** @file 依赖树视图数据提供器，从 sense.toml 与 sense.lock 生成树节点 */

import * as vscode from 'vscode';
import * as path from 'path';
import { NodeData } from './nodeData';
import {
    SenseDependency,
    dependencyGroups,
    readLockDependencies,
    readManifestInfo,
} from './manifestModel';
import { Utility } from '../utils/utility';

/** 工程模块节点类型 */
export const MODULE_ITEM: string = 'senseModule';
/** 依赖分组节点类型 */
export const GROUP_ITEM: string = 'senseRequireGroup';
/** 依赖条目节点类型 */
export const REQUIRE_ITEM: string = 'senseRequireItem';

/** 版本号显示为提交号前 8 位，避免过长的哈希撑满视图 */
const COMMIT_DISPLAY_LENGTH: number = 8;

/** 依赖条目的展示文本，优先显示版本，其次显示提交号或来源 */
function formatDependencyDetail(dependency: SenseDependency): string {
    const parts: string[] = [];
    if (dependency.version !== undefined && dependency.version !== '') {
        parts.push(dependency.version);
    }

    if (dependency.kind === 'git') {
        if (dependency.commitId !== undefined && dependency.commitId !== '') {
            parts.push(dependency.commitId.substring(0, COMMIT_DISPLAY_LENGTH));
        } else if (dependency.branch !== undefined && dependency.branch !== '') {
            parts.push(dependency.branch);
        } else if (dependency.tag !== undefined && dependency.tag !== '') {
            parts.push(dependency.tag);
        } else if (dependency.git !== undefined) {
            parts.push(dependency.git);
        }
    } else if (dependency.path !== undefined) {
        parts.push(dependency.path);
    }

    return parts.join('  ');
}

/** 依赖条目的悬停信息，列出全部来源字段 */
function formatDependencyTooltip(dependency: SenseDependency): string {
    const lines: string[] = [`${dependency.name} (${dependency.kind})`];

    if (dependency.version !== undefined) lines.push(`version: ${dependency.version}`);
    if (dependency.kind === 'git') {
        if (dependency.git !== undefined) lines.push(`git: ${dependency.git}`);
        if (dependency.branch !== undefined) lines.push(`branch: ${dependency.branch}`);
        if (dependency.tag !== undefined) lines.push(`tag: ${dependency.tag}`);
        if (dependency.hash !== undefined) lines.push(`hash: ${dependency.hash}`);
        if (dependency.dir !== undefined) lines.push(`dir: ${dependency.dir}`);
        if (dependency.commitId !== undefined) lines.push(`commitId: ${dependency.commitId}`);
    } else if (dependency.path !== undefined) {
        lines.push(`path: ${dependency.path}`);
    }
    if (dependency.features !== undefined && dependency.features.length > 0) {
        lines.push(`features: ${dependency.features.join(', ')}`);
    }
    if (dependency.optional === true) {
        lines.push('optional: true');
    }

    return lines.join('\n');
}

/**
 * 依赖树视图数据提供器，按工程模块、依赖分组、依赖条目的层次组织节点
 */
export class LibTreeDataProvider implements vscode.TreeDataProvider<NodeData> {
    private context: vscode.ExtensionContext;
    private _onDidChangeTreeData: vscode.EventEmitter<NodeData | undefined | null | void>;
    readonly onDidChangeTreeData: vscode.Event<NodeData | undefined | null | void>;

    /**
     * @param context - VS Code 扩展上下文
     */
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this._onDidChangeTreeData = new vscode.EventEmitter<NodeData | undefined | null | void>();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    /** @param element - 节点数据 */
    getTreeItem(element: NodeData): vscode.TreeItem {
        return element;
    }

    /**
     * 获取子节点。根层返回全部工程模块，模块层返回依赖分组，分组层返回依赖条目
     * @param element - 父节点，为空时返回根节点
     */
    getChildren(element?: NodeData): vscode.ProviderResult<NodeData[]> {
        if (!Utility.isCangjieProject()) {
            return [];
        }

        if (element === undefined) {
            return this.createModuleNodes();
        }

        if (element.viewItemName === MODULE_ITEM) {
            return this.createGroupNodes(element);
        }

        if (element.viewItemName === GROUP_ITEM) {
            return this.createDependencyNodes(element);
        }

        return [];
    }

    /** 创建工程模块节点：每个工作区根目录及其声明的成员目录各一个 */
    private createModuleNodes(): NodeData[] {
        const result: NodeData[] = [];
        const seen = new Set<string>();

        for (const root of Utility.getProjectRoots()) {
            this.pushModuleNode(result, seen, root);
            for (const member of readManifestInfo(root).members) {
                this.pushModuleNode(result, seen, path.resolve(root, member));
            }
        }

        return result;
    }

    /** 添加一个工程模块节点，目录重复时跳过 */
    private pushModuleNode(result: NodeData[], seen: Set<string>, projectDir: string): void {
        if (seen.has(projectDir)) return;
        seen.add(projectDir);

        const info = readManifestInfo(projectDir);
        const label = info.version === '' ? info.name : `${info.name} ${info.version}`;
        result.push(
            new NodeData(
                { label, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed },
                MODULE_ITEM,
                projectDir,
                undefined
            )
        );
    }

    /** 创建某个工程模块下的依赖分组节点，空分组不展示 */
    private createGroupNodes(moduleNode: NodeData): NodeData[] {
        const counts = new Map<string, number>();
        for (const dependency of readLockDependencies(moduleNode.path)) {
            const group = dependency.group ?? dependencyGroups[0];
            counts.set(group, (counts.get(group) ?? 0) + 1);
        }

        const result: NodeData[] = [];
        for (const group of dependencyGroups) {
            const count = counts.get(group);
            if (count === undefined || count === 0) continue;
            result.push(
                new NodeData(
                    { label: group, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed },
                    GROUP_ITEM,
                    `${count}`,
                    moduleNode
                )
            );
        }

        return result;
    }

    /** 创建某个分组下的依赖条目节点 */
    private createDependencyNodes(groupNode: NodeData): NodeData[] {
        const moduleNode = groupNode.parent;
        if (moduleNode === undefined) {
            return [];
        }

        const result: NodeData[] = [];
        for (const dependency of readLockDependencies(moduleNode.path)) {
            if ((dependency.group ?? dependencyGroups[0]) !== groupNode.label) continue;

            const node = new NodeData(
                { label: dependency.name, collapsibleState: vscode.TreeItemCollapsibleState.None },
                REQUIRE_ITEM,
                formatDependencyDetail(dependency),
                groupNode
            );
            node.tooltip = formatDependencyTooltip(dependency);
            result.push(node);
        }

        return result;
    }

    /**
     * 刷新树节点。若指定元素则展开后刷新
     * @param element - 需要刷新的节点
     */
    refresh(element?: NodeData): void {
        if (Utility.checkIsValid(element)) {
            element!.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
        this._onDidChangeTreeData.fire(element);
    }
}
