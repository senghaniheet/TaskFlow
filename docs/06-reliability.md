# 06 — Reliability: HPA, PDB, Resource Limits, and Probes

> **Prerequisites:** [05 — Helm](./05-helm.md)

---

## 🧠 Theory: Building for Production Reliability

A production service must survive:
- **Traffic spikes** — scale out automatically, scale back in to save cost
- **Node maintenance** — drain nodes without dropping requests
- **Memory leaks** — kill and restart leaky containers before they crash the node
- **Slow starts** — don't route traffic to a container still warming up

Kubernetes provides four mechanisms for this:

| Problem | Solution |
|---------|---------|
| Traffic spikes | Horizontal Pod Autoscaler (HPA) |
| Node drains | Pod Disruption Budget (PDB) |
| Memory leaks | Resource Limits + OOMKill |
| Slow starts / unhealthy pods | Readiness & Liveness Probes |

---

## Resource Requests & Limits

Every container should declare its resource needs.

```yaml
resources:
  requests:             # Minimum guaranteed allocation
    cpu: 200m           # 200 millicores = 0.2 CPU cores
    memory: 128Mi
  limits:               # Hard ceiling — container is killed if exceeded
    cpu: 1000m          # 1 full core max
    memory: 512Mi
```

### Requests: For the Scheduler

The **Scheduler** uses `requests` to decide which node can fit the pod:

```
Node has 2 CPU cores, 4Gi memory
Node already running pods consuming: 1.5 CPU, 3Gi memory
New pod requests: 200m CPU, 128Mi memory

→ Node has enough room: 0.5 CPU, 1Gi remaining
→ Scheduler places pod on this node ✅
```

### Limits: For the Kernel

`limits` are enforced by the Linux kernel's cgroups:

- **CPU limit:** Container gets throttled (slowed down), NOT killed. It can't burst above its limit.
- **Memory limit:** If the container tries to allocate more than its limit, the kernel kills it: **OOMKilled**.

### OOMKilled: The Memory Limit Lesson

```
Memory limit: 512Mi
Container allocates 513Mi
→ Kernel sends SIGKILL (signal 9)
→ Pod restarts
→ kubectl describe pod shows: OOMKilled (exit code 137)
```

When we ran the memory leak test:
```
Prometheus alert: PodHighMemory (for: 1m)  ← alert wants 1 minute of high memory
K8s memory limit: 512Mi                   ← K8s kills the pod in seconds

Result: Pod was killed before the 1-minute alert window expired!
Lesson: Balance your K8s limits with your alert thresholds.
```

### CPU Units

| Value | Meaning |
|-------|---------|
| `1000m` | 1 CPU core |
| `500m` | 0.5 CPU cores |
| `100m` | 0.1 CPU cores (100 millicores) |
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

This prevents oscillation: don't scale down the moment CPU drops briefly.

### Why minReplicas: 3?

Even at zero traffic, this project runs 3 API replicas. Why?

1. **High availability:** If one pod dies, 2 are still serving (zero downtime)
2. **PDB compatibility:** PDB allows `maxUnavailable: 1`, so you need at least 2 always running — 3 gives the comfortable floor
3. **Cold start avoidance:** New requests don't wait for pods to start when traffic resumes

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
Step 5: Process repeats until node-1 is drained

Without PDB: Both api-pod-1 and api-pod-2 would be evicted simultaneously
             → Only 1 pod serving traffic during the drain
             → Potential downtime if that pod also fails
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
  [api-3] [api-NEW] [api-NEW2]         3 pods
  [api-3] [api-NEW] [api-NEW2] [api-NEW3] 4 pods
  [api-NEW] [api-NEW2] [api-NEW3]      3 pods ✅ Done
