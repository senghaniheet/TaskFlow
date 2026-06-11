# 06 — Reliability: HPA, PDB, Resource Limits, and Probes

> **Prerequisites:** [05 — Helm](./05-helm.md)

---

## 🧠 Theory: Building for Production Reliability

A production service must survive:
- **Traffic spikes** — scale out automatically, scale back in to save cost
- **Node maintenance** — drain nodes without dropping requests
- **Memory leaks** — kill and restart leaky containers before they crash the node
- **Slow starts** — don't route traffic to a container still warming up

| Problem | Solution |
|---------|---------|
| Traffic spikes | Horizontal Pod Autoscaler (HPA) |
| Node drains | Pod Disruption Budget (PDB) |
| Memory leaks | Resource Limits + OOMKill |
| Slow starts / unhealthy pods | Readiness & Liveness Probes |

---

## Resource Requests & Limits

Every container should declare its resource needs.

### Requests — For the Scheduler

The **Scheduler** uses `requests` to decide which node can fit the pod:

```
Node has 2 CPU cores, 4Gi memory
Node already running pods consuming: 1.5 CPU, 3Gi memory
New pod requests: 200m CPU, 128Mi memory

→ Node has enough room: 0.5 CPU, 1Gi remaining
→ Scheduler places pod on this node ✅
```

### Limits — For the Kernel

`limits` are enforced by the Linux kernel's cgroups:

- **CPU limit:** Container gets throttled (slowed down), NOT killed.
- **Memory limit:** If the container tries to allocate more than its limit, the kernel kills it: **OOMKilled**.

```
Memory limit: 512Mi
Container allocates 513Mi
→ Kernel sends SIGKILL (signal 9)
→ Pod restarts
→ kubectl describe pod shows: OOMKilled (exit code 137)
```

### CPU Units Reference

| Value | Meaning |
|-------|---------|
| `1000m` | 1 CPU core |
| `500m` | 0.5 CPU cores |
| `200m` | 0.2 CPU cores |
| `1` | 1 CPU core (same as 1000m) |

---

## HPA — Horizontal Pod Autoscaler

HPA automatically adjusts the number of pod replicas based on CPU and/or memory usage.

### The Scaling Loop

```
Every 15 seconds:
  1. metrics-server aggregates CPU/memory from all API pods
  2. HPA controller reads: "avg CPU = 85%, target = 60%"
  3. Desired replicas = ceil(current × (current/target))
                      = ceil(3 × (85/60))
                      = ceil(4.25) = 5
  4. HPA patches: deployment.spec.replicas = 5
  5. New pods start, CPU load distributes across 5 pods
  6. Next cycle: avg CPU drops to ~51% → within target range
```

### Cooldown Periods (prevents flapping)

| Event | Default Wait |
|-------|-------------|
| After scale-up | 3 minutes before another scale-up |
| After scale-down | 5 minutes before scale-down |

### Why minReplicas: 3?

Even at zero traffic, this project runs 3 API replicas because:
1. **High availability:** If one pod dies, 2 are still serving
2. **PDB compatibility:** PDB allows `maxUnavailable: 1`, so 3 gives a safe floor
3. **Cold start avoidance:** Requests don't wait for pods to warm up when traffic resumes

### Raw YAML ([k8s-scripts/10-hpa.yaml](../k8s-scripts/10-hpa.yaml))

```yaml
# Requires metrics-server addon: minikube addons enable metrics-server
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: taskflow-api-hpa
  namespace: taskflow
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: taskflow-api          # Must match the Deployment name exactly

  minReplicas: 3               # Floor — never scale below this
  maxReplicas: 10              # Ceiling — never scale above this

  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          # Formula: desiredReplicas = ceil(currentReplicas × (currentCPU% / 60))
          averageUtilization: 60

    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

**Helm equivalent** ([helm/taskflow/templates/api-hpa.yaml](../helm/taskflow/templates/api-hpa.yaml)):
```yaml
{{- if .Values.api.autoscaling.enabled }}
spec:
  minReplicas: {{ .Values.api.autoscaling.minReplicas }}    # 3
  maxReplicas: {{ .Values.api.autoscaling.maxReplicas }}    # 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          averageUtilization: {{ .Values.api.autoscaling.targetCPUUtilizationPercentage }}
{{- end }}
```

---

## PDB — Pod Disruption Budget

A PDB limits how many pods can be taken down **voluntarily** at the same time.

### Voluntary vs Involuntary Disruptions

| Type | Example | PDB Applies? |
|------|---------|-------------|
| Voluntary | `kubectl drain` (node maintenance), cluster autoscaler | ✅ Yes |
| Involuntary | Node hardware failure, pod OOMKilled, crash | ❌ No |

### The PDB Protection Scenario

```
3 API replicas, maxUnavailable: 1

