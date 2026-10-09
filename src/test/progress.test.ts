/** @file 服务端进度的报文拦截与状态栏展示测试 */

import * as assert from 'assert';

import { getStatusBar } from '../lsp/statusBar';
import { createProgressMessageStrategy, getProgressTracker } from '../lsp/progress';
import * as lspConstants from '../utils/lspConstants';

/** 直接读取状态栏条目的文本，用于校验进度是否写到状态栏 */
function statusText(): string {
    return (getStatusBar() as any).serverStatusBar.text;
}

/** 记录向语言客户端转发次数的 next 回调 */
function createForwarder(): { next: () => undefined; count: () => number } {
    let forwarded = 0;
    return {
        next: () => {
            forwarded += 1;
            return undefined;
        },
        count: () => forwarded,
    };
}

suite('索引进度展示', () => {
    test('create 与 $/progress 依次更新状态栏，end 之后恢复状态文本', () => {
        const tracker = getProgressTracker();
        tracker.clear();
        getStatusBar().updateServerState({ state: lspConstants.State.Running, serverVersion: '1.0.0' });

        const strategy = createProgressMessageStrategy(tracker);
        const forwarder = createForwarder();
        const token = 'progress_test_0';

        strategy.handleMessage(
            {
                jsonrpc: '2.0',
                method: lspConstants.workDoneProgressCreateMethod,
                params: { token },
            } as any,
            forwarder.next
        );
        assert.strictEqual(forwarder.count(), 1, 'create 通知应继续转发给语言客户端');

        strategy.handleMessage(
            {
                jsonrpc: '2.0',
                method: lspConstants.progressNotificationMethod,
                params: {
                    token,
                    value: {
                        kind: 'begin',
                        title: 'Cangjie indexing...',
                        message: '0/2 packages indexed',
                        percentage: 0,
                    },
                },
            } as any,
            forwarder.next
        );
        assert.ok(statusText().includes('0/2 packages indexed'), `状态栏应显示起始进度，实际为 ${statusText()}`);
        assert.ok(statusText().includes('$(sync~spin) sense'), '进度展示应保留 sense 图标与名称');

        strategy.handleMessage(
            {
                jsonrpc: '2.0',
                method: lspConstants.progressNotificationMethod,
                params: {
                    token,
                    value: { kind: 'report', message: '1/2 packages indexed', percentage: 50 },
                },
            } as any,
            forwarder.next
        );
        assert.ok(statusText().includes('1/2 packages indexed'), `状态栏应显示上报进度，实际为 ${statusText()}`);
        assert.ok(statusText().includes('50%'), '状态栏应显示百分比');

        strategy.handleMessage(
            {
                jsonrpc: '2.0',
                method: lspConstants.progressNotificationMethod,
                params: { token, value: { kind: 'end', message: 'all packages indexed' } },
            } as any,
            forwarder.next
        );
        assert.strictEqual(statusText(), 'sense', '进度结束后应恢复运行状态文本');
        assert.strictEqual(tracker.knows(token), false, '进度结束后应遗忘该 token');
        assert.strictEqual(forwarder.count(), 4, '全部进度报文都应继续转发给语言客户端');
    });

    test('没有 create 的 token 不会影响状态栏', () => {
        const tracker = getProgressTracker();
        tracker.clear();
        getStatusBar().updateServerState({ state: lspConstants.State.Running, serverVersion: '1.0.0' });

        const strategy = createProgressMessageStrategy(tracker);
        const forwarder = createForwarder();

        strategy.handleMessage(
            {
                jsonrpc: '2.0',
                method: lspConstants.progressNotificationMethod,
                params: {
                    token: 'progress_unknown',
                    value: { kind: 'report', message: '1/2 packages indexed', percentage: 50 },
                },
            } as any,
            forwarder.next
        );

        assert.strictEqual(statusText(), 'sense', '没有 create 的 token 不应改变状态栏');
    });
});
