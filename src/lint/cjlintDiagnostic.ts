/** @file cjlint 诊断信息管理，将检查结果转换为 VS Code Diagnostic 并展示 */

import * as vscode from 'vscode';
import { Utility } from '../utils/utility';

/** cjlint 诊断项结构 */
interface CjlintDiagnosticItem {
    file: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    description: string;
    defectLevel: string;
    defectType: string;
}

/** cjlint 诊断管理类，负责管理和展示代码检查的诊断结果 */
export class CjlintDiagnostic {
    static _instance: CjlintDiagnostic | undefined;
    private cjlintDiagnostics: vscode.DiagnosticCollection;

    constructor() {
        this.cjlintDiagnostics = vscode.languages.createDiagnosticCollection("cjlintDiagnostics");
    }

    /** 处理 cjlint 检查结果，转换为 VS Code 诊断项并设置到对应文件 */
    handleCjlintResult(result: CjlintDiagnosticItem[]): void {
        this.clearCjlintResult();

        if (result instanceof Array) {
            result.forEach((item: CjlintDiagnosticItem) => {
                let range = new vscode.Range(
                    item.line - 1,
                    item.column - 1,
                    item.endLine - 1,
                    item.endColumn - 1
                );

                if (item.line === item.endLine && item.column === item.endColumn) {
                    range = new vscode.Range(
                        item.line - 1,
                        0,
                        item.line - 1,
                        Number.MAX_VALUE
                    );
                }

                let severity = vscode.DiagnosticSeverity.Warning;
                if (item.defectLevel === "MANDATORY") {
                    severity = vscode.DiagnosticSeverity.Error;
                }

                const diagnostic = new vscode.Diagnostic(range, item.description, severity);
                const uri = vscode.Uri.file(item.file);
                let diagnostics = this.cjlintDiagnostics.get(uri);
                diagnostics = Utility.checkIsValid(diagnostics) ? diagnostics!.concat(diagnostic) : [diagnostic];
                this.cjlintDiagnostics.set(uri, diagnostics);
            });
        }
    }

    /** 清除所有 cjlint 诊断结果 */
    clearCjlintResult(): void {
        this.cjlintDiagnostics.clear();
    }
}
