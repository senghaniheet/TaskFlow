# 03 — Configuration: ConfigMaps and Secrets

> **Prerequisites:** [02 — Networking](./02-networking.md)

---

## 🧠 Theory: The 12-Factor App Principle

One of the [12-Factor App](https://12factor.net/config) principles states:
> **Store config in the environment** — not in the code.

Why? Your code should be the same binary in dev, staging, and production. Only the config changes:
- Dev: `MONGO_URI=mongodb://localhost:27017/taskflow-dev`
- Production: `MONGO_URI=mongodb://mongo:27017/taskflow`

Kubernetes provides two resources for this: **ConfigMap** (non-sensitive) and **Secret** (sensitive).

---

## ConfigMap — Non-Sensitive Configuration

A ConfigMap is a dictionary of key-value pairs for configuration that is **safe to version-control**.

```yaml
data:
  NODE_ENV: "production"
  PORT: "5000"
  LOG_LEVEL: "http"
```

### Three Ways to Use a ConfigMap

**Method 1: All keys as environment variables (what this project uses)**
```yaml
envFrom:
  - configMapRef:
      name: taskflow-api-config
# NODE_ENV, PORT, LOG_LEVEL all appear as process.env.* in Node.js
```

**Method 2: Specific key as a single environment variable**
```yaml
env:
  - name: MY_NODE_ENV
    valueFrom:
      configMapKeyRef:
        name: taskflow-api-config
        key: NODE_ENV
```

**Method 3: Mount as a file inside the container**
```yaml
volumeMounts:
  - name: config-vol
    mountPath: /app/config
volumes:
  - name: config-vol
    configMap:
      name: taskflow-api-config
# Creates /app/config/NODE_ENV, /app/config/PORT as files
```

---

## Secret — Sensitive Credentials

A Secret is identical to a ConfigMap in structure, but:
- Values are **base64-encoded** (not encrypted by default!)
- Access can be controlled by RBAC
- They are stored separately in etcd

### Base64 is Not Encryption

```bash
echo -n "my-jwt-secret" | base64
# → bXktand0LXNlY3JldA==

echo "bXktand0LXNlY3JldA==" | base64 -d
# → my-jwt-secret   ← Anyone can decode this!
```

**Base64 encodes — it does not encrypt.** Anyone with `kubectl get secret` access can read the value.

### Production-Grade Secret Management

| Approach | Tool | How It Works |
|----------|------|-------------|
| Basic | K8s Secrets | Base64 in etcd. Good for learning, risky if etcd is compromised |
| Better | Sealed Secrets | Asymmetric encryption. Safe to commit encrypted secrets to Git |
| Best | Vault / Cloud | HashiCorp Vault or AWS/GCP Secrets Manager. Secrets injected at runtime |

For this project (local dev), K8s Secrets are sufficient.

### stringData vs data

```yaml
# stringData: write plaintext → K8s encodes it automatically
stringData:
  JWT_SECRET: "my-plaintext-secret"

# data: you pre-encode with base64
data:
  JWT_SECRET: "bXktcGxhaW50ZXh0LXNlY3JldA=="
```

Always use `stringData` when writing YAML by hand — it's less error-prone.

---

## The Helm Values → ConfigMap/Secret Pipeline

This is the full flow from `values.yaml` to the running container:

```
helm/taskflow/values.yaml
  api.env.nodeEnv: "production"
  api.env.jwtSecret: ""              ← empty! Set at deploy time
  api.env.otelEnabled: "true"
         ↓  helm upgrade --set api.env.jwtSecret="abc123"
helm/taskflow/templates/api-configmap.yaml
  data:
    NODE_ENV: "production"           ← from values
    NODE_OPTIONS: "--import ..."     ← only if otelEnabled == "true"
         ↓
helm/taskflow/templates/api-secret.yaml
  stringData:
    JWT_SECRET: "abc123"             ← injected via --set at deploy time
    MONGO_URI: "mongodb://..."
         ↓  kubectl apply
Kubernetes API Server stores ConfigMap + Secret in etcd
         ↓  Pod starts
Container environment:
  process.env.NODE_ENV = "production"
  process.env.JWT_SECRET = "abc123"
  process.env.MONGO_URI = "mongodb://..."
```

---

## The OTel Feature Flag Pattern

Notice this in `api-configmap.yaml`:

```yaml
{{- if eq .Values.api.env.otelEnabled "true" }}
NODE_OPTIONS: "--import ./src/instrumentation.js"
OTEL_EXPORTER_OTLP_ENDPOINT: "http://tempo.monitoring.svc.cluster.local:4317"
OTEL_SERVICE_NAME: "taskflow-api"
{{- end }}
```

This is **feature-flagging via ConfigMap + Helm**. To disable tracing without code changes:

```bash
helm upgrade taskflow ./helm/taskflow --set api.env.otelEnabled="false"
```

The ConfigMap is regenerated without the OTel variables. The checksum annotation triggers a rolling restart. The pods come back without tracing enabled. Zero code changes, zero image rebuilds.

---

## The Checksum Trick: Force Restart on Config Change

Kubernetes does **not** automatically restart pods when a ConfigMap or Secret changes. New pods created after the change will get the new config. Existing pods won't.

This project solves it with **checksum annotations**:

```yaml
# In api-deployment.yaml:
annotations:
  checksum/config: {{ include (print $.Template.BasePath "/api-configmap.yaml") . | sha256sum }}
  checksum/secret: {{ include (print $.Template.BasePath "/api-secret.yaml") . | sha256sum }}
```

When the ConfigMap content changes → its sha256 hash changes → the annotation changes → Kubernetes detects a change in the Pod spec → triggers a rolling update → all pods reload the new config.

---

## 🔍 In This Project

### ConfigMap
**File:** [`helm/taskflow/templates/api-configmap.yaml`](../helm/taskflow/templates/api-configmap.yaml)

```yaml
data:
  NODE_ENV: {{ .Values.api.env.nodeEnv | quote }}
  PORT: {{ .Values.api.env.port | quote }}
  LOG_LEVEL: {{ .Values.api.env.logLevel | default "info" | quote }}
  {{- if eq .Values.api.env.otelEnabled "true" }}
  NODE_OPTIONS: "--import ./src/instrumentation.js"
  OTEL_EXPORTER_OTLP_ENDPOINT: {{ .Values.api.env.otelExporterOtlpEndpoint | quote }}
  OTEL_SERVICE_NAME: "taskflow-api"
  {{- end }}
```

**Raw YAML version:** [`k8s-scripts/07-configmap.yaml`](../k8s-scripts/07-configmap.yaml)

### Secret
**File:** [`helm/taskflow/templates/api-secret.yaml`](../helm/taskflow/templates/api-secret.yaml)

```yaml
type: Opaque
stringData:
  JWT_SECRET: {{ .Values.api.env.jwtSecret | quote }}
  MONGO_URI: {{ .Values.api.env.mongoUri | quote }}
```

**Raw YAML version:** [`k8s-scripts/08-secret.yaml`](../k8s-scripts/08-secret.yaml)

### Values
**File:** [`helm/taskflow/values.yaml`](../helm/taskflow/values.yaml)
```yaml
api:
  env:
    jwtSecret: ""      # ← set this at deploy time, never commit
    otelEnabled: "true"
    otelExporterOtlpEndpoint: "http://tempo.monitoring.svc.cluster.local:4317"
```

---

## 🛠️ Hands-On Challenge

**Goal:** Inspect, modify, and reload configuration without rebuilding the image.

```bash
# ── Part 1: Inspect Current Config ──────────────────────────

# View the ConfigMap
kubectl get configmap -n taskflow
kubectl describe configmap taskflow-api-config -n taskflow

# View the Secret (base64 encoded)
kubectl get secret taskflow-api-secret -n taskflow -o yaml

# Decode a Secret value (PowerShell)
$encoded = kubectl get secret taskflow-api-secret -n taskflow -o jsonpath="{.data.JWT_SECRET}"
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))

# Verify env vars inside a running pod
kubectl exec -it <api-pod-name> -n taskflow -- env | grep -E "NODE_ENV|LOG_LEVEL|OTEL"

# ── Part 2: Change a Config Value and Watch Pods Restart ─────

# Change log level from "http" to "debug" via Helm
helm upgrade taskflow ./helm/taskflow \
  --namespace taskflow \
  --set api.env.logLevel="debug"

# Watch the rolling update triggered by the checksum change
kubectl rollout status deployment/taskflow-api -n taskflow

# Verify the new log level inside a pod
kubectl exec -it <new-api-pod-name> -n taskflow -- env | grep LOG_LEVEL
# Should show: LOG_LEVEL=debug

# ── Part 3: Toggle OpenTelemetry Off ─────────────────────────

# Disable tracing (no code change, no image rebuild)
helm upgrade taskflow ./helm/taskflow \
  --namespace taskflow \
  --set api.env.otelEnabled="false"

# Verify OTel vars are gone from the pod
kubectl exec -it <api-pod-name> -n taskflow -- env | grep OTEL
# Should return nothing

# Re-enable
helm upgrade taskflow ./helm/taskflow --set api.env.otelEnabled="true"
```

**What to notice:**
- Pods restart automatically when ConfigMap changes (the checksum trick)
- You can toggle features without touching code
- Secret values are base64 in etcd but plaintext inside the container as env vars

---

**Next:** [04 — Storage: PV, PVC, and StorageClass →](./04-storage.md)


## Raw YAML Reference

### [07-configmap.yaml](../k8s-scripts/07-configmap.yaml) — Non-Sensitive Config
**WHAT IS A CONFIGMAP?**
A ConfigMap stores key-value pairs of non-sensitive configuration data. It decouples config from container images.

**GOLDEN RULE:**
  - ConfigMap  → non-sensitive config (`NODE_ENV`, `PORT`)
  - Secret     → sensitive credentials (`JWT_SECRET`, `MONGO_URI`)

**THE CHECKSUM TRICK:**
When a ConfigMap changes, pods won't restart automatically. The Helm checksum annotation forces a rolling restart so the new configuration takes effect.

### [08-secret.yaml](../k8s-scripts/08-secret.yaml) — Sensitive Credentials
**WHAT IS A SECRET?**
A Secret is like a ConfigMap but for sensitive data. It stores data as base64-encoded strings.

**IMPORTANT: Base64 is ENCODING, not ENCRYPTION.**
Anyone with cluster access can decode it! Real security in production uses Sealed Secrets, HashiCorp Vault, or Cloud Secrets Managers.

**TYPES SHOWN HERE:**
  - `stringData`: write plaintext → K8s base64-encodes it for you
  - `data`: you must pre-encode with: `echo -n "value" | base64`