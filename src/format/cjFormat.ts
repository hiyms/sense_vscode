/** @file CjFormat 格式化类，提供 cjfmt 工具的调用封装 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { exec } from "child_process";
import { OutputHelper } from "../utils/outputHelper";
import { Utility } from "../utils/utility";

/**
 * Cangjie 代码格式化类
 * 封装了对 cjfmt 工具的调用，支持单文件格式化和目录递归检查
 */
export class CjFormat {
    /**
     * 执行代码格式化（原有接口，保留向后兼容）
     * @param document - 可选的需要格式化的文档 URI，未指定时使用当前激活编辑器
     * @returns 格式化成功返回 true，失败返回 false 或错误信息
     */
    static async formatFunc(document?: vscode.Uri): Promise<boolean | string | undefined> {
        const isWin = process.platform === "win32";

        let filePath: string;
        let binDir: string;
        let cjfmtPath: string;

        const selected = Utility.checkIsValid(document)
            ? document!.fsPath
            : vscode.window.activeTextEditor?.document.fileName;

        if (!Utility.checkIsValid(selected)) {
            vscode.window.showErrorMessage("No Cangjie file or folder is selected to format.");
            return false;
        }

        filePath = selected!;
        if (filePath.indexOf("..") >= 0 || !fs.existsSync(filePath)) {
            return false;
        }

        const cangjieHome = Utility.getCangjieHome();
        if (!Utility.checkIsValid(cangjieHome)) {
            vscode.window.showErrorMessage("Please check sdk path");
            return false;
        }

        let cjfmtName = "cjfmt";
        if (isWin) {
            cjfmtName = "cjfmt.exe";
        }

        cjfmtPath = path.join(cangjieHome, "tools", "bin", cjfmtName);
        binDir = path.join(cangjieHome, "tools", "bin");

        if (!fs.existsSync(cjfmtPath)) {
            vscode.window.showErrorMessage("Format failed, no cjfmt tool");
            return false;
        }

        if (!fs.existsSync(binDir)) {
            vscode.window.showErrorMessage("Format failed, no bin directory in cangjie sdk");
            return false;
        }

        let stat: fs.Stats;
        try {
            stat = fs.lstatSync(filePath);
        } catch (e: any) {
            vscode.window.showErrorMessage(e.message);
            return false;
        }

        if (stat.isDirectory()) {
            // 对目录执行递归格式化检查
            try {
                let cmd = `cjfmt -d '${filePath}'`;
                if (isWin) {
                    cmd = `cjfmt -d "${filePath}"`;
                }
                exec(
                    Utility.getExecCmd(cmd),
                    { cwd: binDir },
                    (error, stdout, stderr) => {
                        if (Utility.checkIsValid(stderr)) {
                            OutputHelper.appendLine(`cjfmt check message: ${stderr}`);
                        }
                    }
                );
            } catch (e: any) {
                vscode.window.showErrorMessage(`Format failed ${e}`);
                return e;
            }
        } else {
            // 单文件格式化，仅支持 .cj 后缀
            const ext = path.extname(filePath);
            if (ext !== ".cj") {
                vscode.window.showErrorMessage(
                    "The plugin only can format Cangjie source code file"
                );
                return false;
            }

            try {
                let cmd = `cjfmt -f '${filePath}'`;
                if (isWin) {
                    cmd = `cjfmt -f "${filePath}"`;
                }
                exec(
                    Utility.getExecCmd(cmd),
                    { cwd: binDir },
                    (error, stdout, stderr) => {
                        if (Utility.checkIsValid(stderr)) {
                            OutputHelper.appendLine(`cjfmt check message: ${stderr}`);
                        }
                    }
                );
            } catch (e: any) {
                vscode.window.showErrorMessage(`Format failed ${e}`);
                return e;
            }
        }

        return true;
    }

    /**
     * DocumentFormattingEditProvider 实现
     * 对整个文档执行 cjfmt 格式化，返回 TextEdit 列表
     */
    static async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        const originalText = document.getText();
        const formattedText = await CjFormat.runCjfmtOnText(originalText, token);

