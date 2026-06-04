# 🚀 Kubernetes + Grafana + Prometheus: A Real-World Learning Guide

> **Built from the TaskFlow production journey** — a MERN (MongoDB, Express, React, Node.js) SaaS app deployed on Minikube with full observability. Every concept here was learned by doing — including the mistakes.

---

## 📚 Table of Contents

1. [Kubernetes Core Concepts](#1-kubernetes-core-concepts)
2. [Setting Up Minikube Locally](#2-setting-up-minikube-locally)
3. [Helm — Kubernetes Package Manager](#3-helm--kubernetes-package-manager)
4. [Workloads: Deployments vs StatefulSets](#4-workloads-deployments-vs-statefulsets)
5. [Services & Ingress](#5-services--ingress)
6. [Horizontal Pod Autoscaler (HPA)](#6-horizontal-pod-autoscaler-hpa)
7. [Pod Disruption Budgets (PDB)](#7-pod-disruption-budgets-pdb)
8. [Prometheus — Metrics Collection](#8-prometheus--metrics-collection)
9. [Grafana — Dashboards & Visualization](#9-grafana--dashboards--visualization)
10. [PromQL — Querying Metrics](#10-promql--querying-metrics)
11. [Alert Rules](#11-alert-rules)
12. [Load Testing & Autoscaling Validation](#12-load-testing--autoscaling-validation)
13. [Memory Leak Detection](#13-memory-leak-detection)
14. [CI/CD with GitHub Actions](#14-cicd-with-github-actions)
15. [Quick Reference Cheatsheet](#15-quick-reference-cheatsheet)

---

## 1. Kubernetes Core Concepts

### What is Kubernetes?

Kubernetes (K8s) is a **container orchestration platform**. You tell it *what* you want running (via YAML manifests), and it figures out *how* to run and keep it alive.

### The Key Objects

| Object | Purpose |
|--------|---------|
| **Pod** | The smallest deployable unit. Wraps one or more containers. |
| **Deployment** | Manages stateless Pods. Handles rolling updates, replicas. |
| **StatefulSet** | Like Deployment, but for stateful apps (DBs). Stable network IDs, ordered scaling. |
| **Service** | Exposes Pods via a stable DNS name and IP. |
| **Ingress** | HTTP/HTTPS routing from outside the cluster into Services. |
| **ConfigMap** | Store non-secret config (env vars, config files). |
| **Secret** | Store sensitive config (passwords, API keys) — base64 encoded. |
| **HPA** | Auto-scale Pods based on CPU/memory. |
| **PDB** | Guarantee minimum available Pods during disruptions. |
| **Namespace** | Logical grouping of resources (like folders). |
| **PersistentVolumeClaim** | Request storage for stateful apps. |

### The Control Loop

Kubernetes works on **desired state vs actual state**. You declare what you want, Kubernetes constantly reconciles:

```
Desired: 3 API replicas
Actual:  2 running (1 crashed)
Action:  Kubernetes spins up a new one
```

---

## 2. Setting Up Minikube Locally

Minikube runs a single-node K8s cluster on your local machine inside a VM or Docker.

### Install & Start

```bash
# Start the cluster (uses Docker driver by default)
minikube start

# Start with more resources (important for monitoring stack!)
minikube start --cpus=4 --memory=6144

# Check status
minikube status

# Get the cluster IP (use this to access NodePort services)
minikube ip
```

### Essential Minikube Commands

```bash
# Enable the ingress addon (required for Nginx Ingress)
minikube addons enable ingress

# Enable metrics-server (required for HPA CPU metrics)
minikube addons enable metrics-server

# Open a service in browser automatically
minikube service <service-name> -n <namespace>

# SSH into the node (for debugging)
minikube ssh

# Delete the cluster (nuclear option)
minikube delete
```

### Port Forwarding (Key Concept!)

`kubectl port-forward` maps a local port to a port inside the cluster. This is your main way to access internal services during local dev:

```bash
# Access Grafana at localhost:3000
kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80

# Access Prometheus at localhost:9090
kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090

# Access your app API directly
kubectl port-forward svc/api -n taskflow 5000:5000
```

> **Gotcha:** Port forwarding is NOT persistent. If you close the terminal, it stops. For permanent local access, use `minikube service` or configure Ingress.

---

## 3. Helm — Kubernetes Package Manager

Helm lets you package, version, and deploy Kubernetes resources as reusable **charts**.

### The Analogy

- **Helm** = npm / pip / apt
- **Chart** = a package (contains YAML templates + `values.yaml`)
- **Release** = an installed instance of a chart
- **values.yaml** = the knobs you turn to customize the chart

### Our TaskFlow Chart Structure

```
helm/taskflow/
├── Chart.yaml          # Chart metadata (name, version, appVersion)
├── values.yaml         # Default configuration values
└── templates/
    ├── _helpers.tpl           # Reusable template functions
    ├── namespace.yaml         # Creates the 'taskflow' namespace
    ├── api-deployment.yaml    # API pods (Node.js/Express)
    ├── api-service.yaml       # Exposes API pods internally
    ├── api-hpa.yaml           # Autoscaling for API
    ├── api-pdb.yaml           # Disruption budget for API
    ├── api-configmap.yaml     # Environment config
    ├── api-secret.yaml        # JWT secret, etc.
    ├── web-deployment.yaml    # React/Nginx frontend pods
    ├── web-service.yaml       # Exposes web pods internally
    ├── web-hpa.yaml           # Autoscaling for web
    ├── web-pdb.yaml           # Disruption budget for web
    ├── mongo-statefulset.yaml # MongoDB (stateful)
    ├── mongo-service.yaml     # MongoDB service (headless + ClusterIP)
    ├── mongo-pvc.yaml         # Persistent storage for Mongo
    └── ingress.yaml           # External HTTP routing
```

### Key Helm Commands

```bash
# Install a chart
helm install taskflow ./helm/taskflow --namespace taskflow --create-namespace

# Upgrade (apply changes)
helm upgrade taskflow ./helm/taskflow --namespace taskflow

# Check what would render (dry-run)
helm template taskflow ./helm/taskflow

# List installed releases
helm list -A

# Uninstall
helm uninstall taskflow --namespace taskflow

# Install with value overrides (useful for dev)
helm install taskflow ./helm/taskflow \
  --set api.replicaCount=1 \
  --set web.replicaCount=1
```

### values.yaml Pattern

```yaml
# helm/taskflow/values.yaml
api:
  replicaCount: 3
  image:
    repository: ghcr.io/senghaniheet/taskflow-api
    tag: latest
    pullPolicy: Always
  resources:
    requests:
      cpu: 200m      # 0.2 cores
      memory: 128Mi  # 128 MiB
    limits:
      cpu: 1000m     # 1 full core
      memory: 512Mi
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 60
    targetMemoryUtilizationPercentage: 80
```

In templates, reference values using `{{ .Values.api.replicaCount }}`.

> **Pro Tip:** The `resources.requests` values are critical for HPA and scheduling. Without them, the scheduler doesn't know where to place pods, and HPA can't calculate utilization percentages.

---

## 4. Workloads: Deployments vs StatefulSets

### Deployments — For Stateless Apps (API, Web)

```yaml
# api-deployment.yaml (simplified)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: taskflow-api
  namespace: taskflow
spec:
  replicas: 3                  # Desired pod count
  strategy:
    type: RollingUpdate        # Zero-downtime updates
    rollingUpdate:
      maxSurge: 1              # Add 1 extra pod during update
      maxUnavailable: 0        # Never take any pod offline first
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: ghcr.io/senghaniheet/taskflow-api:latest
          ports:
            - containerPort: 5000
          livenessProbe:       # K8s restarts pod if this fails
            httpGet:
              path: /api/health
              port: 5000
            initialDelaySeconds: 15
            periodSeconds: 15
          readinessProbe:      # K8s only routes traffic if this passes
            httpGet:
              path: /api/health
              port: 5000
            initialDelaySeconds: 5
            periodSeconds: 10
```

**Key concepts:**
- `replicas` is ignored when HPA is active (HPA controls it)
- `RollingUpdate` with `maxUnavailable: 0` = zero-downtime deploys
- **Liveness probe** = "is the pod alive?" → restart if fail
- **Readiness probe** = "is the pod ready for traffic?" → exclude from Service if fail

### StatefulSets — For Stateful Apps (MongoDB)

```yaml
# mongo-statefulset.yaml (simplified)
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: taskflow-mongo
  namespace: taskflow
spec:
  serviceName: taskflow-mongo  # Headless service name (required!)
  replicas: 1
  selector:
    matchLabels:
      app: mongo
  template:
    spec:
      containers:
        - name: mongo
          image: mongo:7
          ports:
            - containerPort: 27017
          volumeMounts:
            - name: mongo-storage
              mountPath: /data/db   # Mongo data directory
      volumes:
        - name: mongo-storage
          persistentVolumeClaim:
            claimName: taskflow-mongo-pvc
```

**Why StatefulSet for MongoDB?**
- Pods get **stable names**: `taskflow-mongo-0`, `taskflow-mongo-1` (not random)
- Pods start and stop **in order**
- Each pod can have its own **persistent storage**
- Required for MongoDB Replica Sets (member discovery)

---

## 5. Services & Ingress

### Service Types

| Type | Description | When to Use |
|------|-------------|-------------|
| `ClusterIP` | Internal cluster DNS only | API-to-DB communication |
| `NodePort` | Accessible via `<node-ip>:<port>` | Quick local testing |
| `LoadBalancer` | Provisions cloud load balancer | Production on cloud |
| Headless (`clusterIP: None`) | Returns pod IPs directly | StatefulSets, service discovery |

### TaskFlow Service Pattern

```yaml
# api-service.yaml — ClusterIP (internal only)
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: taskflow
spec:
  selector:
    app: api           # Routes to pods with label app=api
  ports:
    - port: 5000
      targetPort: 5000
```

### Ingress — External HTTP Routing

```yaml
# ingress.yaml — Routes external requests to services
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: taskflow-ingress
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
    nginx.ingress.kubernetes.io/use-regex: "true"
spec:
  ingressClassName: nginx
  rules:
    - host: taskflow.local
      http:
        paths:
          - path: /api          # All /api/* goes to API service on port 5000
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 5000
          - path: /             # All other traffic goes to Web (React/Nginx) on port 80
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

> **Local Ingress Setup:** Add `<minikube-ip> taskflow.local` to your `hosts` file (`C:\Windows\System32\drivers\etc\hosts` on Windows).

---

## 6. Horizontal Pod Autoscaler (HPA)

HPA automatically scales the number of pods based on observed metrics (CPU, memory, or custom).

### Our HPA Configuration

```yaml
# api-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: taskflow-api
  namespace: taskflow
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: taskflow-api
  minReplicas: 3      # Never go below 3
  maxReplicas: 10     # Never go above 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60   # Scale up when avg CPU > 60%
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80   # Scale up when avg memory > 80%
```

### How HPA Works

```
HPA Algorithm:
desiredReplicas = ceil(currentReplicas × (currentMetric / targetMetric))

Example:
- 3 pods running, avg CPU = 90%, target = 60%
- desiredReplicas = ceil(3 × (90/60)) = ceil(4.5) = 5 pods
```

### Monitoring HPA

```bash
# Watch HPA in real time
kubectl get hpa -n taskflow -w

# Describe HPA for events and scaling history
kubectl describe hpa taskflow-api -n taskflow
```

Output example:
```
NAME           REFERENCE               TARGETS         MINPODS   MAXPODS   REPLICAS
taskflow-api   Deployment/taskflow-api  45%/60%         3         10        3
```

> **Gotcha:** HPA requires `metrics-server` to be running. On Minikube: `minikube addons enable metrics-server`.
> **Gotcha 2:** HPA won't work if your pods don't have `resources.requests` set. The utilization % is computed as `usage / request`.

### Why Pod Count Shows Unexpected Number

When you run `count(kube_pod_info{namespace="taskflow", pod=~"taskflow-api-.*"})` and get an unexpected number (e.g., `5` when you expect `3`), it usually means:
- HPA scaled up due to load (correct behavior!)
- Old pods from previous deploys haven't been cleaned up yet
- The regex matches more pods than expected

Debug with: `kubectl get pods -n taskflow`

---

## 7. Pod Disruption Budgets (PDB)

PDB limits how many pods can be voluntarily taken offline simultaneously, ensuring availability during node drains or upgrades.

```yaml
# api-pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: taskflow-api-pdb
  namespace: taskflow
spec:
  maxUnavailable: 1      # At most 1 pod can be down at a time
  selector:
    matchLabels:
      app: api
```

With 3 replicas and `maxUnavailable: 1`:
- During a rolling update or node drain, at most 1 pod goes down → 2 always serving traffic.

---

## 8. Prometheus — Metrics Collection

Prometheus is a pull-based time-series metrics database. It **scrapes** metrics endpoints on a schedule.

### How We Installed It (kube-prometheus-stack)

```bash
# Add the Prometheus community Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install the full monitoring stack (Prometheus + Grafana + Alertmanager + exporters)
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

This installs:
- **Prometheus** — scrapes and stores metrics
- **Grafana** — visualization layer
- **Alertmanager** — routes alerts
- **kube-state-metrics** — exports K8s object state metrics
- **node-exporter** — exports host-level metrics (CPU, memory, disk)

### The Metrics Flow

```
Kubernetes Node/Pod
       │
       ├── /metrics endpoint (auto-instrumented by K8s)
       │
Prometheus ──scrapes every 15s──► Time Series DB
       │
       └── Grafana queries Prometheus for dashboards
```

### Key Metric Sources

| Exporter | Metrics Prefix | Examples |
|----------|----------------|---------|
| `kube-state-metrics` | `kube_*` | `kube_pod_info`, `kube_deployment_status_replicas` |
| `node-exporter` | `node_*` | `node_memory_MemAvailable_bytes`, `node_cpu_seconds_total` |
| `kubelet` (cAdvisor) | `container_*` | `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes` |

### Accessing Prometheus UI

```bash
# Port-forward Prometheus
kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090

# Now open: http://localhost:9090
# You can test PromQL queries in the "Graph" tab
```

---

## 9. Grafana — Dashboards & Visualization

Grafana connects to Prometheus (and other data sources) to build beautiful, interactive dashboards.

### Accessing Grafana

```bash
# Port-forward Grafana
kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80

# Get the admin password (PowerShell)
$encoded = kubectl get secret monitoring-grafana -n monitoring -o jsonpath="{.data.admin-password}"
[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($encoded))

# Username: admin
```

### Panel Types

| Panel Type | Best For |
|-----------|---------|
| **Stat** | Single current value (pod count, current CPU%) |
| **Time series** | Trends over time (CPU over 1 hour) |
| **Gauge** | Current value with min/max range |
| **Bar chart** | Comparison across categories |
| **Table** | Raw data, multi-column |

### Dashboard Structure (TaskFlow)

```
Dashboard: TaskFlow Autoscaling & Performance
├── Row: Overview
│   ├── Total Pods (stat)
│   ├── API Pods Running (stat)
│   ├── Web Pods Running (stat)
│   └── Mongo Pods Running (stat)
├── Row: Desired Pods
│   ├── API Desired Pods (stat)
│   ├── Web Desired Pods (stat)
│   ├── Mongo Desired Pods (stat)
│   └── Total Desired Pods (stat)
├── Row: CPU & Autoscaling
│   ├── CPU per API Pod (time series)
│   ├── API Replicas vs HPA Max (time series)
│   └── HPA Utilization (time series)
└── Row: Memory
    ├── Memory per API Pod (time series)
    └── Memory Leak Detector (time series)
```

### Importing a Dashboard

1. Go to **Dashboards → Import**
2. Paste the JSON content OR upload the `.json` file
3. Select the Prometheus data source
4. Click **Import**

---

## 10. PromQL — Querying Metrics

PromQL (Prometheus Query Language) is how you ask Prometheus questions about your metrics.

### Core Concepts

#### Instant Vector
Returns the current value of a metric:
```promql
kube_pod_info{namespace="taskflow"}
```

#### Range Vector
Returns values over a time window (used with functions like `rate()`):
```promql
container_cpu_usage_seconds_total[5m]
```

#### Scalar
A plain number — useful for thresholds:
```promql
vector(0.12)   # Returns 0.12 as a constant metric
```

### Essential Functions

```promql
# Rate of change (per second) over 5 min window — use for counters
rate(container_cpu_usage_seconds_total[5m])

# Sum across all pods
sum(rate(container_cpu_usage_seconds_total[5m]))

# Sum grouped by pod label (one line per pod in graph)
sum(rate(container_cpu_usage_seconds_total[5m])) by (pod)

# Average
avg(container_memory_working_set_bytes)

# Count of matching series
count(kube_pod_info{namespace="taskflow"})

# Maximum value
max(container_memory_working_set_bytes{namespace="taskflow"})
```

### Real PromQL Queries from This Project

```promql
# API pods currently running
kube_deployment_status_replicas_available{namespace="taskflow", deployment="taskflow-api"}

# CPU usage per API pod (in cores, averaged over 5 min)
sum(
  rate(container_cpu_usage_seconds_total{
    namespace="taskflow",
    pod=~"taskflow-api-.*",
    container="api"
  }[5m])
) by (pod)

# Memory usage per API pod (in bytes)
sum(
  container_memory_working_set_bytes{
    namespace="taskflow",
    pod=~"taskflow-api-.*",
    container="api"
  }
) by (pod)

# HPA desired vs current replicas
kube_horizontalpodautoscaler_status_desired_replicas{
  namespace="taskflow",
  horizontalpodautoscaler="taskflow-api"
}

# HPA CPU utilization percentage
kube_horizontalpodautoscaler_status_current_metrics_average_utilization{
  namespace="taskflow",
  metric_name="cpu"
}

# Total desired pods across all services (HPA + StatefulSet)
sum(kube_horizontalpodautoscaler_status_desired_replicas{namespace="taskflow"})
+ sum(kube_statefulset_replicas{namespace="taskflow", statefulset="taskflow-mongo"})
```

---

## 11. Alert Rules

Prometheus alert rules evaluate PromQL expressions on a schedule and fire alerts when conditions are met.

### Alert Rule Format

```yaml
# prometheus-alert-rule.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: taskflow-alerts
  namespace: monitoring
  labels:
    release: monitoring          # Must match Prometheus selector label!
    app: kube-prometheus-stack   # Must match Prometheus selector label!
spec:
  groups:
    - name: taskflow-alerts
      rules:
        - alert: PodHighCPU
          expr: sum(rate(container_cpu_usage_seconds_total[1m])) by (pod) > 0.2
          for: 1m                # Must be true for 1 full minute to fire
          labels:
            severity: warning
          annotations:
            summary: "High CPU detected in pod {{ $labels.pod }}"
            description: "CPU usage > 0.2 cores for 1 minute"
```

### Apply Alert Rules

```bash
kubectl apply -f monitoring/prometheus-alert-rule.yaml

# Verify it was picked up by Prometheus
kubectl get prometheusrule -n monitoring
```

### Alert States

```
Inactive → Pending → Firing
```

- **Inactive:** Expression is false
- **Pending:** Expression is true but `for` duration not yet elapsed
- **Firing:** Expression has been true for the full `for` duration → alert sent

---

## 12. Load Testing & Autoscaling Validation

### Basic Load Test with kubectl

```bash
# Run a one-off load generator pod
kubectl run load-generator \
  --image=busybox \
  --restart=Never \
  -n taskflow \
  --command -- sh -c "while true; do wget -q -O- http://api:5000/api/health; done"

# Watch HPA respond in real time
kubectl get hpa -n taskflow -w

# Watch pods scale up
kubectl get pods -n taskflow -w

# Clean up
kubectl delete pod load-generator -n taskflow
```

### What to Watch During Load Test

In Grafana, observe:
1. **CPU per API pod** — should rise above target (60%)
2. **HPA desired replicas** — should increase when CPU > target
3. **API pods running** — should match HPA desired (with ~30s lag)
4. **Response time** — should stay stable as pods scale

### Expected Scaling Behavior

```
Load starts → CPU rises above 60% target
       → HPA detects after ~30s (scrape interval)
       → New pods requested
       → New pods take ~15-30s to become ready (image pull + health checks)
       → Traffic routes to new pods
       → CPU drops back toward target
```

---

## 13. Memory Leak Detection

### What We Added for Testing

To simulate and detect memory leaks, we added a temporary test route to the Node.js API:

```javascript
// WARNING: Test only — never deploy to production!
const leak = [];

setInterval(() => {
  leak.push(Buffer.alloc(1024 * 1024)); // Allocate 1 MB every second
}, 1000);
```

### Key Memory Metrics in Prometheus

```promql
# Working set memory (what's actually in use, not cached)
container_memory_working_set_bytes{namespace="taskflow", container="api"}

# RSS memory (resident set size — raw process memory)
container_memory_rss{namespace="taskflow", container="api"}

# Memory limit configured
container_spec_memory_limit_bytes{namespace="taskflow", container="api"}

# Memory utilization %
(
  container_memory_working_set_bytes{namespace="taskflow", container="api"} /
  container_spec_memory_limit_bytes{namespace="taskflow", container="api"}
) * 100
```

### Signs of a Memory Leak in Grafana

A steady **upward slope** in memory usage that never comes back down:

```
Memory (MiB)
500 ┤              ████████
400 ┤         █████
300 ┤    ████
200 ┤████
    └──────────────────────► Time
```

Normal memory should fluctuate with GC cycles, not trend monotonically upward.

### Why Memory Leak Alert Might Not Trigger

1. **OOMKill racing the alert:** Container has a 512Mi limit → pod gets killed before the `for: 1m` alert duration elapses
2. **Metric granularity:** `working_set_bytes` includes OS-level caching, masking heap growth
3. **Threshold too high:** Alert threshold may be above the ceiling before OOMKill

**Fix:** Lower memory limit OR add Node.js process-level metrics via `prom-client` npm package:
```javascript
const client = require('prom-client');
client.collectDefaultMetrics(); // Exposes heap, event loop, GC metrics
```

---

## 14. CI/CD with GitHub Actions

### Our Pipeline (`.github/workflows/deploy.yml`)

```yaml
name: Deploy TaskFlow

on:
  push:
    branches:
      - main           # Triggers on every push to main

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production    # Gates behind environment protection rules

    permissions:
      packages: write  # Needed to push to GHCR
      contents: read

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Login to GHCR
        run: echo "${{ secrets.GHCR_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

      - name: Build API Image
        run: |
          docker build \
            -t ghcr.io/${{ github.repository_owner }}/taskflow-api:${{ github.sha }} \
            -t ghcr.io/${{ github.repository_owner }}/taskflow-api:latest \
            ./server

      - name: Build Web Image
        run: |
          docker build \
            -t ghcr.io/${{ github.repository_owner }}/taskflow-web:${{ github.sha }} \
            -t ghcr.io/${{ github.repository_owner }}/taskflow-web:latest \
            ./client

      - name: Push Images
        run: |
          docker push ghcr.io/${{ github.repository_owner }}/taskflow-api:${{ github.sha }}
          docker push ghcr.io/${{ github.repository_owner }}/taskflow-api:latest
          docker push ghcr.io/${{ github.repository_owner }}/taskflow-web:${{ github.sha }}
          docker push ghcr.io/${{ github.repository_owner }}/taskflow-web:latest
```

### Key Concepts

- **`${{ github.sha }}`** — each build gets a unique tag (commit SHA). Enables rollbacks.
- **`latest` tag** — always points to newest. Kubernetes uses this with `imagePullPolicy: Always`.
- **GHCR (GitHub Container Registry)** — free, integrated with GitHub, supports private images.

### Full Deployment Flow

```
Code Push to main
      │
      ▼
GitHub Actions CI
      ├── Build Docker images (API + Web)
      ├── Tag with commit SHA + latest
      ├── Push to GHCR
      │
      ▼
Kubernetes Cluster (manual step or ArgoCD)
      ├── kubectl rollout restart deployment/taskflow-api -n taskflow
      ├── K8s pulls new :latest image from GHCR
      ├── Rolling update (0 downtime via maxUnavailable: 0)
      └── Probes validate new pods before routing traffic
```

---

## 15. Quick Reference Cheatsheet

### kubectl Most-Used Commands

```bash
# Get resources
kubectl get pods -n taskflow
kubectl get pods -n taskflow -w           # Watch mode
kubectl get all -n taskflow               # Everything in namespace
kubectl get events -n taskflow --sort-by='.lastTimestamp'  # Events (great for debugging!)

# Inspect
kubectl describe pod <name> -n taskflow
kubectl describe hpa taskflow-api -n taskflow

# Logs
kubectl logs <pod-name> -n taskflow
kubectl logs <pod-name> -n taskflow -f    # Follow (like tail -f)
kubectl logs <pod-name> -n taskflow --previous  # Last crashed container

# Execute commands in a running pod
kubectl exec -it <pod-name> -n taskflow -- sh

# Port forwarding
kubectl port-forward svc/<name> -n <ns> <local-port>:<remote-port>

# Apply/delete manifests
kubectl apply -f <file.yaml>
kubectl delete -f <file.yaml>

# Scale manually (NOTE: overrides HPA!)
kubectl scale deployment taskflow-api --replicas=5 -n taskflow

# Rolling restart (picks up new image tag)
kubectl rollout restart deployment/taskflow-api -n taskflow

# Rollout status / history
kubectl rollout status deployment/taskflow-api -n taskflow
kubectl rollout history deployment/taskflow-api -n taskflow

# Rollback to previous version
kubectl rollout undo deployment/taskflow-api -n taskflow
```

### Helm Commands

```bash
helm install <release> <chart> --namespace <ns> --create-namespace
helm upgrade <release> <chart> --namespace <ns>
helm uninstall <release> --namespace <ns>
helm list -A                         # All releases
helm get values <release> -n <ns>   # See deployed values
helm template <release> <chart>      # Render templates without installing
helm diff upgrade <release> <chart>  # See what would change (needs helm-diff plugin)
```

### PromQL Quick Reference

```promql
# Count of running pods
count(kube_pod_info{namespace="taskflow"})

# CPU usage rate (in cores)
rate(container_cpu_usage_seconds_total[5m])

# Memory in MiB
container_memory_working_set_bytes / 1024 / 1024

# HPA desired replicas
kube_horizontalpodautoscaler_status_desired_replicas{namespace="taskflow"}

# Constant threshold value
vector(0.5)

# Memory % of limit
container_memory_working_set_bytes / container_spec_memory_limit_bytes * 100

# CPU cores requested vs used
container_spec_cpu_quota / container_spec_cpu_period  -- requested
rate(container_cpu_usage_seconds_total[5m])           -- used
```

### Namespace Summary for TaskFlow

| Namespace | Contents |
|-----------|---------|
| `taskflow` | API (Deployment), Web (Deployment), MongoDB (StatefulSet), Ingress |
| `monitoring` | Prometheus, Grafana, Alertmanager, kube-state-metrics, node-exporter |
| `ingress-nginx` | Nginx Ingress Controller |
| `kube-system` | Core K8s: coredns, metrics-server, kube-proxy, etc. |

---

## 🎓 Learning Path Recap

This is the journey we took — if you're starting fresh, follow this order:

1. ✅ **Start Minikube** with enough resources (`--cpus=4 --memory=6144`)
2. ✅ **Enable addons**: `ingress`, `metrics-server`
3. ✅ **Build Docker images** for API + Web, push to GHCR (or `minikube image load`)
4. ✅ **Write a Helm chart** with Deployment, Service, Ingress, HPA, PDB, ConfigMap, Secret
5. ✅ **Deploy with Helm** and verify all pods come up healthy
6. ✅ **Install kube-prometheus-stack** in the `monitoring` namespace
7. ✅ **Port-forward Prometheus** and explore metrics/PromQL in the UI
8. ✅ **Port-forward Grafana**, import a dashboard JSON, build panels
9. ✅ **Run a load test**, watch HPA scale pods in real time
10. ✅ **Create alert rules** with `PrometheusRule` resources
11. ✅ **Debug memory leaks** by observing memory metrics over time
12. ✅ **Wire up CI/CD** with GitHub Actions to auto-build/push Docker images

---

> 💡 **Final Tip:** The best way to learn Kubernetes is to break things on purpose. Delete a pod while traffic is running. Saturate CPU and watch HPA. Inject a memory leak. The system's behavior under failure teaches you more than any documentation.

---

*Guide distilled from the TaskFlow MERN CI/CD Observability journey — June 2026*  
*Project: [github.com/senghaniheet/TaskFlow](https://github.com/senghaniheet/TaskFlow)*
