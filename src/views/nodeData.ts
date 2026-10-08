/** @file 树视图节点数据结构，封装 TreeItem 并扩展路径与父子关系信息 */

import * as vscode from 'vscode';

/**
 * 树节点数据类，继承 TreeItem 并附加节点类型、关联路径与父节点引用
 */
export class NodeData extends vscode.TreeItem {
    /**
     * @param item - 节点标签与折叠状态
     * @param viewItemName - 节点类型标识，用于区分模块、分组与依赖
     * @param path - 节点关联的路径或展示文本，用作 description 与 tooltip
     * @param parent - 父节点引用
     * @param command - 点击节点时触发的命令
     */
    constructor(
        item: { label: string; collapsibleState: vscode.TreeItemCollapsibleState },
        public viewItemName: string,
        public path: string,
        public parent: NodeData | undefined,
        command?: vscode.Command
    ) {
        super(item.label, item.collapsibleState);
        this.contextValue = this.viewItemName;
        this.tooltip = this.path;
        this.description = this.path;
        this.command = command;
    }
}
