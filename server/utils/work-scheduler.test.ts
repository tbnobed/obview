import assert from "node:assert/strict";
import test from "node:test";
import {
  filterUsableGpuIndices,
  NvencScheduler,
  WorkQueue,
  type SchedulerLogger,
} from "./work-scheduler.js";

const silentLogger: SchedulerLogger = { log() {} };
const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("WorkQueue caps concurrency and starts jobs FIFO", async () => {
  const queue = new WorkQueue(2, "test queue", silentLogger);
  const gates = [deferred(), deferred(), deferred()];
  const starts: number[] = [];
  let active = 0;
  let maxActive = 0;

  const jobs = gates.map((gate, index) =>
    queue.run(`job ${index}`, async () => {
      starts.push(index);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate.promise;
      active -= 1;
      return index;
    }),
  );

  await nextTurn();
  assert.deepEqual(starts, [0, 1]);
  assert.equal(maxActive, 2);

  gates[0].resolve();
  await jobs[0];
  await nextTurn();
  assert.deepEqual(starts, [0, 1, 2]);

  gates[1].resolve();
  gates[2].resolve();
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2]);
  assert.equal(maxActive, 2);
});

test("NvencScheduler balances work and releases leases after failures", async () => {
  const scheduler = new NvencScheduler([0, 1], 1, silentLogger);
  const firstGate = deferred();
  const secondGate = deferred();
  const assignments: number[] = [];

  const first = scheduler.run("first", async (gpuIndex) => {
    assignments.push(gpuIndex);
    await firstGate.promise;
    return gpuIndex;
  });
  const second = scheduler.run("second", async (gpuIndex) => {
    assignments.push(gpuIndex);
    await secondGate.promise;
    return gpuIndex;
  });
  const third = scheduler.run("third", async (gpuIndex) => {
    assignments.push(gpuIndex);
    return gpuIndex;
  });

  await nextTurn();
  assert.deepEqual(assignments, [0, 1]);

  firstGate.resolve();
  assert.equal(await first, 0);
  assert.equal(await third, 0);

  secondGate.resolve();
  assert.equal(await second, 1);

  await assert.rejects(
    scheduler.run("failure", async () => {
      throw new Error("encode failed");
    }),
    /encode failed/,
  );

  const recoveredGpu = await scheduler.run("after failure", async (gpuIndex) => gpuIndex);
  assert.ok(recoveredGpu === 0 || recoveredGpu === 1);
});

test("unusable GPUs are removed before scheduler construction", () => {
  const probed: number[] = [];
  const usable = filterUsableGpuIndices([0, 1, 2], (gpuIndex) => {
    probed.push(gpuIndex);
    return gpuIndex !== 1;
  });

  assert.deepEqual(probed, [0, 1, 2]);
  assert.deepEqual(usable, [0, 2]);

  const scheduler = new NvencScheduler(usable, 1, silentLogger);
  assert.ok(scheduler);
});