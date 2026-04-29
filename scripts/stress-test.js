const BASE_URL = "http://localhost:5000/api";
const CONCURRENCY = 25;
const CREATE_COUNT = 150;
const READ_COUNT = 300;
const STATS_COUNT = 200;
const INTEL_COUNT = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

const runBatch = async ({ name, count, concurrency, fn }) => {
  const times = [];
  let ok = 0;
  let fail = 0;
  const errors = {};
  let i = 0;

  const worker = async () => {
    while (true) {
      const index = i++;
      if (index >= count) break;
      const start = Date.now();
      try {
        await fn(index);
        ok += 1;
      } catch (err) {
        fail += 1;
        const key = err?.message || "unknown";
        errors[key] = (errors[key] || 0) + 1;
      } finally {
        times.push(Date.now() - start);
      }
    }
  };

  const start = Date.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const totalMs = Date.now() - start;
  const rps = count / (totalMs / 1000);

  return {
    name,
    count,
    ok,
    fail,
    totalMs,
    rps,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    errors,
  };
};

const request = async (path, options = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} ${text.slice(0, 120)}`);
  }
  return res;
};

const main = async () => {
  const stamp = Date.now();
  const email = `stress_${stamp}@example.com`;
  const password = "Passw0rd!123";

  await request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Stress User", email, password }),
  });

  const loginRes = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const login = await loginRes.json();
  const token = login.token;

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const createResult = await runBatch({
    name: "Create Applications",
    count: CREATE_COUNT,
    concurrency: CONCURRENCY,
    fn: async (idx) => {
      await request("/applications", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          company: `StressCo ${idx}`,
          role: "Software Engineer",
          email: `recruiter${idx}@example.com`,
          notes: `Load-test note ${idx}`,
        }),
      });
    },
  });

  await sleep(250);

  const readResult = await runBatch({
    name: "GET /applications",
    count: READ_COUNT,
    concurrency: CONCURRENCY,
    fn: async () => {
      await request("/applications", { headers: { Authorization: `Bearer ${token}` } });
    },
  });

  const statsResult = await runBatch({
    name: "GET /applications/stats",
    count: STATS_COUNT,
    concurrency: CONCURRENCY,
    fn: async () => {
      await request("/applications/stats", { headers: { Authorization: `Bearer ${token}` } });
    },
  });

  const intelResult = await runBatch({
    name: "GET /applications/intelligence",
    count: INTEL_COUNT,
    concurrency: Math.max(10, Math.floor(CONCURRENCY / 2)),
    fn: async () => {
      await request("/applications/intelligence", { headers: { Authorization: `Bearer ${token}` } });
    },
  });

  const results = [createResult, readResult, statsResult, intelResult];
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), config: { CONCURRENCY, CREATE_COUNT, READ_COUNT, STATS_COUNT, INTEL_COUNT }, results }, null, 2));
};

main().catch((err) => {
  console.error("Stress test failed:", err);
  process.exit(1);
});
