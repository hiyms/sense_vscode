/** @file sense 命令行工具的纯函数测试 */

import * as assert from 'assert';
import { SenseCli } from '../build/senseCli';

suite('SenseCli', () => {
    test('可执行文件名与 sense 的规则一致', () => {
        assert.strictEqual(SenseCli.getExecutableName('hello'), 'hello');
        assert.strictEqual(SenseCli.getExecutableName('acme::app'), 'app');
        assert.strictEqual(SenseCli.getExecutableName('sense::core'), 'core');
        assert.strictEqual(SenseCli.getExecutableName('acme::com.example.Tool'), 'Tool');
    });

    test('单引号被正确转义', () => {
        const quoted = SenseCli.quote("a'b");
        assert.ok(!quoted.startsWith("'a'b'"), '单引号不应直接闭合字符串');
    });
});