Admin wants to drain node-1 (for OS upgrade):
kubectl drain node-1 --ignore-daemonsets

Node-1 has 2 API pods.

Step 1: K8s checks PDB → can only evict 1 pod
Step 2: Evicts api-pod-1 → 2 remaining pods, workload continues
Step 3: New pod scheduled on another node → 3 pods again
Step 4: PDB allows evicting api-pod-2 (the second pod on node-1)

Without PDB: Both pods evicted simultaneously → potential downtime
With PDB:    One at a time → always at least 2 pods serving
```

### Raw YAML ([k8s-scripts/11-pdb.yaml](../k8s-scripts/11-pdb.yaml))

```yaml
# Applies during voluntary disruptions only (node drain, upgrades).
# Does NOT protect against hardware failures or OOMKilled crashes.
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: taskflow-api-pdb
  namespace: taskflow
spec:
  # With 3 replicas: at most 1 pod can be taken down at a time during maintenance
  maxUnavailable: 1

  selector:
    matchLabels:
      app: api
```

**Helm equivalent** ([helm/taskflow/templates/api-pdb.yaml](../helm/taskflow/templates/api-pdb.yaml)):
```yaml
{{- if .Values.api.pdb.enabled }}
spec:
  maxUnavailable: {{ .Values.api.pdb.maxUnavailable }}  # 1
  selector:
    matchLabels:
      app: api
{{- end }}
```

---

## Rolling Update + PDB + HPA Together

These three work together to give you zero-downtime deploys AND safe maintenance:

```
Normal operation (3 replicas):
  [api-1] [api-2] [api-3]      All serving traffic

Rolling update begins:
  HPA: 3 desired (no load)
  PDB: maxUnavailable=1 → can only kill 1 pod at a time
  Strategy: maxSurge=1 → can create 1 extra pod

  [api-1] [api-2] [api-3] [api-NEW]   4 pods briefly
  [api-2] [api-3] [api-NEW]           3 pods (api-1 deleted)
  [api-2] [api-3] [api-NEW] [api-NEW2] 4 pods briefly
  ...
  [api-NEW] [api-NEW2] [api-NEW3]      3 pods ✅ Done
```

At no point were 0 pods serving. Gradual cutover from old to new version.

---

## 🛠️ Hands-On Challenge

**Goal:** Watch HPA scale up, observe PDB protection, and inspect resource limits.

```bash
# ── Part 1: Watch HPA Scale Up ──────────────────────────────

# Terminal 1: Watch HPA continuously
kubectl get hpa -n taskflow -w

# Terminal 2: Create load (busybox loop)
kubectl run load-test \
  --image=busybox \
  --restart=Never \
  -n taskflow \
  --command -- sh -c "while true; do wget -q -O- http://api:5000/api/health; done"

# Watch in Terminal 1:
# TARGETS will show current/target CPU%
# REPLICAS will tick upward as CPU exceeds 60%

# Kill the load test when done
kubectl delete pod load-test -n taskflow

# Watch scale-down (takes ~5 minutes by default)
kubectl get hpa -n taskflow -w

# ── Part 2: Observe PDB Protection ──────────────────────────

kubectl get pdb -n taskflow
kubectl describe pdb taskflow-api -n taskflow
# Look for: Disruptions Allowed

# Simulate a drain (without actually draining the node)
kubectl cordon minikube                 # Mark node as unschedulable
kubectl drain minikube --ignore-daemonsets --delete-emptydir-data
# Watch: pods evicted one at a time, not all at once

kubectl uncordon minikube              # Restore node scheduling

# ── Part 3: Resource Inspection ─────────────────────────────

kubectl top pods -n taskflow
kubectl top nodes

kubectl describe pod <api-pod-name> -n taskflow | grep -A 10 "Limits\|Requests"
```

**What to notice:**
- HPA reacts within ~30-60 seconds (metrics scrape + HPA evaluation cycle)
- Scale-down is much slower than scale-up (conservative, prevents flapping)
- `kubectl drain` respects PDB — pods are evicted in controlled batches

---

**Next:** [07 — Observability Architecture →](./07-observability-arch.md)