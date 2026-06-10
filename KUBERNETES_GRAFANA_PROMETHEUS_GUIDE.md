# 🚀 Kubernetes + Grafana + Prometheus: The Complete Learning Journey

> **Built from the TaskFlow production journey** — a MERN SaaS app deployed on Minikube with full observability.

This guide isn't just a list of commands. It's an interactive curriculum designed to take you through the exact journey of building a production-grade infrastructure from scratch. You won't just deploy pre-built files; you will write them, template them, and break them to see how the system reacts.

---

## 📖 Introduction: Why Kubernetes?

![Kubernetes Architecture Overview](./assets/kubernetes-architecture.jpg)

### What is Kubernetes?
Kubernetes (often abbreviated as K8s) is an open-source container orchestration platform. If Docker is the shipping container that holds your application and its dependencies, Kubernetes is the automated port facility that manages those containers—loading them, moving them, duplicating them, and replacing them if they break.

### Why is it built for Scalability?
Kubernetes is designed around a **desired state** declarative model. You don't tell Kubernetes *how* to do things; you tell it *what* you want. If you say, "I want 5 instances of my API running," Kubernetes constantly monitors your cluster to ensure exactly 5 instances exist.
- **Horizontal Scaling:** When traffic spikes, it can automatically spin up more identical containers (Pods) across multiple physical servers (Nodes).
- **Self-Healing:** If a server crashes, Kubernetes instantly detects that the container count has dropped and schedules new containers on healthy servers to maintain your desired state.
- **Load Balancing:** It automatically distributes incoming network traffic across all healthy instances of your application so no single container is overwhelmed.

### When to USE Kubernetes
- **Microservices Architecture:** When your app is broken into many small, independent services (like an API, an Auth service, a background worker, and a database) that need to talk to each other securely.
- **High Availability is Critical:** When your application absolutely cannot go down, even if a server catches fire.
- **Variable Workloads:** When you have sudden spikes in traffic (like Black Friday sales) and need the system to auto-scale instantly, then scale back down to save money.

### When NOT to use Kubernetes
- **Simple Monoliths:** If your app is a single codebase deployed to a single server (like a basic WordPress blog or a simple MVP), K8s is extreme overkill. The overhead of managing the cluster will outweigh the benefits.
- **Small Teams with No DevOps:** Kubernetes has a steep learning curve. If your team is small and focused purely on shipping features, stick to simpler PaaS solutions like Vercel, Heroku, or Render.
- **Static Websites:** If you just have HTML/CSS/JS files, host them on a CDN or S3 bucket, not a K8s cluster.

---

## 🎯 Phase 1: Setup & Groundwork

Your first task is to get the code and start the local environment.

