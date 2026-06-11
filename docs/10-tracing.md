# 10 — Distributed Tracing: OpenTelemetry and Tempo

> **Prerequisites:** [09 — Logging](./09-logging.md)

---

## 🧠 Theory: The "Where is it slow?" Problem

Imagine a user clicks "Load Workspaces" and it takes 3 seconds. 

- **Metrics** show a spike in latency.
- **Logs** show `HTTP GET /api/workspaces status=200 duration=3000ms`.

You know it was slow, but *why*? Was it the Express routing? The database connection? The MongoDB query itself? JSON serialization? 

Without tracing, the application is a black box. You have to guess.

**Distributed Tracing** opens the black box. It breaks a request down into a tree of **spans**, timing every operation.

---

## OpenTelemetry (OTel)

OpenTelemetry is an open-source standard for instrumenting applications. It replaces vendor-specific agents (like Datadog's or New Relic's) with a single, vendor-neutral SDK.

### The Components

1. **API:** The interfaces you use in code to create custom spans (e.g., `tracer.startSpan('my-function')`).
2. **SDK:** The engine that manages the spans, batches them, and exports them.
3. **Auto-Instrumentations:** Libraries that automatically hook into common frameworks (Express, Mongoose, HTTP) so you get traces without writing a single line of API code.
4. **OTLP:** The OpenTelemetry Protocol. The standard format for sending traces over the network (usually via gRPC).

### Context Propagation

When Service A calls Service B, how do the traces link together?
OTel injects a `traceparent` HTTP header containing the `trace_id`. Service B reads it and attaches its spans to the same trace.

---

## Grafana Tempo

Tempo is a tracing backend. It receives OTLP data, indexes it, and stores the trace trees.

**Why Tempo?**
Like Loki, it is designed for scale. It only indexes the `trace_id` and basic metadata. It stores the massive payload of span data cheaply in object storage (S3).

---

## The ESM Gotcha: Why `--import`?

Historically, APM tools used `require('my-agent')` at the very top of `index.js`. They intercepted `require()` calls to wrap libraries (like Express) before the app loaded them.

With **ES Modules (`import`)**, this doesn't work. Imports are hoisted and resolved before any code runs. You cannot intercept them from inside `index.js`.

**The Fix:** You must use Node's `--import` flag to load the OTel SDK *before* the Node.js runtime even starts parsing your application code.

---

## The Dependency Gotcha: Mongoose & OTel

If you ever try to add tracing to a project and it breaks, it's usually a dependency conflict.

In this project, we explicitly locked `mongoose` to version `8.4.1` in `package.json`. Why?
1. The OTel auto-instrumentation library hooks into the `mongodb` driver.
2. Mongoose `8.5.0+` upgraded its internal `mongodb` dependency to `6.8.0`.
3. The OTel library was not yet compatible with `mongodb 6.8.0`, causing a fatal crash (`Unexpected null cursor id`).

**Lesson:** Auto-instrumentation is magic, but it tightly couples your observability stack to the exact versions of your database drivers.

---

## 🔍 In This Project

### 1. The OTel Bootstrap File
**File:** [`server/src/instrumentation.js`](../server/src/instrumentation.js)

```javascript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [ getNodeAutoInstrumentations() ],
});
sdk.start();
```
*Notice there is no host/port configured here! It reads the `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable.*

### 2. Injecting the Bootstrap via ConfigMap
**File:** [`helm/taskflow/templates/api-configmap.yaml`](../helm/taskflow/templates/api-configmap.yaml)

```yaml
  NODE_OPTIONS: "--import ./src/instrumentation.js"
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://tempo.monitoring.svc.cluster.local:4317"
  OTEL_SERVICE_NAME: "taskflow-api"
```
This ConfigMap defines the `NODE_OPTIONS` environment variable. When the Pod starts, Node.js sees this variable and executes `instrumentation.js` before `index.js`.

### 3. Auto-Provisioning Tempo in Grafana
**File:** [`helm/taskflow/templates/tempo-datasource.yaml`](../helm/taskflow/templates/tempo-datasource.yaml)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: taskflow-tempo-datasource
  labels:
    grafana_datasource: "1"  # ← The magic label
data:
  tempo.yaml: |-
    apiVersion: 1
    datasources:
      - name: Tempo
        type: tempo
        url: http://tempo.monitoring.svc.cluster.local:3100
```
Grafana's sidecar container watches for ConfigMaps with the `grafana_datasource: "1"` label. When it sees this, it automatically configures Tempo as a data source in the UI.

---

## 🛠️ Hands-On Challenge

**Goal:** Generate a trace and find the database bottleneck.

```bash
# 1. Open Grafana Explore
kubectl port-forward svc/monitoring-grafana -n monitoring 8080:80
# Go to http://localhost:8080/explore and select the "Tempo" datasource.

# 2. Generate traffic
curl http://taskflow.local/api/workspaces

# 3. Find the trace
# In the Tempo query builder:
#   - Service Name: taskflow-api
#   - Click "Run query"
#   - Click on one of the resulting Trace IDs.

# 4. Analyze the Waterfall
# You should see a visual tree. Expand it.
# Look for the span named `mongodb.query`.
# What percentage of the total request time was spent waiting for MongoDB?
```

**What to notice:**
- The trace shows the HTTP route handler, the Express middleware, and the exact MongoDB query executed.
- If you click on the MongoDB span, you can see the actual JSON query statement in the span attributes on the right side.

---

**Next:** [11 — CI/CD: Automated Deployments →](./11-cicd.md)
