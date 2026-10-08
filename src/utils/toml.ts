/**
 * @file 轻量级 TOML 解析与序列化工具
 *
 * 手写的 TOML 解析器，用于读写 sense.toml 文件。
 * 选择自实现而非第三方库的原因：减少依赖体积，且只需支持 sense.toml 使用的 TOML 子集。
 */

const KEY_REGEX = /^[A-Za-z0-9_-]+$/;

/** 跳过空白字符和 # 注释，返回下一个有效字符的位置 */
function skipVoid(input: string, pos: number): number {
    while (pos < input.length) {
        const ch = input[pos];
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
            pos++;
            continue;
        }
        if (ch === "#") {
            while (pos < input.length && input[pos] !== "\n" && input[pos] !== "\r") {
                pos++;
            }
            continue;
        }
        break;
    }
    return pos;
}

/**
 * 递归下降解析 TOML 值
 *
 * 支持字符串（单/双引号）、布尔、数字（整数/浮点）、内联表、内联数组。
 * 返回 [解析结果, 下一个位置] 元组，方便调用方继续解析。
 */
function parseValue(input: string, start: number): [any, number] {
    let pos = skipVoid(input, start);
    if (pos >= input.length) return [undefined, pos];

    const ch = input[pos];

    // String (double quote)
    if (ch === '"') {
        pos++;
        let value = "";
        while (pos < input.length && input[pos] !== '"') {
            if (input[pos] === "\\") {
                pos++;
                if (pos < input.length) {
                    switch (input[pos]) {
                        case "n": value += "\n"; break;
                        case "t": value += "\t"; break;
                        case "r": value += "\r"; break;
                        case '"': value += '"'; break;
                        case "\\": value += "\\"; break;
                        default: value += input[pos]; break;
                    }
                }
            } else {
                value += input[pos];
            }
            pos++;
        }
        pos++; // skip closing "
        return [value, pos];
    }

    // String (single quote)
    if (ch === "'") {
        pos++;
        let value = "";
        while (pos < input.length && input[pos] !== "'") {
            value += input[pos];
            pos++;
        }
        pos++; // skip closing '
        return [value, pos];
    }

    // Boolean
    if (input.startsWith("true", pos)) {
        return [true, pos + 4];
    }
    if (input.startsWith("false", pos)) {
        return [false, pos + 5];
    }

    // Number
    if (ch === "-" || ch === "+" || (ch >= "0" && ch <= "9")) {
        let numStr = "";
        if (ch === "-" || ch === "+") {
            numStr += ch;
            pos++;
        }
        while (pos < input.length && input[pos] >= "0" && input[pos] <= "9") {
            numStr += input[pos];
            pos++;
        }
        if (pos < input.length && input[pos] === ".") {
            numStr += input[pos];
            pos++;
            while (pos < input.length && input[pos] >= "0" && input[pos] <= "9") {
                numStr += input[pos];
                pos++;
            }
            return [parseFloat(numStr), pos];
        }
        return [parseInt(numStr, 10), pos];
    }

    // Inline table { ... }
    if (ch === "{") {
        pos++; // skip {
        const result: any = {};
        pos = skipVoid(input, pos);
        while (pos < input.length && input[pos] !== "}") {
            // Parse key
            let key = "";
            while (pos < input.length && input[pos] !== "=" && input[pos] !== " " && input[pos] !== "\t" && input[pos] !== "}") {
                key += input[pos];
                pos++;
            }
            key = key.trim();
            pos = skipVoid(input, pos);
            if (pos < input.length && input[pos] === "=") {
                pos++; // skip =
                pos = skipVoid(input, pos);
                const [value, newPos] = parseValue(input, pos);
                pos = newPos;
                if (key) result[key] = value;
            }
            pos = skipVoid(input, pos);
            if (pos < input.length && input[pos] === ",") {
                pos++; // skip comma
                pos = skipVoid(input, pos);
            }
        }
        if (pos < input.length) pos++; // skip }
        return [result, pos];
    }

    // Array [ ... ]
    if (ch === "[") {
        pos++; // skip [
        const result: any[] = [];
        pos = skipVoid(input, pos);
        while (pos < input.length && input[pos] !== "]") {
            const [value, newPos] = parseValue(input, pos);
            if (value !== undefined) {
                result.push(value);
            }
            pos = skipVoid(input, newPos);
            if (pos < input.length && input[pos] === ",") {
                pos++; // skip comma
                pos = skipVoid(input, pos);
            }
        }
        if (pos < input.length) pos++; // skip ]
        return [result, pos];
    }

    // Unquoted key-like value (bare string)
    let value = "";
    while (pos < input.length && input[pos] !== " " && input[pos] !== "\t" && input[pos] !== "\n" && input[pos] !== "\r" && input[pos] !== "#" && input[pos] !== "]" && input[pos] !== "}") {
        value += input[pos];
        pos++;
    }
    return [value.trim(), pos];
}

