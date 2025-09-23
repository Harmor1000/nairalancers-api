import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { createServer } from "http";
import userRoute from "./routes/user.route.js";
import gigRoute from "./routes/gig.route.js";
import orderRoute from "./routes/order.route.js";
import conversationRoute from "./routes/conversation.route.js";
import messageRoute from "./routes/message.route.js";
import reviewRoute from "./routes/review.route.js";
import authRoute from "./routes/auth.route.js";
import settingsRoute from "./routes/settings.route.js";
import profileRoute from "./routes/profile.route.js";
import emailVerificationRoute from "./routes/emailVerification.route.js";
import registrationVerificationRoute from "./routes/registrationVerification.route.js";
import dashboardRoute from "./routes/dashboard.route.js";
import userStatusRoute from "./routes/userStatus.route.js";
import disputeRoute from "./routes/dispute.route.js";
import fraudRoute from "./routes/fraud.route.js";
import verificationRoute from "./routes/verification.route.js";
import uploadRoute from "./routes/upload.route.js";
import freelancerRoute from "./routes/freelancer.route.js";
import adminRoute from "./routes/admin.route.js";
import favoritesRoute from "./routes/favorites.route.js";
import contentModerationRoute from "./routes/contentModeration.route.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import socketService from "./services/socketService.js"; // Commented out for now
import os from "os";
import metricsService from "./services/metricsService.js";

 const app = express();
 const server = createServer(app);
 dotenv.config();
 const PORT = process.env.PORT || 8800;

 mongoose.set('strictQuery', true)

 const connect = async ()=>{
 try {
    await mongoose.connect(process.env.MONGO);
  } catch (error) {
    console.log(error);
  }
};

// Trust proxy for correct IPs and secure cookies behind Nginx/Cloudflare
app.set('trust proxy', 1);

// Configurable CORS with optional wildcard (e.g., *.netlify.app)
function buildAllowedOrigins() {
  const envList = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const defaults = [
    "http://localhost:5173",
    "http://localhost:5174",
  ];
  const extra = (process.env.CLIENT_URL ? [process.env.CLIENT_URL.trim()] : []);
  return [...new Set([...defaults, ...extra, ...envList])]
    .map(o => o.replace(/\/$/, ""));
}

