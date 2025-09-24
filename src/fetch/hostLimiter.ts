export class HostLimiter {
  constructor(private maxPerHost = 3) {}
  private inFlight = new Map<string, number>();
  private queues = new Map<string, Array<() => void>>();

  async withHostLimit<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const count = this.inFlight.get(host) ?? 0;
    if (count >= this.maxPerHost) {
      await new Promise<void>((resolve) => {
        const q = this.queues.get(host) ?? [];
        q.push(resolve);
        this.queues.set(host, q);
      });
    }
    this.inFlight.set(host, (this.inFlight.get(host) ?? 0) + 1);
    try {
      return await fn();
    } finally {
      const next = (this.queues.get(host) ?? []).shift();
      if (next) {
        // Let the next waiter proceed
        next();
      } else {
        // No waiters; decrement count
        const c = (this.inFlight.get(host) ?? 1) - 1;
        if (c <= 0) this.inFlight.delete(host);
        else this.inFlight.set(host, c);
      }
    }
  }
}
