# 07 — Observability Architecture: The Three Pillars

> **Prerequisites:** [06 — Reliability](./06-reliability.md)

---

## 🧠 Theory: Why You Need Three Signals

A production system is a black box. When something goes wrong, you need to answer:

- **What** is broken? → **Metrics** (Prometheus)
- **Where** did it break? → **Logs** (Loki)
- **Why** did it break? → **Traces** (Tempo)

No single signal answers all three questions. A 500 error in metrics tells you something broke. The log tells you *which request*. The trace tells you *which database call was slow* and caused the error.

| Pillar | Tool | Data Type | Question Answered |
|--------|------|-----------|------------------|
| Metrics | Prometheus | Time-series numbers | What's happening right now? Trends? |
| Logs | Loki + Promtail | Text/JSON streams | What events happened and in what order? |
| Traces | OpenTelemetry + Tempo | Span trees | Where exactly is the latency? |

---

## Full Architecture Diagram

![Kubernetes Observability Architecture](../assets/observability-architecture.png)

---

## Component Reference

### 🌐 User → Ingress → Services

The entry point. All user traffic passes through the Nginx Ingress Controller (deployed as a Minikube addon). It reads Ingress rules and routes:
- `/api/*` → Node API Service → API pods
- `/` → Web Service → React frontend pods

### 🟢 Node API — The Most Instrumented Service

The Express.js API emits **all three observability signals simultaneously**:

```
Request arrives
  ↓
Winston logs it → stdout → Promtail → Loki
  ↓
OTel SDK creates a span → exports gRPC → Tempo
  ↓
prom-client increments request_total counter
  ↓
Prometheus scrapes /api/metrics every 5s
```

### 🌿 Promtail — The Log Collector (DaemonSet)

Promtail runs as a **DaemonSet** — one pod per node. It watches `/var/log/pods/` on the host filesystem where Kubernetes writes all container stdout/stderr.

```
K8s writes container stdout/stderr
  → /var/log/pods/<namespace>/<pod>/<container>.log

Promtail watches these files
  → adds K8s metadata labels (namespace, pod, container, app)
  → pushes to Loki via HTTP POST
```

**Key insight:** You don't need to change your app to ship logs to Loki. Just write to stdout. Promtail does the rest.

### 🔥 Prometheus — The Metrics Store (Pull Model)

Prometheus uses a **pull model** — it periodically scrapes `/metrics` endpoints:

```
Every 5 seconds (configured in api-servicemonitor.yaml):
  Prometheus → GET http://api-pod-ip:5000/api/metrics
  → Parses metrics: http_requests_total{method="GET", route="/api/workspaces"} 1234
  → Stores as time-series in its TSDB
```

Prometheus scrapes multiple sources:
- **Node API** → custom business metrics (via `prom-client`)
- **Kubelet/cAdvisor** → pod CPU/memory/network
- **kube-state-metrics** → Deployment status, HPA events, Pod phase
- **node-exporter** → host OS metrics (disk I/O, filesystem)

### 🪵 Loki — The Log Store

Loki is designed to be cost-efficient. Unlike Elasticsearch:
- Loki **only indexes labels** (namespace, pod, container, level)
- Log content is stored as compressed chunks, NOT indexed
- Queries filter on labels first, then parse content

```
LogQL query:
{namespace="taskflow", container="api"} | json | level = "error"
  ↑ label filter (fast, uses index)    ↑ parse json  ↑ content filter
```

### 🔍 Tempo — The Trace Store

Tempo stores distributed traces. Each trace is a tree of **spans**:

```
Trace: GET /api/workspaces (total: 45ms)
├── Express middleware (2ms)
├── JWT verification (3ms)
├── MongoDB: db.workspaces.find() (38ms)  ← this is the bottleneck!
│   └── TCP connect (1ms)
│   └── Query execution (37ms)
└── JSON serialization (2ms)
```

The OTel SDK automatically creates spans for:
- Every incoming HTTP request (Express instrumentation)
- Every MongoDB query (Mongoose/MongoDB instrumentation)
- Every outgoing HTTP call (http/https instrumentation)

