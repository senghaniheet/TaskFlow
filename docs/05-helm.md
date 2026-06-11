# 05 — Helm: The Package Manager for Kubernetes

> **Prerequisites:** [04 — Storage](./04-storage.md)

---

## 🧠 Theory: The Problem Helm Solves

After the previous chapters, you understand Deployments, Services, ConfigMaps, Secrets, PVCs, HPAs, PDBs, and Ingress. A complete application needs all of them.

Without Helm, deploying this app means:
```bash
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f pvc.yaml
kubectl apply -f statefulset.yaml
kubectl apply -f mongo-service.yaml
kubectl apply -f api-deployment.yaml
kubectl apply -f api-service.yaml
kubectl apply -f web-deployment.yaml
kubectl apply -f web-service.yaml
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml
kubectl apply -f ingress.yaml
```

And if you need a dev version with 1 replica instead of 3, you either:
- Maintain two copies of every file (dev + prod), or
- Edit files manually before each deploy (error-prone)

**Helm solves this** with templating and a single `values.yaml` file.

---

## Helm Concepts

### Chart

A **chart** is a package — a directory of YAML templates + metadata + default values. Think of it like an npm package for Kubernetes.

```
helm/taskflow/           ← Chart root
├── Chart.yaml           ← Metadata (name, version, description)
├── values.yaml          ← Default values for all templates
└── templates/           ← Go-templated YAML files
    ├── _helpers.tpl     ← Reusable template functions (like a library)
    ├── api-deployment.yaml
    ├── api-service.yaml
    └── ...
```

### Release

A **release** is a specific installed instance of a chart. You can install the same chart multiple times with different release names:

```bash
helm install prod-app ./helm/taskflow --set api.replicaCount=3
helm install staging-app ./helm/taskflow --set api.replicaCount=1
```

Both are the same chart, different releases, different configurations.

### Repository

Public Helm repositories host charts:
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack
```

---

## Go Templating Syntax

Helm uses Go's `text/template` engine. Values from `values.yaml` are injected with `{{ .Values.* }}`.

### Basic Substitution

```yaml
# values.yaml
api:
  replicaCount: 3
  image:
    repository: ghcr.io/senghaniheet/taskflow-api
    tag: latest

# templates/api-deployment.yaml
spec:
  replicas: {{ .Values.api.replicaCount }}           # → 3
  containers:
    - image: "{{ .Values.api.image.repository }}:{{ .Values.api.image.tag }}"
      # → ghcr.io/senghaniheet/taskflow-api:latest