/**
 * 解析 TOML 键路径
 *
 * 支持点分隔的复合键（如 a.b.c）和方括号中的带引号键名，
 * 返回键路径数组。
 */
function parseKey(input: string, start: number): [string[], number] {
    let pos = skipVoid(input, start);
    const keys: string[] = [];
    let currentKey = "";

    while (pos < input.length) {
        const ch = input[pos];
        if (ch === ".") {
            if (currentKey) {
                keys.push(currentKey.trim());
                currentKey = "";
            }
            pos++;
            continue;
        }
        if (ch === " " || ch === "\t" || ch === "=" || ch === "]" || ch === "\n" || ch === "\r" || ch === "#") {
            break;
        }
        if (ch === '"') {
            const [val, newPos] = parseValue(input, pos);
            currentKey += val;
            pos = newPos;
            continue;
        }
        currentKey += ch;
        pos++;
    }

    if (currentKey) {
        keys.push(currentKey.trim());
    }

    return [keys, pos];
}

function setNestedValue(root: any, current: any, keys: string[], value: any, isArrayTable: boolean): void {
    if (keys.length === 0) return;
    if (keys.length === 1) {
        if (isArrayTable) {
            if (!Array.isArray(current[keys[0]])) {
                current[keys[0]] = [];
            }
            current[keys[0]].push(value);
        } else {
            if (current[keys[0]] === undefined || current[keys[0]] === null) {
                current[keys[0]] = value;
            } else if (typeof current[keys[0]] === "object" && !Array.isArray(current[keys[0]])) {
                Object.assign(current[keys[0]], value);
            }
        }
        return;
    }

    const key = keys[0];
    if (!current[key]) {
        if (isArrayTable && keys.length > 1) {
            current[key] = {};
        } else {
            current[key] = {};
        }
    }
    setNestedValue(root, current[key], keys.slice(1), value, isArrayTable);
}

/**
 * Parse TOML string to JavaScript object
 */
/**
 * 解析 TOML 字符串为 JavaScript 对象
 *
 * 支持标准 TOML 语法子集：键值对、表（[table]）、数组表（[[array]]）、
 * 字符串/数字/布尔/数组/内联表类型。
 *
 * @param input - TOML 格式字符串
 * @returns 解析后的对象
 */
export function parse(input: string): any {
    const root: any = {};
    let currentTable = root;
    let currentTableKeys: string[] = [];
    let pos = 0;

    while (pos < input.length) {
        pos = skipVoid(input, pos);
        if (pos >= input.length) break;

        const ch = input[pos];

        // Section header [table] or [[array]]
        if (ch === "[") {
            const isArrayTable = pos + 1 < input.length && input[pos + 1] === "[";
            if (isArrayTable) {
                pos += 2; // skip [[
            } else {
                pos++; // skip [
            }

            const [keys, newPos] = parseKey(input, pos);

            if (isArrayTable) {
                // skip ]]
                let endPos = skipVoid(input, newPos);
                if (endPos < input.length && input[endPos] === "]") {
                    endPos++;
                    if (endPos < input.length && input[endPos] === "]") {
                        endPos++;
                    }
                }
                pos = endPos;
                // Create or add to array
                setNestedValue(root, root, keys, {}, true);
                // Navigate to the last element
                currentTable = root;
                for (let i = 0; i < keys.length - 1; i++) {
                    currentTable = currentTable[keys[i]];
                }
                const lastKey = keys[keys.length - 1];
                const arr = currentTable[lastKey];
                currentTable = arr[arr.length - 1];
                currentTableKeys = keys;
            } else {
                // skip ]
                let endPos = skipVoid(input, newPos);
                if (endPos < input.length && input[endPos] === "]") {
                    endPos++;
                }
                pos = endPos;
                currentTable = root;
                currentTableKeys = keys;
                for (const key of keys) {
                    if (!currentTable[key]) {
                        currentTable[key] = {};
                    }
                    currentTable = currentTable[key];
                }
            }
            continue;
        }

        // Key-value pair
        const [keys, afterKeys] = parseKey(input, pos);
        pos = skipVoid(input, afterKeys);

        if (pos < input.length && input[pos] === "=") {
            pos++; // skip =
            pos = skipVoid(input, pos);

            if (keys.length > 0) {
                const [value, newPos] = parseValue(input, pos);
                pos = newPos;

                if (keys.length === 1) {
                    currentTable[keys[0]] = value;
                } else {
                    let target = currentTable;
                    for (let i = 0; i < keys.length - 1; i++) {
                        if (!target[keys[i]]) {
                            target[keys[i]] = {};
                        }
                        target = target[keys[i]];
                    }
                    target[keys[keys.length - 1]] = value;
                }
            }
        }

        // Skip to end of line
        while (pos < input.length && input[pos] !== "\n" && input[pos] !== "\r") {
            if (input[pos] === "#") {
                while (pos < input.length && input[pos] !== "\n" && input[pos] !== "\r") {
                    pos++;
                }
                break;
            }
            pos++;
        }
        if (pos < input.length && input[pos] === "\r") pos++;
        if (pos < input.length && input[pos] === "\n") pos++;
    }

    return root;
}

