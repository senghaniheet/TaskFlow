# 09 — Logging: Loki, Promtail, and LogQL

> **Prerequisites:** [08 — Metrics](./08-metrics.md)

---

## 🧠 Theory: Modern Logging in Kubernetes

### The Problem with Files
In traditional servers, you configure your app to write logs to `/var/log/myapp.log`. You SSH into the server and use `grep` or `tail` to read them.

In Kubernetes, Pods are ephemeral. If a Pod crashes and is restarted, its local filesystem is destroyed. SSHing into a Pod to read a file is an anti-pattern.

### The Kubernetes Solution: stdout
In Kubernetes, **your application should only write to `stdout` and `stderr`**.

Kubernetes intercepts everything written to `stdout/stderr` and writes it to a file on the host Node at `/var/log/pods/`. This allows log collectors to read the logs without needing to be inside your container.

### The Problem with Plain Text
```text
2023-10-27T10:00:00Z INFO User login successful user_id=123 ip=192.168.1.1
```
This is readable by humans, but terrible for machines. If you want to search for all failed logins from a specific IP, you have to write complex regex.

### The Solution: Structured Logging (JSON)
```json
{"timestamp":"2023-10-27T10:00:00Z","level":"info","message":"User login successful","user_id":"123","ip":"192.168.1.1"}
```
JSON is easily parsed by log aggregation systems. You can instantly filter by `level="info"` or `user_id="123"`.

---

## The Loki + Promtail Stack

### 🌿 Promtail (The Collector)
Promtail is deployed as a **DaemonSet** (exactly one Pod runs on every Node in the cluster).

1. It mounts the Node's `/var/log/pods/` directory.
2. It tails the log files of all containers running on that Node.
3. It talks to the Kubernetes API to attach labels to each log line (e.g., `namespace="taskflow"`, `pod="api-abc"`, `container="api"`).
4. It pushes batches of these labeled log lines to Loki via HTTP.

### 🪵 Loki (The Store)
Loki is deeply inspired by Prometheus. The key difference between Loki and Elasticsearch (ELK stack):

- **Elasticsearch:** Indexes the *content* of every log message. Very fast searches, but requires massive amounts of RAM and storage. Expensive to scale.
- **Loki:** Only indexes the *labels* attached to the log stream. The actual log content is compressed and stored cheaply (e.g., in an S3 bucket). Slower full-text search, but incredibly cheap to run at scale.

Because Loki and Prometheus share the same label model, you can instantly pivot from a Prometheus metric (e.g., CPU spike on `pod="api-abc"`) to the exact Loki logs for that specific pod.

---

## LogQL: Querying Loki

LogQL is the query language for Loki. It looks very similar to PromQL.

A LogQL query has two parts:
1. **The Log Stream Selector:** Finds the right logs using indexed labels (Fast).
2. **The Log Pipeline:** Filters, parses, and formats the log lines (Slower).

### 1. The Stream Selector
Always start by narrowing down the stream.

```logql
# Give me all logs from the api container in the taskflow namespace
{namespace="taskflow", container="api"}

# Give me logs from any pod whose name starts with "mongo"
{namespace="taskflow", pod=~"mongo.*"}
```

### 2. The Log Pipeline
Use the `|` operator to chain pipeline stages.

**Searching for text:**
```logql
{namespace="taskflow", container="api"} |= "error"    # Contains the word "error"
{namespace="taskflow", container="api"} != "debug"    # Does NOT contain "debug"
```

**Parsing JSON:**
The `| json` parser extracts all JSON fields and turns them into temporary labels you can filter on.
```logql
{namespace="taskflow", container="api"} | json | level="error"
```
*This parses the JSON, looks for the `level` key, and only keeps lines where it equals "error".*

**Formatting Output:**
Sometimes JSON is hard to read. You can reformat the output line.
```logql
{namespace="taskflow", container="api"} | json | line_format "{{.timestamp}} [{{.level}}] {{.message}}"
```

---

## 🔍 In This Project

### 1. Structured Logging in the API
**File:** [`server/src/utils/logger.js`](../server/src/utils/logger.js) (or where Winston is configured)

The API uses `winston` to log in JSON format:
```javascript
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json() // Forces all logs to stdout as JSON
  ),
  transports: [new winston.transports.Console()]
});
```

### 2. The Unified Log Dashboard
**File:** [`monitoring/log-dashboard.json`](../monitoring/log-dashboard.json)

Different containers log in different formats:
- The Node API logs structured JSON with a `level` field.
- Nginx (the web frontend) logs plain text HTTP access logs without a `level` field.

The Grafana dashboard we built uses a complex LogQL query to unify them:

```logql
{namespace="$namespace", container="$container"} 
  | json 
  | line_format "{{.log}}" 
  | json 
  | regexp "(?P<http_match>HTTP/1\\..+ \\d{3})" 
  | label_format level="{{if .level}}{{.level}}{{else if .http_match}}http{{else}}info{{end}}" 
  | level =~ "(?i)$level"
```

**How this pipeline works:**
1. Select the stream based on Grafana variables (`$namespace`, `$container`).
2. `| json | line_format "{{.log}}" | json`: Minikube's Docker driver wraps the actual stdout output in its own JSON. This double-parses it to get to the *actual* log content.
3. `| regexp`: Looks for HTTP access logs (like Nginx) and captures them.
4. `| label_format`: A conditional rule! If it's the Node API, use its `.level`. If it's Nginx (caught by the regex), label it `http`. Otherwise, default to `info`.
5. `| level =~ "(?i)$level"`: Finally, filter by the Dropdown variable in the Grafana dashboard.

---

## 🛠️ Hands-On Challenge

**Goal:** Generate errors and use LogQL to find them.

```bash
# 1. Open Grafana Explore
kubectl port-forward svc/monitoring-grafana -n monitoring 8080:80
# Go to http://localhost:8080/explore and select the "Loki" datasource.

# 2. Generate some normal traffic and some 404 errors
for i in {1..5}; do curl -s http://taskflow.local/api/workspaces > /dev/null; done
for i in {1..3}; do curl -s http://taskflow.local/api/this-route-does-not-exist > /dev/null; done

# 3. View the raw logs
# Run this query in Grafana:
{namespace="taskflow", container="api"}
# You will see the raw JSON lines. Expand one to see the detected fields.

# 4. Find the errors
# Run this query:
{namespace="taskflow", container="api"} | json | level="error"
# You should see the 404 errors you generated.

# 5. Extract specific fields
# Run this query to only show the requested path and the status code:
{namespace="taskflow", container="api"} | json | level="error" | line_format "Failed request to: {{.req.url}} (Status: {{.status}})"
```

**What to notice:**
- The pipeline `| json` is incredibly powerful for slicing and dicing structured logs.
- Loki handles parsing *at query time*, not at ingestion time. This keeps ingestion fast and cheap.

---

**Next:** [10 — Distributed Tracing: OpenTelemetry and Tempo →](./10-tracing.md)