```

### Conditionals

```yaml
# Only create HPA if autoscaling is enabled
{{- if .Values.api.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
...
{{- end }}

# Only add OTel env vars if enabled
{{- if eq .Values.api.env.otelEnabled "true" }}
NODE_OPTIONS: "--import ./src/instrumentation.js"
{{- end }}
```

### Defaults

```yaml
# Use "info" if logLevel is not set in values.yaml
LOG_LEVEL: {{ .Values.api.env.logLevel | default "info" | quote }}
```

### The `quote` Pipe

YAML treats `"5000"` (string) differently from `5000` (integer). The `| quote` pipe wraps values in quotes to enforce string type:

```yaml
PORT: {{ .Values.api.env.port | quote }}  # → PORT: "5000"  (string, not integer)
```

### The `nindent` Pipe

```yaml
labels:
  {{- include "taskflow.labels" . | nindent 4 }}
  # Indents the included block by 4 spaces — avoids YAML indentation errors
```

---

## `_helpers.tpl` — The Library File

`_helpers.tpl` defines reusable template functions. Files starting with `_` are never rendered as K8s objects — they're just function libraries.

```yaml
# _helpers.tpl defines:
{{- define "taskflow.fullname" -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "taskflow.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
```

Usage in templates:
```yaml
metadata:
  name: {{ include "taskflow.fullname" . }}-api
  # At release "taskflow": → "taskflow-api"
  labels:
    {{- include "taskflow.labels" . | nindent 4 }}
```

---

## Key Helm Commands

```bash
# Install a chart (first time)
helm install taskflow ./helm/taskflow \
  --namespace taskflow \
  --create-namespace \
  --set api.env.jwtSecret="my-secret"

# Upgrade (apply changes after editing values.yaml or templates)
helm upgrade taskflow ./helm/taskflow \
  --namespace taskflow \
  --set api.env.jwtSecret="my-secret"

# Install OR upgrade in one command
helm upgrade --install taskflow ./helm/taskflow \
  --namespace taskflow \
  --create-namespace

# List installed releases
helm list --all-namespaces

# See what Helm would generate (dry run — no K8s changes)
helm template taskflow ./helm/taskflow \
  --set api.env.jwtSecret="test"

# Lint for errors
helm lint ./helm/taskflow

# Rollback to previous version
helm rollback taskflow 1 --namespace taskflow

# See release history
helm history taskflow --namespace taskflow

# Uninstall (removes all K8s resources created by the chart)
helm uninstall taskflow --namespace taskflow
```

---

## Before Helm vs After Helm: Side-by-Side

| Raw YAML (`k8s-scripts/`) | Helm Template (`helm/taskflow/templates/`) |
|---------------------------|-------------------------------------------|
| `name: taskflow-api` | `name: {{ include "taskflow.fullname" . }}-api` |
| `replicas: 3` | `replicas: {{ .Values.api.replicaCount }}` |
| `image: ghcr.io/...:latest` | `image: "{{ .Values.api.image.repository }}:{{ .Values.api.image.tag }}"` |
| Hardcoded for one environment | Works for dev, staging, production |
| `kubectl apply -f` (13 separate files) | `helm install` (one command) |
| No rollback | `helm rollback` |
| Manual ordering | Helm tracks dependencies |

---

## 🔍 In This Project

### Chart.yaml
**File:** [`helm/taskflow/Chart.yaml`](../helm/taskflow/Chart.yaml)

Contains chart name, version, and description. Helm uses this for `helm list` output.

### values.yaml
**File:** [`helm/taskflow/values.yaml`](../helm/taskflow/values.yaml)

The entire app configuration in one file:
```yaml
namespace: taskflow
mongo:
  enabled: true         # ← Toggle internal MongoDB on/off
  storageSize: 5Gi
api:
  replicaCount: 3
  autoscaling:
    enabled: true       # ← HPA is created only when this is true
  pdb:
    enabled: true       # ← PDB is created only when this is true
  env:
    otelEnabled: "true" # ← OTel config injected only when "true"
```

### Templates vs Raw YAML

Open both and compare:
- **Raw:** [`k8s-scripts/02-deployment.yaml`](../k8s-scripts/02-deployment.yaml) — hardcoded values, heavily annotated
- **Helm:** [`helm/taskflow/templates/api-deployment.yaml`](../helm/taskflow/templates/api-deployment.yaml) — templated, flexible

---

## 🛠️ Hands-On Challenge

**Goal:** Use Helm to deploy, modify, and manage the app lifecycle.

```bash
# ── Part 1: Understand What Helm Generated ──────────────────

# Dry-run: see all YAML Helm would apply without actually deploying
helm template taskflow ./helm/taskflow \
  --set api.env.jwtSecret="test-secret"

# Count how many K8s resources the chart manages
helm template taskflow ./helm/taskflow | grep "^kind:" | sort | uniq -c

# ── Part 2: Diff Before Upgrade ─────────────────────────────

# Install the helm-diff plugin (highly recommended)
helm plugin install https://github.com/databus23/helm-diff

# See what would change BEFORE upgrading
helm diff upgrade taskflow ./helm/taskflow \
  --set api.replicaCount=5 \
  --namespace taskflow
# Shows a git-diff-style view of changes

# ── Part 3: Deploy and Scale ─────────────────────────────────

# Install the chart
helm install taskflow ./helm/taskflow \
  --namespace taskflow \
  --create-namespace \
  --set api.env.jwtSecret="your-secret-here" \
  --set api.image.pullPolicy=Never \
  --set web.image.pullPolicy=Never

# Watch everything come up
kubectl get pods -n taskflow -w

# ── Part 4: Change Config via Helm ───────────────────────────

# Change log level — triggers rolling update via checksum
helm upgrade taskflow ./helm/taskflow \
  --namespace taskflow \
  --set api.env.logLevel="debug" \
  --reuse-values     # ← reuse all other values (including jwtSecret!)

# Watch rolling update
kubectl rollout status deployment/taskflow-api -n taskflow

# ── Part 5: Release History ──────────────────────────────────

helm history taskflow --namespace taskflow
# Lists all revisions with timestamps and status

# Roll back to revision 1
helm rollback taskflow 1 --namespace taskflow
```

**What to notice:**
- `helm template` lets you preview every K8s object before touching the cluster
- `--reuse-values` prevents you from accidentally resetting other values
- Helm rollback reverts ALL K8s resources, not just the Deployment

---

**Next:** [06 — Reliability: HPA, PDB, Resource Limits →](./06-reliability.md)
