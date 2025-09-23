import os from 'os';
import { exec } from 'child_process';

// In-memory metrics store
const MAX_REQUEST_SAMPLES = 5000; // cap memory
const requests = []; // [{ ts, endpoint, ms, success }]

let lastCpuSample = {
  time: Date.now(),
  cpu: process.cpuUsage(), // microseconds
};
let lastCpuPercent = 0; // 0..100

let lastDiskSampleAt = 0;
let lastDiskSample = { percent: 0, used: 0, free: 0, total: 0 };

// CPU sampling every 5 seconds
setInterval(() => {
  try {
    const now = Date.now();
    const cpu = process.cpuUsage(); // user/system microseconds since process start
    const elapsedMs = now - lastCpuSample.time;
    const userDiff = cpu.user - lastCpuSample.cpu.user; // microseconds
    const sysDiff = cpu.system - lastCpuSample.cpu.system; // microseconds
    const totalCpuMs = (userDiff + sysDiff) / 1000; // microseconds -> ms
    const percent = elapsedMs > 0 ? Math.min(100, Math.max(0, (totalCpuMs / elapsedMs) * 100)) : 0;
    lastCpuPercent = Number(percent.toFixed(1));
    lastCpuSample = { time: now, cpu };
  } catch (_) {
    // ignore sampling errors
  }
}, 5000).unref?.();

function recordRequest(endpoint, durationMs, statusCode = 200) {
  const ts = Date.now();
  const success = statusCode < 400;
  requests.push({ ts, endpoint, ms: durationMs, success });
  if (requests.length > MAX_REQUEST_SAMPLES) {
    requests.splice(0, requests.length - MAX_REQUEST_SAMPLES);
  }
}

function getAverageResponseTime(windowMs = 5 * 60 * 1000) {
  const since = Date.now() - windowMs;
  const slice = requests.filter(r => r.ts >= since);
  if (slice.length === 0) return 0;
  const total = slice.reduce((sum, r) => sum + r.ms, 0);
  return Math.round(total / slice.length);
}

function getRequestsPerMinute() {
  const since = Date.now() - 60 * 1000;
  return requests.filter(r => r.ts >= since).length;
}

function getEndpointStats(windowMs = 24 * 60 * 60 * 1000) {
  const since = Date.now() - windowMs;
  const map = new Map();
  for (const r of requests) {
    if (r.ts < since) continue;
    const key = r.endpoint;
    let agg = map.get(key);
    if (!agg) {
      agg = { endpoint: key, totalMs: 0, count: 0, errors: 0 };
      map.set(key, agg);
    }
    agg.totalMs += r.ms;
    agg.count += 1;
    if (!r.success) agg.errors += 1;
  }
  const arr = Array.from(map.values()).map(a => ({
    endpoint: a.endpoint,
    avgResponseTime: a.count ? Math.round(a.totalMs / a.count) : 0,
    requestCount: a.count,
    errorRate: a.count ? a.errors / a.count : 0,
  }));
  // sort by request count desc
  arr.sort((a, b) => b.requestCount - a.requestCount);
  return arr.slice(0, 50);
}

function getCpuUsage() {
  return lastCpuPercent;
}

function parseDfOutput(dfStdout) {
  // Expect: Filesystem 1K-blocks Used Available Use% Mounted on
  const lines = dfStdout.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const parts = lines[1].split(/\s+/);
  if (parts.length < 6) return null;
  const totalKb = parseInt(parts[1], 10) || 0;
  const usedKb = parseInt(parts[2], 10) || 0;
  const availKb = parseInt(parts[3], 10) || 0;
  const percent = totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : 0;
  return { percent, used: usedKb * 1024, free: availKb * 1024, total: totalKb * 1024 };
}

function parseWmicOutput(out, driveLetter) {
  // Expect columns: Caption  FreeSpace  Size
  const lines = out.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].toLowerCase();
  const idxCap = header.indexOf('caption');
  const idxFree = header.indexOf('freespace');
  const idxSize = header.indexOf('size');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cap = line.substring(idxCap, idxFree).trim();
    const free = line.substring(idxFree, idxSize).trim();
    const size = line.substring(idxSize).trim();
    if (cap.toUpperCase().startsWith(driveLetter.toUpperCase())) {
      const freeB = parseInt(free, 10) || 0;
      const sizeB = parseInt(size, 10) || 0;
      const usedB = Math.max(0, sizeB - freeB);
      const percent = sizeB > 0 ? Math.round((usedB / sizeB) * 100) : 0;
      return { percent, used: usedB, free: freeB, total: sizeB };
    }
  }
  return null;
}

