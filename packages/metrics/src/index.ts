type MetricLabels = Record<string, string>;

interface MetricEntry {
  value: number;
  labels: MetricLabels;
  timestamp: number;
}

export class MetricsRegistry {
  private counters = new Map<string, MetricEntry[]>();
  private gauges = new Map<string, MetricEntry>();
  private histograms = new Map<string, number[]>();

  increment(name: string, labels: MetricLabels = {}, value = 1): void {
    const key = this.key(name, labels);
    const entries = this.counters.get(key) ?? [];
    entries.push({ value, labels, timestamp: Date.now() });
    this.counters.set(key, entries);
  }

  gauge(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.key(name, labels);
    this.gauges.set(key, { value, labels, timestamp: Date.now() });
  }

  observe(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.key(name, labels);
    const values = this.histograms.get(key) ?? [];
    values.push(value);
    if (values.length > 10000) values.shift();
    this.histograms.set(key, values);
  }

  toPrometheus(): string {
    const lines: string[] = [];

    for (const [key, entries] of this.counters) {
      const total = entries.reduce((sum, e) => sum + e.value, 0);
      const [name, ...labelParts] = key.split('|');
      const labelStr = labelParts.length ? `{${labelParts.join(',')}}` : '';
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${labelStr} ${total}`);
    }

    for (const [key, entry] of this.gauges) {
      const [name, ...labelParts] = key.split('|');
      const labelStr = labelParts.length ? `{${labelParts.join(',')}}` : '';
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${labelStr} ${entry.value}`);
    }

    for (const [key, values] of this.histograms) {
      const [name] = key.split('|');
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      lines.push(`# TYPE ${name} summary`);
      lines.push(`${name}_count ${sorted.length}`);
      lines.push(`${name}_sum ${sum}`);
      lines.push(`${name}{quantile="0.5"} ${sorted[Math.floor(sorted.length * 0.5)] ?? 0}`);
      lines.push(`${name}{quantile="0.95"} ${sorted[Math.floor(sorted.length * 0.95)] ?? 0}`);
      lines.push(`${name}{quantile="0.99"} ${sorted[Math.floor(sorted.length * 0.99)] ?? 0}`);
    }

    return lines.join('\n') + '\n';
  }

  private key(name: string, labels: MetricLabels): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}|${labelStr}` : name;
  }
}

export const globalMetrics = new MetricsRegistry();
