/** @file "Sense" 资源管理器树视图，创建并管理依赖树视图实例 */

import * as vscode from 'vscode';
import * as path from 'path';
import { LibTreeDataProvider, MODULE_ITEM } from './libTreeDataProvider';
import { NodeData } from './nodeData';
import { Utility } from '../utils/utility';
import { senseTomlName } from '../utils/constants';

/** 视图标识，与 package.json 中声明的 senseLibrary 对应 */
const VIEW_ID: string = 'senseLibrary';

/**
 * "Sense" 树视图管理器，负责树视图的创建、刷新与 sense.toml 的打开
 */
export class LibTreeView {
    static _instance: LibTreeView;

    private treeDataProvider: LibTreeDataProvider;
    private viewer: vscode.TreeView<NodeData>;

    /**
     * @param context - VS Code 扩展上下文
     */
    constructor(context: vscode.ExtensionContext) {
        LibTreeView._instance = this;
        this.treeDataProvider = new LibTreeDataProvider(context);

        this.viewer = vscode.window.createTreeView(VIEW_ID, {
            treeDataProvider: this.treeDataProvider,
            showCollapseAll: true,
        });
        context.subscriptions.push(this.viewer);

        context.subscriptions.push(
            vscode.commands.registerCommand('sense.require.refresh', () => {
                this.treeDataProvider.refresh();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('sense.manifest.open', (element?: NodeData) => {
                const projectDir = LibTreeView.resolveProjectDir(element);
                if (projectDir === '') {
                    Utility.noSenseConfig();
                    return;
                }
                const uri = vscode.Uri.file(path.join(projectDir, senseTomlName));
                vscode.commands.executeCommand('vscode.open', uri);
            })
        );
    }

    /** 重新读取清单并刷新依赖树 */
    refresh(): void {
        this.treeDataProvider.refresh();
    }

    /** 从节点向上定位所属工程模块目录，缺少节点时退回首个工程根目录 */
    private static resolveProjectDir(element?: NodeData): string {
        let node = element;
        while (node !== undefined) {
            if (node.viewItemName === MODULE_ITEM) {
                return node.path;
            }
            node = node.parent;
        }

        const roots = Utility.getProjectRoots();
        return roots.length > 0 ? roots[0] : '';
    }
}