/** 递归序列化单个值为 TOML 格式字符串，支持字符串、数字、布尔、数组、内联表 */
function serializeValue(value: any, indent: string): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") {
        // Escape special characters
        const escaped = value
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\n")
            .replace(/\t/g, "\\t")
            .replace(/\r/g, "\\r");
        return `"${escaped}"`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return value.toString();
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return "[]";
        // Check if array elements are objects (for array of tables)
        if (typeof value[0] === "object" && value[0] !== null) {
            return ""; // Handled separately
        }
        return `[${value.map((v) => serializeValue(v, indent)).join(", ")}]`;
    }
    if (typeof value === "object") {
        const keys = Object.keys(value);
        if (keys.length === 0) return "{}";
        return `{ ${keys.map((k) => `${k} = ${serializeValue(value[k], indent)}`).join(", ")} }`;
    }
    return String(value);
}

/**
 * 将 JavaScript 对象序列化为 TOML 字符串
 *
 * 递归处理嵌套对象，数组表使用 [[...]] 语法，普通子表使用 [...] 语法。
 *
 * @param obj - 要序列化的对象
 * @returns TOML 格式字符串
 */
export function stringify(obj: any): string {
    if (typeof obj !== "object" || obj === null) {
        throw new TypeError("stringify can only be called with an object");
    }

    const lines: string[] = [];
    const tables: Array<{ keys: string[]; value: any; isArrayTable: boolean }> = [];
    const rootKeys: string[] = [];

    // Separate root-level keys from table keys
    for (const key of Object.keys(obj)) {
        if (obj[key] === null || obj[key] === undefined) continue;
        if (typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            tables.push({ keys: [key], value: obj[key], isArrayTable: false });
        } else if (Array.isArray(obj[key]) && obj[key].length > 0 && typeof obj[key][0] === "object" && obj[key][0] !== null) {
            tables.push({ keys: [key], value: obj[key], isArrayTable: true });
        } else {
            rootKeys.push(key);
        }
    }

    // Write root-level keys
    for (const key of rootKeys) {
        if (obj[key] !== undefined && obj[key] !== null) {
            lines.push(`${key} = ${serializeValue(obj[key], "")}`);
        }
    }

    if (rootKeys.length > 0 && tables.length > 0) {
        lines.push("");
    }

    // Write tables
    for (const table of tables) {
        if (table.isArrayTable) {
            for (const element of table.value) {
                writeTableLines(lines, table.keys, element, 0, true);
            }
        } else {
            writeTableLines(lines, table.keys, table.value, 0, false);
        }
    }

    const result = lines.join("\n");
    return result ? result.trim() + "\n" : result;
}

/** 递归写出 TOML 表内容，先输出普通键值对，再递归处理子表 */
function writeTableLines(
    lines: string[],
    keys: string[],
    value: any,
    depth: number,
    isArrayTable: boolean
): void {
    if (value === null || value === undefined) return;

    // Collect sub-tables and simple values
    const simpleKeys: string[] = [];
    const subTables: Array<{ keys: string[]; value: any; isArrayTable: boolean }> = [];

    for (const key of Object.keys(value)) {
        if (value[key] === null || value[key] === undefined) continue;
        if (typeof value[key] === "object" && !Array.isArray(value[key])) {
            subTables.push({ keys: [key], value: value[key], isArrayTable: false });
        } else if (
            Array.isArray(value[key]) &&
            value[key].length > 0 &&
            typeof value[key][0] === "object" &&
            value[key][0] !== null
        ) {
            subTables.push({ keys: [key], value: value[key], isArrayTable: true });
        } else {
            simpleKeys.push(key);
        }
    }

    // Write table header
    const fullKey = keys.join(".");
    if (isArrayTable) {
        lines.push(`[[${fullKey}]]`);
    } else {
        lines.push(`[${fullKey}]`);
    }

    // Write simple keys
    for (const key of simpleKeys) {
        const serialized = serializeValue(value[key], "");
        if (serialized !== "") {
            lines.push(`${key} = ${serialized}`);
        }
    }

    // Write sub-tables
    for (const sub of subTables) {
        if (lines.length > 0 && lines[lines.length - 1] !== "") {
            lines.push("");
        }
        const subKeys = [...keys, ...sub.keys];
        if (sub.isArrayTable) {
            for (const element of sub.value) {
                writeTableLines(lines, subKeys, element, depth + 1, true);
            }
        } else {
            writeTableLines(lines, subKeys, sub.value, depth + 1, false);
        }
    }
}
