// In-memory FIFO + single worker loop. Matches the "no concurrent generation"
// non-functional requirement structurally: callers only ever enqueue, never
// call koboldClient.generateImage directly, so at most one image generation
// runs at a time regardless of how many scene changes/events fire concurrently.
// Queue state is memory-only and is lost on server restart — an accepted
// tradeoff for a personal local app (SPEC.md implementation notes).
const queue = [];
let processing = false;

export function enqueueImageJob(run) {
  queue.push(run);
  processQueue();
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const run = queue.shift();
    try {
      await run();
    } catch (err) {
      console.error('Image generation job failed:', err);
    }
  }
  processing = false;
}