### 📊 Grafana — The Unified UI

Grafana queries all backends and presents them in one interface:

```
Dashboard panel → PromQL query → Prometheus → graph
Explore tab     → LogQL query  → Loki → log viewer
Explore tab     → TraceQL      → Tempo → trace tree
```

**Auto-provisioning:** Grafana's sidecar container watches for ConfigMaps with label `grafana_datasource: "1"`. The project's [`tempo-datasource.yaml`](../helm/taskflow/templates/tempo-datasource.yaml) ConfigMap is auto-loaded by Grafana — no manual UI clicks needed.

### 🔔 Alertmanager

Prometheus evaluates alert rules every 15 seconds. When a rule fires (e.g., CPU > 80% for 5 minutes), it sends the alert to Alertmanager, which routes it to the configured receiver (Slack, email, PagerDuty).

---

## End-to-End Data Flow

```
1. User browser → HTTPS → Nginx Ingress Controller
2. Ingress → React service (UI) or Node API service (API call)
3. Node API → MongoDB query (TCP 27017)

4. OTel SDK intercepts the request:
   → Creates HTTP span + MongoDB child span
   → Exports spans via gRPC to Tempo:4317
   
5. Winston logs the request to stdout:
   → K8s writes to /var/log/pods/...
   → Promtail tails the file
   → Promtail pushes to Loki:3100

6. prom-client increments counters:
   → Prometheus scrapes /api/metrics every 5s
   → Stores time-series in TSDB

7. Grafana queries all three:
   → Metrics dashboard: pod count, CPU, RPS
   → Log dashboard: filtered by namespace, container, level
   → Trace explore: find slow spans by service name

8. Prometheus evaluates alert rules:
   → CPU > 60% for 5m → alert fires → Alertmanager
   → Alertmanager → Slack webhook / email
```

---

## 🔍 In This Project

### Tempo Datasource Auto-Provisioning
**File:** [`helm/taskflow/templates/tempo-datasource.yaml`](../helm/taskflow/templates/tempo-datasource.yaml)

This ConfigMap is picked up by Grafana's sidecar automatically — no manual UI steps.

### ServiceMonitor (how Prometheus finds the API)
**File:** [`helm/taskflow/templates/api-servicemonitor.yaml`](../helm/taskflow/templates/api-servicemonitor.yaml)

```yaml
apiVersion: monitoring.coreos.com/v1   # ← CRD provided by kube-prometheus-stack
kind: ServiceMonitor
spec:
  selector:
    matchLabels:
      app: api
  endpoints:
    - port: http
      path: /api/metrics
      interval: 5s
```

ServiceMonitor is a Prometheus Operator **Custom Resource Definition (CRD)**. The Prometheus Operator watches for ServiceMonitor objects and automatically configures Prometheus scrape targets — no manual Prometheus config files needed.

---

## 🛠️ Hands-On: Verify All Three Signals

```bash
# ── Metrics: Is Prometheus scraping the API? ─────────────────

kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090

# Open http://localhost:9090/targets
# Look for: taskflow/taskflow-api-... → UP (green)

# ── Logs: Is Promtail shipping logs to Loki? ─────────────────

kubectl port-forward svc/loki-stack -n monitoring 3100:3100

# Test Loki directly
curl "http://localhost:3100/loki/api/v1/labels"
# Should return: namespace, pod, container, etc.

# ── Traces: Is the API sending spans to Tempo? ────────────────

# Make a request to generate a trace
curl http://taskflow.local/api/workspaces

# In Grafana Explore (http://localhost:8080/explore):
# 1. Select datasource: Tempo
# 2. Search by service name: taskflow-api
# 3. You should see spans for the request you just made

# ── Grafana: All Datasources Connected? ──────────────────────

kubectl port-forward svc/monitoring-grafana -n monitoring 8080:80
# Open http://localhost:8080
# Go to: Home → Connections → Data Sources
# All four should show: Connected ✅
```

---

**Next:** [08 — Metrics: Prometheus and PromQL →](./08-metrics.md)
