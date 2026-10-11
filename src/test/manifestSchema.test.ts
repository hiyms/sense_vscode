/** @file sense.toml 清单 schema 文件与 Even Better TOML 关联注册的测试 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'opencj.sense';
const SCHEMA_RELATIVE_PATH = 'schemas/sense-manifest.schema.json';
const SCHEMA_URL =
    'https://raw.githubusercontent.com/hiyms/sense_vscode/master/schemas/sense-manifest.schema.json';

/** 按 JSON Pointer 在对象中查找节点 */
function resolvePointer(root: any, pointer: string): any {
    let node = root;
    for (const rawSegment of pointer.replace(/^\//, '').split('/')) {
        if (rawSegment === '') continue;
        const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
        node = node?.[segment];
        if (node === undefined) return undefined;
    }
    return node;
}

/** 收集 schema 中出现的全部 $ref */
function collectRefs(node: any, refs: string[] = []): string[] {
    if (Array.isArray(node)) {
        for (const item of node) collectRefs(item, refs);
    } else if (node !== null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
            if (key === '$ref' && typeof value === 'string') refs.push(value);
            collectRefs(value, refs);
        }
    }
    return refs;
}

suite('sense.toml 清单 schema', () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
    const schemaPath = path.join(extension.extensionPath, SCHEMA_RELATIVE_PATH);

    test('tomlValidation 注册项指向 schema 地址', () => {
        const tomlValidation = extension.packageJSON?.contributes?.tomlValidation;
        assert.ok(Array.isArray(tomlValidation), 'package.json 应声明 contributes.tomlValidation');
        assert.strictEqual(tomlValidation.length, 1, '应只有一条 tomlValidation 规则');
        assert.strictEqual(tomlValidation[0].url, SCHEMA_URL);
        assert.deepStrictEqual(tomlValidation[0].fileMatch, ['sense.toml']);
    });

    test('schema 文件存在且为合法 JSON', () => {
        assert.ok(fs.existsSync(schemaPath), `缺少 ${schemaPath}`);
        JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    });

    test('schema 的 $id 与注册地址一致', () => {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        assert.strictEqual(schema.$id, SCHEMA_URL);
    });

    test('schema 内部的 $ref 全部可以解析', () => {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        const refs = collectRefs(schema);
        assert.ok(refs.length > 0, 'schema 应包含 $ref');
        for (const ref of refs) {
            assert.ok(ref.startsWith('#/'), `仅支持文档内引用：${ref}`);
            assert.notStrictEqual(resolvePointer(schema, ref.slice(1)), undefined, `无法解析 ${ref}`);
        }
    });
});
