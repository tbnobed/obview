export interface SchedulerLogger {
  log(message: string): void;
}

export function filterUsableGpuIndices(
  gpuIndices: number[],
  probe: (gpuIndex: number) => boolean,
): number[] {
  return gpuIndices.filter((gpuIndex) => probe(gpuIndex));
}

type PendingWork<T> = {
  label: string;
  work: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export class WorkQueue {
  private active = 0;
  private readonly pending: PendingWork<unknown>[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly name: string,
    private readonly logger: SchedulerLogger = console,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error(`${name} concurrency must be a positive integer`);
    }
  }

  run<T>(label: string, work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        label,
        work,
        resolve,
        reject,
      } as PendingWork<unknown>);
      this.logger.log(
        `[${this.name}] Queued ${label} (active=${this.active}/${this.concurrency}, waiting=${this.pending.length})`,
      );
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const item = this.pending.shift()!;
      this.active += 1;
      this.logger.log(
        `[${this.name}] Starting ${item.label} (active=${this.active}/${this.concurrency}, waiting=${this.pending.length})`,
      );

      Promise.resolve()
        .then(item.work)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1;
          this.logger.log(
            `[${this.name}] Finished ${item.label} (active=${this.active}/${this.concurrency}, waiting=${this.pending.length})`,
          );
          this.drain();
        });
    }
  }
}

type GpuWaiter = {
  label: string;
  resolve: (lease: GpuLease) => void;
};

export interface GpuLease {
  gpuIndex: number;
  release(): void;
}

export class NvencScheduler {
  private readonly activeByGpu = new Map<number, number>();
  private readonly waiters: GpuWaiter[] = [];
  private cursor = 0;

  constructor(
    private readonly gpuIndices: number[],
    private readonly concurrencyPerGpu: number,
    private readonly logger: SchedulerLogger = console,
  ) {
    if (gpuIndices.length === 0 || new Set(gpuIndices).size !== gpuIndices.length) {
      throw new Error("NVENC GPU indices must be a non-empty list of unique values");
    }
    if (gpuIndices.some((index) => !Number.isInteger(index) || index < 0)) {
      throw new Error("NVENC GPU indices must be non-negative integers");
    }
    if (!Number.isInteger(concurrencyPerGpu) || concurrencyPerGpu < 1) {
      throw new Error("NVENC concurrency per GPU must be a positive integer");
    }
    for (const gpuIndex of gpuIndices) this.activeByGpu.set(gpuIndex, 0);
  }

  async run<T>(label: string, work: (gpuIndex: number) => Promise<T>): Promise<T> {
    const lease = await this.acquire(label);
    try {
      return await work(lease.gpuIndex);
    } finally {
      lease.release();
    }
  }

  acquire(label: string): Promise<GpuLease> {
    return new Promise<GpuLease>((resolve) => {
      this.waiters.push({ label, resolve });
      this.logger.log(
        `[NVENC Scheduler] Queued ${label} (waiting=${this.waiters.length}, ${this.formatUsage()})`,
      );
      this.drain();
    });
  }

  private drain(): void {
    while (this.waiters.length > 0) {
      const gpuIndex = this.pickAvailableGpu();
      if (gpuIndex === null) return;

      const waiter = this.waiters.shift()!;
      this.activeByGpu.set(gpuIndex, (this.activeByGpu.get(gpuIndex) || 0) + 1);
      this.cursor = (this.gpuIndices.indexOf(gpuIndex) + 1) % this.gpuIndices.length;
      this.logger.log(
        `[NVENC Scheduler] Assigned ${waiter.label} to GPU ${gpuIndex} (waiting=${this.waiters.length}, ${this.formatUsage()})`,
      );

      let released = false;
      waiter.resolve({
        gpuIndex,
        release: () => {
          if (released) return;
          released = true;
          this.activeByGpu.set(
            gpuIndex,
            Math.max(0, (this.activeByGpu.get(gpuIndex) || 0) - 1),
          );
          this.logger.log(
            `[NVENC Scheduler] Released GPU ${gpuIndex} from ${waiter.label} (${this.formatUsage()})`,
          );
          this.drain();
        },
      });
    }
  }

  private pickAvailableGpu(): number | null {
    let lowestLoad = this.concurrencyPerGpu + 1;
    const candidates: number[] = [];

    for (const gpuIndex of this.gpuIndices) {
      const load = this.activeByGpu.get(gpuIndex) || 0;
      if (load >= this.concurrencyPerGpu) continue;
      if (load < lowestLoad) {
        lowestLoad = load;
        candidates.length = 0;
        candidates.push(gpuIndex);
      } else if (load === lowestLoad) {
        candidates.push(gpuIndex);
      }
    }

    if (candidates.length === 0) return null;
    for (let offset = 0; offset < this.gpuIndices.length; offset += 1) {
      const candidate = this.gpuIndices[(this.cursor + offset) % this.gpuIndices.length];
      if (candidates.includes(candidate)) return candidate;
    }
    return candidates[0];
  }

  private formatUsage(): string {
    return this.gpuIndices
      .map(
        (gpuIndex) =>
          `GPU ${gpuIndex}=${this.activeByGpu.get(gpuIndex) || 0}/${this.concurrencyPerGpu}`,
      )
      .join(", ");
  }
}