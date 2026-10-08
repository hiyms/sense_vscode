/**
 * @file sense lsp 子进程桥接
 *
 * sense lsp 在 Linux 与 macOS 下用 File("/dev/stdin") 读取客户端输入。
 * VS Code 扩展宿主通过 Node 的 child_process 启动子进程时，stdin 是
 * socketpair，打开 /dev/stdin 会得到 ENXIO。这里为 POSIX 平台创建命名
 * 管道（FIFO），把该 fd 作为子进程 stdin，并把语言客户端写出的 LSP 报文
 * 写入同一条命名管道。
 *
 * 写入使用异步的 fs.write 并处理短写，避免服务端停止读取时把扩展宿主
 * 主线程阻塞在管道缓冲上。
 *
 * Windows 上 sense lsp 使用运行时的 getStdIn()，普通的管道即可正常工作。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import * as child_process from 'child_process';

/** 语言客户端需要的读写流，以及子进程的释放入口 */
export interface SenseLspTransport {
    reader: NodeJS.ReadableStream;
    writer: NodeJS.WritableStream;
    process: child_process.ChildProcess;
    dispose(): void;
}

/** 启动 sense lsp 的参数 */
export interface SenseLspOptions {
    /** 要启动的可执行文件绝对路径 */
    executable: string;
    /** 完整的参数列表，已经包含 lsp 子命令 */
    args: string[];
    /** 子进程工作目录，通常是工程根目录 */
    cwd: string;
    /** 子进程环境变量 */
    env: NodeJS.ProcessEnv;
    /** 存放命名管道的目录，必须已存在 */
    runtimeDir: string;
    /** 服务端 stderr 输出的消费者 */
    onStderr?: (text: string) => void;
    /** 子进程启动失败时的处理 */
    onError?: (error: Error) => void;
}

/**
 * 启动 sense lsp 并返回可直接交给语言客户端的读写流
 */
export function spawnSenseLsp(options: SenseLspOptions): SenseLspTransport {
    if (process.platform === 'win32') {
        return spawnWithPipes(options);
    }
    return spawnWithFifo(options);
}

/** 把 stderr 与启动错误接到调用方 */
function attachDiagnostics(child: child_process.ChildProcess, options: SenseLspOptions): void {
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => options.onStderr?.(chunk));
    child.on('error', (error: Error) => options.onError?.(error));
}

/** Windows 路径：直接使用普通管道 */
function spawnWithPipes(options: SenseLspOptions): SenseLspTransport {
    const child = child_process.spawn(options.executable, options.args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    attachDiagnostics(child, options);
    return {
        reader: child.stdout!,
        writer: child.stdin!,
        process: child,
        dispose: () => terminate(child),
    };
}

/** POSIX 路径：为 stdin 建立命名管道 */
function spawnWithFifo(options: SenseLspOptions): SenseLspTransport {
    fs.mkdirSync(options.runtimeDir, { recursive: true });
    const fifoPath = path.join(options.runtimeDir, `sense-lsp-${process.pid}-${Date.now()}.fifo`);

    let fifoCreated = false;
    let fd: number | undefined;
    try {
        child_process.execFileSync('mkfifo', [fifoPath]);
        fifoCreated = true;
        // 以 O_RDWR 打开，既是读端也是写端，避免 open 阻塞，也避免读端提前收到 EOF
        fd = fs.openSync(fifoPath, fs.constants.O_RDWR);
    } catch (e) {
        cleanupFifo(fifoPath, fifoCreated, fd);
        throw e;
    }

    const openFd = fd;
    const child = child_process.spawn(options.executable, options.args, {
        cwd: options.cwd,
        env: options.env,
        stdio: [openFd, 'pipe', 'pipe'],
    });
    attachDiagnostics(child, options);

    const writer = createFifoWriter(openFd);
    // 子进程结束后不再有读取方，终止写端避免报文在内存中无限积压
    child.on('exit', () => writer.destroy());

    let disposed = false;
    const dispose = () => {
        if (disposed) return;
        disposed = true;
        terminate(child);
        writer.destroy();
        cleanupFifo(fifoPath, true, openFd);
    };

    return {
        reader: child.stdout!,
        writer,
        process: child,
        dispose,
    };
}

/**
 * 构造写入命名管道的 Writable
 *
 * 使用异步 fs.write 并循环处理短写。管道写满且无人读取时只会造成背压，
 * 不会像 fs.writeSync 那样阻塞扩展宿主。
 */
function createFifoWriter(fd: number): stream.Writable {
    return new stream.Writable({
        write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
            const buffer = chunk as Buffer;
            let offset = 0;
            const step = () => {
                if (offset >= buffer.length) {
                    callback();
                    return;
                }
                fs.write(fd, buffer, offset, buffer.length - offset, null, (error, written) => {
                    if (error) {
                        callback(error);
                        return;
                    }
                    if (written <= 0) {
                        callback(new Error('sense lsp 命名管道写入没有取得进展'));
                        return;
                    }
                    offset += written;
                    step();
                });
            };
            step();
        },
    });
}

/** 终止子进程，先温和结束，再在短暂等待后强制结束 */
function terminate(child: child_process.ChildProcess): void {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
        child.kill('SIGTERM');
    } catch {
        return;
    }
    const timer = setTimeout(() => {
        try {
            child.kill('SIGKILL');
        } catch {
            // 进程已退出
        }
    }, 1500);
    timer.unref?.();
    child.once('exit', () => clearTimeout(timer));
}

/** 关闭命名管道描述符并删除命名管道文件 */
function cleanupFifo(fifoPath: string, fifoCreated: boolean, fd: number | undefined): void {
    if (fd !== undefined) {
        try {
            fs.closeSync(fd);
        } catch {
            // 描述符已关闭
        }
    }
    if (!fifoCreated) return;
    try {
        fs.unlinkSync(fifoPath);
    } catch {
        // 文件已删除
    }
}