> 🛠️ **Action Required:** Head over to the [README: Kubernetes Deployment Setup](./README.md#%E2%98%90%EF%B8%8F-kubernetes-deployment-full-setup) and follow **Steps 1 and 2** to:
> 1. Start Minikube with the required addons (`ingress`, `metrics-server`).
> 2. Build the Docker images for the API and Web frontend.
> 3. Load the images into Minikube.

Come back here once your images are loaded into Minikube!

---

## 🧱 Phase 2: Vanilla Kubernetes (The "Hard Way")

Before relying on package managers, you must understand the raw YAML components that make up a Kubernetes application. 

### 🧠 Challenge 1: Write and Deploy the API Manually

Let's build the API deployment from a blank slate.

**Step 1: The Deployment**
A Deployment manages your stateless pods. It ensures a specific number of replicas are running and handles zero-downtime rolling updates.
Create a file named `my-api.yaml` and add the following:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-taskflow-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-api
  template:
    metadata:
      labels:
        app: my-api
    spec:
      containers:
        - name: api
          image: ghcr.io/senghaniheet/taskflow-api:latest
          imagePullPolicy: Never # Crucial for local minikube images!
          ports:
            - containerPort: 5000
          # The Journey Note: Without Probes, K8s doesn't know if your app is actually ready to receive traffic, leading to dropped requests on startup!
          readinessProbe:
            httpGet:
              path: /api/health
              port: 5000
```

**Step 2: The Service**
A Service gives your pods a stable IP address so other parts of your app can find them, even as pods die and are recreated. Append this to `my-api.yaml` (separate with `---`):

```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: my-api-service
spec:
  selector:
    app: my-api # Matches the label in our Deployment!
  ports:
    - port: 5000
      targetPort: 5000
```

**Step 3: Apply and Verify**
Run the following command to send this instruction to Kubernetes:
```bash
kubectl apply -f my-api.yaml
```
Verify your pods are running:
```bash
kubectl get pods
kubectl get svc
```

*Journey Lesson:* Writing raw YAML works, but imagine managing 50 of these files across Dev, Staging, and Production. You'd be copy-pasting and manually changing `replicas: 2` to `replicas: 10`. That's where Helm comes in. 

Clean up your test: `kubectl delete -f my-api.yaml`

---

## 📦 Phase 3: Helm (The "Smart Way")

Helm is a package manager for Kubernetes. It allows you to **template** your YAML files. Instead of hardcoding values, you inject them from a central `values.yaml` file.

### 🧠 Challenge 2: Create a Helm Chart from Scratch

**Step 1: Generate the Boilerplate**
Run this command in your terminal:
```bash
helm create my-chart
```
This generates a massive folder of example files. Delete everything inside `my-chart/templates/` (we are going to write our own!).

**Step 2: Template your YAML**
Take the `my-api.yaml` we wrote in Phase 2, and save it as `my-chart/templates/api.yaml`. Now, change the hardcoded `replicas: 2` to use Go templating:

```yaml
spec:
  replicas: {{ .Values.api.replicaCount }}
```

**Step 3: Define the Values**
Open `my-chart/values.yaml` (delete the boilerplate inside it) and define your variable:
```yaml
api:
  replicaCount: 3
```

**Step 4: Deploy your Custom Chart**
```bash
helm install my-release ./my-chart
```
Check `kubectl get pods`—you should see 3 pods running because Helm injected the value from `values.yaml`!

Clean up: `helm uninstall my-release`

> 🛠️ **Action Required:** Now that you understand how Helm works under the hood, let's deploy the production-grade TaskFlow chart we built for this project. Follow **Steps 3, 4, and 5** in the [README: Kubernetes Deployment Setup](./README.md#step-3--deploy-with-helm) to deploy the real stack and configure your Ingress.

---

## 📊 Phase 4: Observability (Prometheus & Grafana)

Running an app without monitoring is flying blind. We use **Prometheus** to scrape and store metrics, and **Grafana** to visualize them.

> 🛠️ **Action Required:** Follow **Steps 1, 2, and 3** in the [README: Monitoring Setup](./README.md#%F0%9F%93%8A-monitoring-setup-prometheus--grafana) to install the stack and access the UIs.

### Prometheus & PromQL Basics
Go to your Prometheus UI (`http://localhost:9090/graph`) and try these PromQL queries to see the raw data:

- **Instant Vector (Current Value of all pods):**
  `kube_pod_info{namespace="taskflow"}`
- **Rate of Change (CPU cores used per second over 5 mins):**
  `rate(container_cpu_usage_seconds_total{namespace="taskflow", container="api"}[5m])`
- **Aggregation (Sum total CPU used by API pods, grouped by pod name):**
  `sum(rate(container_cpu_usage_seconds_total{namespace="taskflow", container="api"}[5m])) by (pod)`

### 🧠 Challenge 3: Build the Dashboard from Scratch

We provided a JSON dashboard to import, but during our journey, we built it by hand. Let's recreate a piece of it!

1. Open Grafana (`http://localhost:3000`).
2. Click **+** (Create) -> **Dashboard** -> **Add visualization**. Select the **Prometheus** data source.

**Panel 1: API CPU Usage (Time Series)**
- **The Query:** `sum(rate(container_cpu_usage_seconds_total{namespace="taskflow", container="api"}[5m])) by (pod)`
- **The Formatting:** Under the "Legend" options, type `{{pod}}` so the messy metric names turn into clean pod names.
- **The Look:** In the right sidebar, search for "Fill opacity" and turn it up to create a nice area chart. Click "Apply".

**Panel 2: API Pod Count (Stat Panel)**
- **Add a new panel.**
- **The Query:** `count(kube_pod_info{namespace="taskflow", pod=~"taskflow-api-.*"} unless on(pod) kube_pod_deletion_timestamp{namespace="taskflow"})`
- **The Formatting:** In the top right, change the visualization type from "Time series" to "Stat". Click "Apply".

You've just built a monitoring dashboard from raw metrics! *(You can always import our full comprehensive dashboard by following **Step 4** in the README).*

---

## 🔥 Phase 5: Real-World Testing & Scenarios

Now for the best part of the journey: breaking things to ensure the system is resilient.

### Scenario 1: Load Testing & Autoscaling

We configured our Horizontal Pod Autoscaler (HPA) to scale up if API CPU usage exceeds 60%. Let's prove it works by flooding the Ingress with traffic.

1. Open a terminal and run the load test script:
   ```bash
   cd server/tests/load
   node loadtest.js http://taskflow.local/api/health 50 1000
   ```
   *(This script unleashes 1000 requests using 50 concurrent connections).*
   
2. Watch the HPA react in real-time in another terminal:
   ```bash
   kubectl get hpa -n taskflow -w
   ```
3. Look at your Grafana dashboard.
   - **The Journey:** You will see the CPU spike dramatically. After about 15-30 seconds, Prometheus scrapes the new high CPU metric. The HPA detects this, requests more pods, and your Pod Count stat panel will tick upwards. Once the new pods are running, the CPU load is distributed, and the average CPU drops back down!

### Scenario 2: The Elusive Memory Leak

We added a temporary memory leak endpoint to the API (`setInterval` allocating 1MB Buffers) to test our alerting. 

1. Apply the Prometheus Alert Rules (Follow **Step 5** in the README).
2. Look at `monitoring/prometheus-alert-rule.yaml`. The `PodHighMemory` alert triggers if memory goes above a certain threshold for 1 minute (`for: 1m`).
3. **The Journey:** When we first ran this, the alert never fired! Why? Because we had a hard Kubernetes memory limit of `512Mi`. The pod was eating memory so fast that Kubernetes stepped in and **OOMKilled** (Out Of Memory Kill) the pod before the 1-minute alert timer could finish!
4. **The Lesson:** Setting aggressive K8s memory limits protects your node, but it means your pods might die before your alerting system notifies you. You have to balance limits and alert thresholds carefully.

### Scenario 3: CrashLoopBackOff

What happens when a pod keeps crashing on startup due to a bad config or broken code?
1. Apply our failure test deployment:
   ```bash
   kubectl apply -f helm/FailureTest/CrashLoopBackOff-Deply.yaml
   ```
2. Watch the pod status:
   ```bash
   kubectl get pods -w
   ```
3. **The Journey:** You'll see the pod crash, restart immediately, crash again, and then wait 10s, then 20s, then 40s. Kubernetes uses **exponential backoff** to prevent a broken app from consuming all the CPU on the node by endlessly restarting.
4. Clean up:
   ```bash
   kubectl delete -f helm/FailureTest/CrashLoopBackOff-Deply.yaml
   ```

---

## 🪵 Phase 6: Log Aggregation (Loki + Promtail)

Metrics tell you *what* is happening (high CPU, 500 errors). Logs tell you *why*. We use **Loki** as the log database and **Promtail** as the log-shipping agent that automatically collects stdout/stderr from every pod.

### Why not just `kubectl logs`?

`kubectl logs` only lets you see logs from one pod at a time. In production you have 3+ API replicas. Loki aggregates logs from **all** pods into a single queryable stream.

### 🧠 Challenge 4: Set Up Loki and Query Logs

**Step 1: Install the Stack**
```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install loki-stack grafana/loki-stack \
  --namespace monitoring \
  --set promtail.enabled=true \
  --set loki.enabled=true
```

Promtail runs as a **DaemonSet** — one agent pod per node that tails `/var/log/pods/` and ships everything to Loki.

**Step 2: Add Loki as a Grafana Datasource**
1. In Grafana, go to **Connections → Data sources → Add new data source**
2. Select **Loki**
3. Set URL: `http://loki-stack.monitoring.svc.cluster.local:3100`
4. Click **Save & Test**

**Step 3: Query Logs with LogQL**

Go to Grafana **Explore** and select the Loki datasource. Try these queries:

```logql
# All logs from the API container
{namespace="taskflow", container="api"}

# Only error logs (structured JSON API logs)
{namespace="taskflow", container="api"} | json | level="error"

# All HTTP request logs (Morgan access logs)
{namespace="taskflow", container="api"} | json | level="http"

# Search for a specific trace_id across all pods
{namespace="taskflow"} | json | trace_id="abc123..."
```

**The Journey Lesson:** Notice that the API logs are structured JSON (`{"level":"http","message":"...","trace_id":"...","span_id":"..."}`). This is why we use **Winston** with JSON format — it makes LogQL filtering trivially easy.

### 🧠 Challenge 5: Build the Log Dashboard with a Level Filter

The raw Explore view is useful, but a dashboard with dropdown filters lets anyone on your team query logs without knowing LogQL.

**The Problem:** The API container writes structured JSON logs with `level` fields. But the Web (Nginx) container writes plain text access logs with no `level` field.

**The Solution — a LogQL pipeline that handles both:**

```logql
{namespace="$namespace", container="$container"}
| json
| line_format "{{.log}}"
| json
| regexp "(?P<http_match>HTTP/1\..+ \d{3})"
| label_format level="{{if .level}}{{.level}}{{else if .http_match}}http{{else}}info{{end}}"
| level =~ "(?i)$level"
```

**How it works:**
1. `| json` + `| line_format "{{.log}}"` — strips the container runtime wrapper to get the raw log line.
2. Second `| json` — extracts `level` from structured JSON logs.
3. `| regexp` — detects HTTP access log lines by pattern.
4. `| label_format` — synthesises a unified `level` label for both log types.
5. `| level =~ "$level"` — filters by the dashboard variable (All/http/info/warn/error).

**Variables to create in Grafana:**
- `namespace` — type: `Label values`, label: `namespace`, datasource: Loki
- `container` — type: `Label values`, label: `container`, datasource: Loki  
- `level` — type: `Custom`, values: `.*,http,info,warn,error` (first is the "All" wildcard)

---

## 🔍 Phase 7: Distributed Tracing (OpenTelemetry + Tempo)

Logs tell you *what* happened on one service. Traces tell you *the full journey* of a single request across all services. When a user hits a slow API endpoint, tracing shows you exactly which database query or downstream call caused it.

### The Observability Pillars

| Signal | Tool | Answers |
|--------|------|---------|
| **Metrics** | Prometheus | *How much?* (CPU, error rate, latency percentiles) |
| **Logs** | Loki | *What happened?* (error messages, stack traces) |
| **Traces** | Tempo | *Where is it slow?* (which span in the call chain) |

### How OpenTelemetry Works

OpenTelemetry (OTel) is a vendor-neutral observability framework. It provides:
- **API** — the interface your code calls to create spans
- **SDK** — the runtime that processes and exports spans
- **Auto-instrumentation** — hooks into popular libraries (Express, Mongoose, HTTP) **without any code changes**

The export flow:

```
Node.js API  →  OTel SDK  →  OTLP Exporter  →  Grafana Tempo  →  Grafana Explore
              (in-process)  (gRPC port 4317)   (stores traces)   (visualises)
```

### 🧠 Challenge 6: Instrument the Node.js API

**Step 1: Install Tempo**
```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install tempo grafana/tempo --namespace monitoring
```

**Step 2: Install OTel dependencies**
```bash
cd server
npm install \
  @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-grpc \
  @grpc/grpc-js
```

> ⚠️ **Dependency Gotcha:** `@opentelemetry/auto-instrumentations-node` includes `@opentelemetry/instrumentation-mongodb`. If your Mongoose version uses `mongodb` driver **6.8.0+**, you'll get `MongoRuntimeError: Unexpected null cursor id` — a known upstream bug. **Fix:** Lock `mongoose` to `8.4.1` which uses `mongodb@6.6.2` in `package.json`.

**Step 3: Create the bootstrap file**

Create `server/src/instrumentation.js`:

```javascript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

const traceExporter = new OTLPTraceExporter();
// Endpoint and service name come from env vars:
// OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_SERVICE_NAME

const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // too noisy
    }),
  ],
});

sdk.start();
console.log('🤖 OpenTelemetry SDK initialized successfully');

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
```

**Step 4: The ESM Hook Problem**

Because this project uses ES Modules (`"type": "module"` in `package.json`), you **cannot** just import `instrumentation.js` at the top of `index.js`. OTel must load **before** any other module to hook into them.

The solution: Node.js `--import` flag, which runs a module before the main entry point.

Set this in the Kubernetes ConfigMap (via `helm/taskflow/templates/api-configmap.yaml`):
```yaml
NODE_OPTIONS: "--import ./src/instrumentation.js"
OTEL_EXPORTER_OTLP_ENDPOINT: "http://tempo.monitoring.svc.cluster.local:4317"
OTEL_SERVICE_NAME: "taskflow-api"
```

**Step 5: Auto-provision Tempo as a Grafana Datasource**

Create `helm/taskflow/templates/tempo-datasource.yaml` as a ConfigMap with label `grafana_datasource: "1"`. Grafana's sidecar container watches for this label and auto-loads it:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: taskflow-tempo-datasource
  namespace: monitoring
  labels:
    grafana_datasource: "1"
data:
  tempo-datasource.yaml: |-
    apiVersion: 1
    datasources:
    - name: Tempo
      type: tempo
      access: proxy
      url: http://tempo.monitoring.svc.cluster.local:3200
```

**Step 6: Explore Traces**

1. Make some API requests to generate spans:
   ```bash
   kubectl port-forward svc/api -n taskflow 5000:5000
   curl http://localhost:5000/api/health
   curl http://localhost:5000/api/workspaces
   ```
2. Open `http://localhost:8080/explore`
3. Select **Tempo** datasource
4. Search by **Service Name**: `taskflow-api`
5. Click a trace to see the span waterfall: `HTTP GET /api/workspaces → mongoose.find → mongodb.find`

**The Journey Lesson:** Notice how every API log line now contains `trace_id` and `span_id`. This is the **Logs → Traces correlation** pattern — you can spot an error in Loki, copy its `trace_id`, and jump directly to the exact Tempo trace to see the full call chain.

### 🧠 Challenge 7: Run a Real Load Test and Watch the Trace Flood

```bash
# Create the ConfigMap with the k6 script
kubectl create configmap loadtest-config \
  --from-file=loadtest.js=server/tests/load/loadtest.js \
  -n taskflow

# Launch the k6 pod (200 virtual users for 5 minutes)
kubectl apply -f server/tests/load/loadtest-pod.yaml

# Watch it run
kubectl logs k6-load-generator -n taskflow -f
```

While it runs, open Grafana Explore → Tempo and refresh. You'll see hundreds of traces flooding in, each representing a real HTTP request processed by the cluster.

---

## 📜 Cheatsheet

### kubectl Essentials
```bash
kubectl get pods -n taskflow -w           # Watch mode
kubectl describe pod <name> -n taskflow   # Inspect why a pod is failing (OOMKilled, ImagePullBackOff)
kubectl logs <pod-name> -n taskflow -f    # Tail logs
kubectl exec -it <pod-name> -n taskflow -- sh # SSH into a running pod
kubectl rollout restart deployment/taskflow-api -n taskflow # Force restart all pods
```

### Helm Essentials
```bash
helm install <release> <chart> -n <ns>
helm upgrade <release> <chart> -n <ns>    # Apply values.yaml changes without downtime
helm uninstall <release> -n <ns>          # Teardown the whole stack
```

### LogQL (Loki) Essentials
```logql
{namespace="taskflow", container="api"}           # All API logs
{namespace="taskflow"} | json | level="error"     # Error logs only
{namespace="taskflow"} | json | trace_id="<id>"   # Find by trace ID
```

### OTel / Tracing Essentials
```bash
# Verify OTel is initialised
kubectl logs -l app=api -n taskflow | grep "OpenTelemetry SDK"

# Check env vars injected by ConfigMap
kubectl exec <pod> -n taskflow -- env | grep OTEL

# Port-forward Tempo for direct API access
kubectl port-forward svc/tempo -n monitoring 3200:3200
```