```

At no point were 0 pods serving. At no point was the old version and new version both fully running together (gradual cutover).

---

## 🔍 In This Project

### HPA (API)
**File:** [`helm/taskflow/templates/api-hpa.yaml`](../helm/taskflow/templates/api-hpa.yaml)

```yaml
spec:
  minReplicas: {{ .Values.api.autoscaling.minReplicas }}    # 3
  maxReplicas: {{ .Values.api.autoscaling.maxReplicas }}    # 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.api.autoscaling.targetCPUUtilizationPercentage }}  # 60
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.api.autoscaling.targetMemoryUtilizationPercentage }} # 80
```

**Raw YAML version:** [`k8s-scripts/10-hpa.yaml`](../k8s-scripts/10-hpa.yaml)

### PDB (API)
**File:** [`helm/taskflow/templates/api-pdb.yaml`](../helm/taskflow/templates/api-pdb.yaml)

```yaml
spec:
  maxUnavailable: {{ .Values.api.pdb.maxUnavailable }}  # 1
  selector:
    matchLabels:
      app: api
```

**Raw YAML version:** [`k8s-scripts/11-pdb.yaml`](../k8s-scripts/11-pdb.yaml)

### Resource Limits
**File:** [`helm/taskflow/values.yaml`](../helm/taskflow/values.yaml)

```yaml
api:
  resources:
    requests:
      cpu: 200m        # Scheduler uses this for placement
      memory: 128Mi
    limits:
      cpu: 1000m       # Throttled if exceeded
      memory: 512Mi    # OOMKilled if exceeded
```

---

## 🛠️ Hands-On Challenge

**Goal:** Watch HPA scale up, observe PDB protection, and trigger an OOMKill.

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

# See the PDB
kubectl get pdb -n taskflow
kubectl describe pdb taskflow-api -n taskflow
# Look for: Disruptions Allowed

# Simulate a drain (without actually draining the node)
kubectl get pods -n taskflow -o wide   # Note which pods are on which node
kubectl cordon minikube                 # Mark node as unschedulable
kubectl drain minikube --ignore-daemonsets --delete-emptydir-data
# Watch: pods evicted one at a time, not all at once

kubectl uncordon minikube              # Restore node scheduling

# ── Part 3: Resource Inspection ─────────────────────────────

# See current CPU/memory usage for all pods
kubectl top pods -n taskflow

# See node resource usage
kubectl top nodes

# See resource requests/limits for all containers
kubectl describe pod <api-pod-name> -n taskflow | grep -A 10 "Limits\|Requests"
```

**What to notice:**
- HPA reacts within ~30-60 seconds (metrics scrape + HPA evaluation cycle)
- Scale-down is much slower than scale-up (conservative, prevents flapping)
- `kubectl drain` respects PDB — pods are evicted in controlled batches

---

**Next:** [07 — Observability Architecture →](./07-observability-arch.md)


## Raw YAML Reference

### [10-hpa.yaml](../k8s-scripts/10-hpa.yaml) — Autoscaling
**WHAT IS HPA?**
HPA automatically scales the number of pod replicas based on observed CPU/memory utilisation (or custom metrics).

**THE SCALING LOOP:**
  1. `metrics-server` scrapes CPU/memory from every pod every 15s
  2. HPA controller reads metrics every 15s
  3. Calculates: `desiredReplicas = ceil(currentReplicas × (currentUsage / targetUsage))`
  4. Patches the Deployment's replicas field

**COOLDOWN PERIODS:**
Scale-up waits 3 minutes after last scale-up before scaling up again. Scale-down waits 5 minutes (default) — more conservative to prevent flapping.

### [11-pdb.yaml](../k8s-scripts/11-pdb.yaml) — Disruption Budgets
**WHAT IS A PDB?**
A PodDisruptionBudget limits how many pods of an application can be voluntarily disrupted at the same time.

**VOLUNTARY vs INVOLUNTARY DISRUPTION:**
  - **Voluntary (PDB applies):** Node drain (`kubectl drain`) for maintenance, Node upgrade
  - **Involuntary (PDB does NOT apply):** Node hardware failure, OOMKilled, Pod crash

With 3 API replicas and `maxUnavailable: 1`, a node drain can take down AT MOST 1 pod at a time. The drain blocks until a replacement pod is Running, ensuring no downtime during maintenance.