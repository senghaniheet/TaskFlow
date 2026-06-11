# 08 — Metrics: Prometheus and PromQL

> **Prerequisites:** [07 — Observability Architecture](./07-observability-arch.md)

---

## 🧠 Theory: The Prometheus Pull Model

Most observability systems (like Datadog, New Relic, or Loki) use a **push model**: your application actively sends data over the network to the backend.

Prometheus uses a **pull model** (scraping):
1. Your app exposes a local HTTP endpoint (usually `/metrics`)
2. Prometheus periodically makes an HTTP GET request to that endpoint
3. Prometheus parses the text response and stores it

### Why Pull?

- **No app config needed:** The app doesn't need to know where Prometheus is. It just opens a port.
- **Fail-safe:** If Prometheus goes down, the app is unaffected (it's just an HTTP endpoint nobody is hitting). If the app goes down, Prometheus knows instantly because the scrape fails (this is how the `up` metric works).
- **Service Discovery:** Prometheus asks the Kubernetes API server "where are all the pods?" and automatically finds their IPs.

---

## The `/metrics` Endpoint Format

When Prometheus hits `/api/metrics`, it expects plain text in this specific format:

```text
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/workspaces",status="200"} 452
http_requests_total{method="POST",route="/api/workspaces",status="201"} 12
```

Notice there are no timestamps. Prometheus adds the timestamp at the exact moment it performs the scrape.

---

## PromQL Basics

Prometheus Query Language (PromQL) is how you ask questions about your metrics.

### 1. Instant Vectors
Returns the current value of a metric right now.

```promql
# How many total requests have there ever been?
http_requests_total
```

### 2. Label Filtering
Narrow down the search.

```promql
# How many total 500 errors?
http_requests_total{status="500"}

# How many requests specifically to the workspaces route?
http_requests_total{route=~"/api/workspaces.*"}
```

### 3. Range Vectors & Rate (The most important function!)
`http_requests_total` is a Counter — it only goes up. Knowing there were 10,000 total requests doesn't tell you if the system is currently under heavy load. You want **Requests Per Second (RPS)**.

```promql
# How many requests happened in the last 5 minutes?
http_requests_total[5m]

# Rate: Calculate the per-second rate of increase over the last 5 minutes
rate(http_requests_total[5m])
```

### 4. Aggregation
Combine multiple time series into one.

```promql
# Total RPS across ALL api pods
sum(rate(http_requests_total[5m]))

# Total RPS, broken down by route
sum by (route) (rate(http_requests_total[5m]))
```

---

## What Else is Prometheus Scraping?

Besides our custom Node.js metrics, Prometheus scrapes Kubernetes itself:

1. **cAdvisor (Container Advisor):** Embedded in the Kubelet on every node. Exposes raw container metrics (CPU cores used, memory bytes used).
   - *Example metric:* `container_memory_usage_bytes`

2. **kube-state-metrics:** Talks to the K8s API server and translates the state of Deployments/Pods into metrics.
   - *Example metric:* `kube_deployment_status_replicas_available` (Is my deployment fully scaled up?)

3. **node-exporter:** Runs as a DaemonSet to expose hardware metrics from the underlying host VMs.
   - *Example metric:* `node_disk_read_bytes_total`

---

## 🔍 In This Project

### 1. The Code: Exposing Metrics in Node.js
**File:** [`server/src/index.js`](../server/src/index.js) (or similar depending on setup, but the library is `prom-client`)

The `prom-client` library in our Node.js app registers a counter and exposes the `/api/metrics` route.

```javascript
// A simple Express route that returns the metrics text
app.get('/api/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});
```

### 2. The Config: Telling Prometheus to Scrape It
**File:** [`helm/taskflow/templates/api-servicemonitor.yaml`](../helm/taskflow/templates/api-servicemonitor.yaml)

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
spec:
  selector:
    matchLabels:
      app: api       # Scrape any service with this label
  endpoints:
    - port: http
      path: /api/metrics
      interval: 5s   # Scrape every 5 seconds
```

The Prometheus Operator watches for this Custom Resource Definition (CRD) and dynamically updates Prometheus's configuration.

### 3. The Dashboard
**File:** [`monitoring/taskflow-dashboard-import.json`](../monitoring/taskflow-dashboard-import.json)

This is the JSON definition of the Grafana dashboard we built. Notice the `targets` array inside the panels contains the exact PromQL queries.

---

## 🛠️ Hands-On Challenge

**Goal:** Write your own PromQL queries and build a dashboard panel.

```bash
# 1. Port-forward Grafana
kubectl port-forward svc/monitoring-grafana -n monitoring 8080:80

# 2. Open Grafana (http://localhost:8080), go to Explore (the compass icon)
# 3. Select "Prometheus" as the data source.
```

**Query 1: Are the pods running?**
Paste this into the query bar and run it:
```promql
kube_pod_status_phase{namespace="taskflow", phase="Running"}
```
*You should see a value of `1` for every running pod in the taskflow namespace.*

**Query 2: How much memory is the API using?**
```promql
sum by (pod) (container_memory_usage_bytes{namespace="taskflow", container="api"}) / 1024 / 1024
```
*We divide by 1024 twice to convert bytes to Megabytes.*

**Query 3: API Request Rate**
```promql
sum by (method, route) (rate(http_requests_total{namespace="taskflow"}[2m]))
```

**Build a Dashboard:**
1. Generate some traffic: `curl http://taskflow.local/api/workspaces`
2. In Grafana, go to **Dashboards** → **New Dashboard** → **Add Visualization**.
3. Choose **Prometheus**.
4. Paste Query 3 above.
5. In the right panel, under **Standard options**, change Unit to `req/s`.
6. Save the dashboard!

**What to notice:**
- PromQL lets you do math directly in the query (like dividing bytes into MB).
- The `sum by (...)` clause is how you group data, exactly like a SQL `GROUP BY`.

---

**Next:** [09 — Logging: Loki and Promtail →](./09-logging.md)