        if (formattedText === null || formattedText === originalText) {
            return [];
        }

        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(originalText.length)
        );
        return [vscode.TextEdit.replace(fullRange, formattedText)];
    }

    /**
     * DocumentRangeFormattingEditProvider 实现
     * 对指定范围内的行执行 cjfmt 格式化，返回 TextEdit 列表
     */
    static async provideDocumentRangeFormattingEdits(
        document: vscode.TextDocument,
        range: vscode.Range,
        token: vscode.CancellationToken
    ): Promise<vscode.TextEdit[]> {
        const originalText = document.getText();
        const startLine = range.start.line + 1; // cjfmt -l 使用 1-based 行号
        const endLine = range.end.line + 1;

        const formattedText = await CjFormat.runCjfmtOnText(
            originalText,
            token,
            `${startLine}:${endLine}`
        );

        if (formattedText === null || formattedText === originalText) {
            return [];
        }

        return CjFormat.computeTextEdits(originalText, formattedText, range);
    }

    // ── private helpers ──────────────────────────────────────────────

    /**
     * 对文本内容运行 cjfmt
     * 将文本写入临时文件，运行 cjfmt，读取结果
     * @param text - 源代码文本
     * @param token - 取消令牌
     * @param lineRange - 可选的行范围，格式 "start:end"（1-based）
     * @returns 格式化后的文本，失败时返回 null
     */
    private static async runCjfmtOnText(
        text: string,
        token: vscode.CancellationToken,
        lineRange?: string
    ): Promise<string | null> {
        const cangjieHome = Utility.getCangjieHome();
        if (!Utility.checkIsValid(cangjieHome)) {
            vscode.window.showErrorMessage("Please check sdk path");
            return null;
        }

        const binDir = path.join(cangjieHome, "tools", "bin");
        const cjfmtName = process.platform === "win32" ? "cjfmt.exe" : "cjfmt";
        const cjfmtPath = path.join(binDir, cjfmtName);

        if (!fs.existsSync(cjfmtPath)) {
            vscode.window.showErrorMessage("Format failed, no cjfmt tool");
            return null;
        }

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cjfmt-"));
        const tmpFile = path.join(tmpDir, "src.cj");

        try {
            fs.writeFileSync(tmpFile, text, "utf-8");

            if (token.isCancellationRequested) return null;

            let cmd: string;
            if (lineRange) {
                const outFile = path.join(tmpDir, "out.cj");
                cmd = `cjfmt -f '${tmpFile}' -o '${outFile}' -l ${lineRange}`;
                await CjFormat.execCmd(Utility.getExecCmd(cmd), binDir);
                if (token.isCancellationRequested) return null;
                return fs.readFileSync(outFile, "utf-8");
            } else {
                cmd = `cjfmt -f '${tmpFile}'`;
                await CjFormat.execCmd(Utility.getExecCmd(cmd), binDir);
                if (token.isCancellationRequested) return null;
                return fs.readFileSync(tmpFile, "utf-8");
            }
        } catch (e: any) {
            OutputHelper.appendLine(`cjfmt error: ${e.message || e}`);
            return null;
        } finally {
            try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
        }
    }

    /** Promise 化的 exec */
    private static execCmd(command: string, cwd: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            exec(command, { cwd }, (error, _stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    if (Utility.checkIsValid(stderr)) {
                        OutputHelper.appendLine(`cjfmt check message: ${stderr}`);
                    }
                    resolve();
                }
            });
        });
    }

    /**
     * 对比原始文本和格式化文本，生成 TextEdit 列表
     * 仅返回与 filterRange 相交的行级编辑
     */
    private static computeTextEdits(
        original: string,
        formatted: string,
        filterRange: vscode.Range
    ): vscode.TextEdit[] {
        const origLines = original.split("\n");
        const fmtLines = formatted.split("\n");
        const edits: vscode.TextEdit[] = [];

        const maxLen = Math.max(origLines.length, fmtLines.length);
        let editStart = -1;

        for (let i = 0; i <= maxLen; i++) {
            const origLine = i < origLines.length ? origLines[i] : "";
            const fmtLine = i < fmtLines.length ? fmtLines[i] : "";
            const changed = origLine !== fmtLine;
            const inRange = i >= filterRange.start.line && i < filterRange.end.line;

            if (changed && inRange && editStart < 0) {
                editStart = i;
            } else if ((!changed || !inRange || i >= maxLen) && editStart >= 0) {
                const endLine = i;
                const replaceRange = new vscode.Range(
                    editStart, 0,
                    endLine, 0
                );
                const replaceText = fmtLines.slice(editStart, endLine).join("\n");
                edits.push(vscode.TextEdit.replace(replaceRange, replaceText));
                editStart = -1;
            }
        }

        return edits;
    }
}
