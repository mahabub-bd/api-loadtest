import { ConflictException, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BenchmarkService } from './benchmark.service';
import { parseConfig } from './parse-config';

const ALREADY_RUNNING = 'A benchmark is already running. Try again when it finishes.';

@Controller('api')
export class BenchmarkController {
  // Explicit @Inject: tsx/esbuild doesn't emit decorator metadata, so Nest
  // can't resolve the dependency from the constructor's parameter type alone.
  constructor(@Inject(BenchmarkService) private readonly benchmark: BenchmarkService) {}

  /** Plain JSON one-shot endpoint, for running benchmarks from scripts. */
  @Post('load-test')
  @HttpCode(200)
  async runOnce(@Req() req: Request): Promise<{ url: string; method: string; results: unknown }> {
    const cfg = parseConfig(req.body);
    if (this.benchmark.isRunning()) throw new ConflictException(ALREADY_RUNNING);

    const results = await this.benchmark.run(cfg);
    return { url: cfg.url, method: cfg.method, results };
  }

  /** SSE endpoint: live progress while levels run sequentially. */
  @Post('load-test/stream')
  stream(@Req() req: Request, @Res() res: Response): void {
    let cfg;
    try {
      cfg = parseConfig(req.body);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    if (this.benchmark.isRunning()) {
      res.status(409).json({ error: ALREADY_RUNNING });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    const abort = new AbortController();
    // Watch the response, not the request: an IncomingMessage emits 'close'
    // as soon as its body is consumed, which would abort the run immediately.
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    send('start', {
      url: cfg.url,
      method: cfg.method,
      totalRequests: cfg.totalRequests,
      concurrency: cfg.concurrency,
    });

    this.benchmark
      .run(
        cfg,
        {
          onLevelStart: (d) => send('level_start', d),
          onProgress: (d) => send('progress', d),
          onLevelResult: (d) => send('level_result', d),
        },
        abort.signal
      )
      .then((results) => {
        if (abort.signal.aborted) send('aborted', {});
        else send('done', { url: cfg.url, method: cfg.method, results });
      })
      .catch((err: unknown) => {
        send('error', { message: err instanceof Error ? err.message : 'Benchmark failed.' });
      })
      .finally(() => {
        res.end();
      });
  }

  /** Built-in sample target so the tool can be smoke-tested instantly. */
  @Get('sample')
  async sample(@Query('delay') delay?: string): Promise<{ ok: boolean; delay: number }> {
    const ms = Math.min(5000, Math.abs(parseInt(delay ?? '0', 10) || 0));
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { ok: true, delay: ms };
  }
}