function parseCimJson(out, driveLetter) {
  try {
    const data = JSON.parse(out);
    const arr = Array.isArray(data) ? data : [data];
    for (const d of arr) {
      const dev = String(d.DeviceID || d.Caption || '').toUpperCase();
      if (dev.startsWith(String(driveLetter).toUpperCase())) {
        const freeB = parseInt(d.FreeSpace, 10) || 0;
        const sizeB = parseInt(d.Size, 10) || 0;
        const usedB = Math.max(0, sizeB - freeB);
        const percent = sizeB > 0 ? Math.round((usedB / sizeB) * 100) : 0;
        return { percent, used: usedB, free: freeB, total: sizeB };
      }
    }
  } catch (_) {
    // ignore
  }
  return null;
}

function getDiskUsage() {
  const now = Date.now();
  if (now - lastDiskSampleAt < 60 * 1000 && lastDiskSample.total > 0) {
    return Promise.resolve(lastDiskSample);
  }
  return new Promise((resolve) => {
    const onResult = (res) => {
      lastDiskSample = res || { percent: 0, used: 0, free: 0, total: 0 };
      lastDiskSampleAt = Date.now();
      resolve(lastDiskSample);
    };
    try {
      if (process.platform === 'win32') {
        const cwd = process.cwd();
        const driveLetter = cwd.slice(0, 2); // e.g., 'C:'
        // Prefer modern PowerShell CIM; fallback to WMIC
        const psCmd = 'powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_LogicalDisk | Select-Object DeviceID,FreeSpace,Size | ConvertTo-Json -Depth 2"';
        exec(psCmd, { timeout: 3000 }, (psErr, psOut) => {
          if (!psErr && psOut) {
            const parsedCim = parseCimJson(psOut, driveLetter);
            if (parsedCim) return onResult(parsedCim);
          }
          exec('wmic logicaldisk get Caption,FreeSpace,Size', { timeout: 2000 }, (err, stdout) => {
            if (err || !stdout) return onResult(lastDiskSample);
            const parsed = parseWmicOutput(stdout, driveLetter);
            return onResult(parsed || lastDiskSample);
          });
        });
      } else {
        exec('df -k .', { timeout: 2000 }, (err, stdout) => {
          if (err || !stdout) return onResult(lastDiskSample);
          const parsed = parseDfOutput(stdout);
          return onResult(parsed || lastDiskSample);
        });
      }
    } catch (_) {
      onResult(lastDiskSample);
    }
  });
}

function getLast24ResponseTimePoints() {
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  const buckets = new Array(24).fill(null).map((_, idx) => ({
    start: now - (23 - idx) * oneHourMs,
    end: now - (22 - idx) * oneHourMs,
    totalMs: 0,
    count: 0,
  }));
  for (const r of requests) {
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (r.ts >= b.start && r.ts < b.end) {
        b.totalMs += r.ms;
        b.count += 1;
        break;
      }
    }
  }
  return buckets.map(b => ({
    responseTime: b.count ? Math.round(b.totalMs / b.count) : 0,
  }));
}

// Percentile utilities
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil(p * (sorted.length - 1));
  return sorted[idx];
}

function computeStats(slice) {
  const n = slice.length;
  if (!n) return { avg: 0, p50: 0, p90: 0, p95: 0, p99: 0, count: 0, errorRate: 0 };
  let sum = 0;
  let errs = 0;
  const arr = new Array(n);
  for (let i = 0; i < n; i++) {
    const ms = slice[i].ms;
    sum += ms;
    if (!slice[i].success) errs += 1;
    arr[i] = ms;
  }
  arr.sort((a, b) => a - b);
  const avg = Math.round(sum / n);
  const p50 = percentile(arr, 0.50);
  const p90 = percentile(arr, 0.90);
  const p95 = percentile(arr, 0.95);
  const p99 = percentile(arr, 0.99);
  const errorRate = n ? errs / n : 0;
  return { avg, p50, p90, p95, p99, count: n, errorRate };
}

function getResponseStats(windowMs = 5 * 60 * 1000) {
  const since = Date.now() - windowMs;
  const slice = requests.filter(r => r.ts >= since);
  return computeStats(slice);
}

export default {
  recordRequest,
  getAverageResponseTime,
  getRequestsPerMinute,
  getEndpointStats,
  getCpuUsage,
  getDiskUsage,
  getLast24ResponseTimePoints,
  getResponseStats,
};
