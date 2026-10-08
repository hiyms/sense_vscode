/** @file sense lsp 子进程运行时环境变量的合并规则测试 */

import * as assert from 'assert';
import { SenseContext } from '../lsp/context';

suite('sense lsp 运行时环境', () => {
    test('按设置覆盖变量', () => {
        const base = { cjHeapSize: '256MB', KEEP: '1' };
        const env = SenseContext.applyRuntimeEnv(base, { cjHeapSize: '4GB', cjStackSize: '8MB' });

        assert.strictEqual(env.cjHeapSize, '4GB');
        assert.strictEqual(env.cjStackSize, '8MB');
        assert.strictEqual(env.KEEP, '1');
    });

    test('空字符串表示移除变量', () => {
        const env = SenseContext.applyRuntimeEnv({ cjHeapSize: '256MB', KEEP: '1' }, { cjHeapSize: '' });

        assert.strictEqual(env.cjHeapSize, undefined);
        assert.strictEqual(env.KEEP, '1');
    });

    test('不修改传入的环境对象', () => {
        const base = { cjHeapSize: '256MB' };
        SenseContext.applyRuntimeEnv(base, { cjHeapSize: '4GB' });

        assert.strictEqual(base.cjHeapSize, '256MB');
    });
});