function isOriginAllowed(origin, list) {
  try {
    const o = String(origin || '').replace(/\/$/, "");
    for (const item of list) {
      if (item.startsWith("*")) {
        // wildcard suffix match: *.example.com => .example.com
        const suffix = item.slice(1);
        if (o.endsWith(suffix)) return true;
      } else if (item.startsWith("http")) {
        if (o === item) return true;
      }
    }
  } catch (_) {}
  return false;
}

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    const list = buildAllowedOrigins();
    if (isOriginAllowed(origin, list)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Request timing metrics middleware
app.use((req, res, next) => {
  // High resolution start time
  const start = process.hrtime.bigint ? process.hrtime.bigint() : process.hrtime();
  res.on('finish', () => {
    let durationMs = 0;
    try {
      if (process.hrtime.bigint && typeof start === 'bigint') {
        const end = process.hrtime.bigint();
        durationMs = Number(end - start) / 1e6;
      } else {
        const diff = process.hrtime(start);
        durationMs = (diff[0] * 1e3) + (diff[1] / 1e6);
      }
    } catch (_) {
      // ignore timing errors
    }

    try {
      // Normalize dynamic IDs in the path to reduce cardinality
      let endpoint = (req.originalUrl || req.url || '/').split('?')[0];
      endpoint = endpoint
        // Mongo ObjectId
        .replace(/\b[0-9a-fA-F]{24}\b/g, ':id')
        // numbers
        .replace(/\b\d+\b/g, ':id');
      metricsService.recordRequest(endpoint, Math.max(0, Math.round(durationMs)), res.statusCode || 200);
    } catch (_) {
      // ignore metrics errors
    }
  });
  next();
});


app.use("/api/auth", authRoute);
app.use("/api/users", userRoute);
app.use("/api/gigs", gigRoute);
app.use("/api/orders", orderRoute);
app.use("/api/conversations", conversationRoute);
app.use("/api/messages", messageRoute);
app.use("/api/reviews", reviewRoute);
app.use("/api/settings", settingsRoute);
app.use("/api/profiles", profileRoute);
app.use("/api/email-verification", emailVerificationRoute);
app.use("/api/registration-verification", registrationVerificationRoute);
app.use("/api/dashboard", dashboardRoute);
app.use("/api/user-status", userStatusRoute);
app.use("/api/disputes", disputeRoute);
app.use("/api/fraud", fraudRoute);
app.use("/api/verification", verificationRoute);
app.use("/api/upload", uploadRoute);
app.use("/api/freelancers", freelancerRoute);
app.use("/api/admin", adminRoute);
app.use("/api/favorites", favoritesRoute);
app.use("/api/content-moderation", contentModerationRoute);

// Prometheus metrics endpoint (no auth)
app.get("/metrics", async (req, res) => {
  // Optional token protection via METRICS_TOKEN
  const expected = process.env.METRICS_TOKEN;
  if (expected) {
    const auth = req.headers['authorization'] || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const headerToken = req.headers['x-metrics-token'];
    const queryToken = req.query?.token;
    const provided = bearer || headerToken || queryToken;
    if (!provided || provided !== expected) {
      res.set('Content-Type', 'text/plain; charset=utf-8');
      return res.status(401).send('unauthorized');
    }
  }
  try {
    const resp5m = metricsService.getResponseStats(5 * 60 * 1000);
    const rpm = metricsService.getRequestsPerMinute();
    const cpu = metricsService.getCpuUsage();
    const disk = await metricsService.getDiskUsage();
    const uptime = process.uptime();
    const totalMem = os.totalmem?.() || 0;
    const usedMem = process.memoryUsage().rss;
    const memPercent = totalMem ? Number(((usedMem / totalMem) * 100).toFixed(1)) : 0;
    const endpoints = metricsService.getEndpointStats(24 * 60 * 60 * 1000);

    const esc = (v) => String(v).replace(/\\/g, "\\\\").replace(/\"/g, '\\"');
    const lines = [];
    // General response stats (5m window)
    lines.push('# HELP app_response_time_avg_ms Average response time over last 5 minutes');
    lines.push('# TYPE app_response_time_avg_ms gauge');
    lines.push(`app_response_time_avg_ms ${resp5m.avg || 0}`);

    lines.push('# HELP app_response_time_p50_ms p50 response time over last 5 minutes');
    lines.push('# TYPE app_response_time_p50_ms gauge');
    lines.push(`app_response_time_p50_ms ${resp5m.p50 || 0}`);

    lines.push('# HELP app_response_time_p90_ms p90 response time over last 5 minutes');
    lines.push('# TYPE app_response_time_p90_ms gauge');
    lines.push(`app_response_time_p90_ms ${resp5m.p90 || 0}`);

    lines.push('# HELP app_response_time_p95_ms p95 response time over last 5 minutes');
    lines.push('# TYPE app_response_time_p95_ms gauge');
    lines.push(`app_response_time_p95_ms ${resp5m.p95 || 0}`);

    lines.push('# HELP app_response_time_p99_ms p99 response time over last 5 minutes');
    lines.push('# TYPE app_response_time_p99_ms gauge');
    lines.push(`app_response_time_p99_ms ${resp5m.p99 || 0}`);

    lines.push('# HELP app_requests_per_minute Requests per minute over last 60 seconds');
    lines.push('# TYPE app_requests_per_minute gauge');
    lines.push(`app_requests_per_minute ${rpm}`);

    lines.push('# HELP app_cpu_usage_percent Node process CPU usage percent');
    lines.push('# TYPE app_cpu_usage_percent gauge');
    lines.push(`app_cpu_usage_percent ${cpu}`);

    lines.push('# HELP app_memory_usage_percent Process RSS over total system memory percent');
    lines.push('# TYPE app_memory_usage_percent gauge');
    lines.push(`app_memory_usage_percent ${memPercent}`);

    lines.push('# HELP app_disk_usage_percent Disk usage percent for current drive');
    lines.push('# TYPE app_disk_usage_percent gauge');
    lines.push(`app_disk_usage_percent ${disk?.percent || 0}`);

    lines.push('# HELP app_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE app_uptime_seconds gauge');
    lines.push(`app_uptime_seconds ${uptime.toFixed(0)}`);

    // Per-endpoint stats (24h window)
    lines.push('# HELP app_endpoint_avg_response_time_ms Average response time per endpoint over last 24 hours');
    lines.push('# TYPE app_endpoint_avg_response_time_ms gauge');
    for (const e of endpoints) {
      lines.push(`app_endpoint_avg_response_time_ms{endpoint="${esc(e.endpoint)}"} ${e.avgResponseTime}`);
    }

    lines.push('# HELP app_endpoint_request_count Request count per endpoint over last 24 hours');
    lines.push('# TYPE app_endpoint_request_count gauge');
    for (const e of endpoints) {
      lines.push(`app_endpoint_request_count{endpoint="${esc(e.endpoint)}"} ${e.requestCount}`);
    }

    lines.push('# HELP app_endpoint_error_rate_percent Error rate percent per endpoint over last 24 hours');
    lines.push('# TYPE app_endpoint_error_rate_percent gauge');
    for (const e of endpoints) {
      const er = e.errorRate ? Number((e.errorRate * 100).toFixed(2)) : 0;
      lines.push(`app_endpoint_error_rate_percent{endpoint="${esc(e.endpoint)}"} ${er}`);
    }

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    res.status(200).send(lines.join('\n'));
  } catch (err) {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(500).send('# metrics collection error');
  }
});

app.use((err,req,res,next)=>{
  const errorStatus = err.status || 500;
  const errorMessage = err.message || "Something went wrong!";

  return res.status(errorStatus).send(errorMessage);
})

 server.listen(PORT, ()=>{
  connect();
  
  // Initialize Socket.io when available
  try {
    socketService.init(server); // Uncomment when Socket.io is installed
    console.log(`Backend server is running on port ${PORT}`);
    console.log('WebSocket server initialized'); // Uncomment when Socket.io is installed
  } catch (error) {
    console.log(`Backend server is running on port ${PORT} (WebSocket not available)`);
  }
 })