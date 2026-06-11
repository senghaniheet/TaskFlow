# 01 — Core Workloads: Pods, Deployments, StatefulSets

> **Prerequisites:** [00 — Introduction](./00-introduction.md)

---

## 🧠 Theory: The Workload Hierarchy

```
You interact with:   Deployment / StatefulSet / DaemonSet
                              ↓ manages
                         ReplicaSet
                              ↓ manages
                            Pods
                              ↓ contains
                          Container(s)
```

You almost never create Pods directly. You create a **Deployment** or **StatefulSet**, which manages Pods for you.

---

## Pod — The Atomic Unit

A Pod is the smallest deployable unit. It wraps **one or more containers** that:
- Share the same network interface (same IP, `localhost` is shared)
- Share the same storage volumes
- Are always scheduled on the same node

### Why Not Just Use Pods Directly?

```
You create a naked Pod: kubectl apply -f pod.yaml
Pod crashes.
Kubernetes does NOT recreate it.
Your app is down.
```

Pods are ephemeral by design. Every time a Pod is created, it gets a new IP address. Nothing in a Pod is guaranteed to persist.

**Use a Deployment instead.** Deployments guarantee your desired replica count is always running.

### Pod Lifecycle States

| State | Meaning |
|-------|---------|
| `Pending` | Pod accepted, but containers not started yet (waiting for node, image pull) |
| `Running` | At least one container is running |
| `Succeeded` | All containers completed successfully (Jobs only) |
| `Failed` | All containers exited, at least one with failure |
| `CrashLoopBackOff` | Container keeps crashing; K8s is backing off retries exponentially |
| `OOMKilled` | Container exceeded its memory limit and was killed |
| `ImagePullBackOff` | Cannot pull the container image (wrong tag, auth failure) |

### Raw YAML ([k8s-scripts/01-pod.yaml](../k8s-scripts/01-pod.yaml))

```yaml
# 01-pod.yaml — for learning only; use a Deployment in production
apiVersion: v1
kind: Pod
metadata:
  name: taskflow-api-pod
  namespace: taskflow
  labels:
    app: api                    # Services use this label to find and route to this pod
spec:
  containers:
    - name: api
      image: ghcr.io/senghaniheet/taskflow-api:latest
      imagePullPolicy: Never    # Use the locally loaded Minikube image

      ports:
        - containerPort: 5000   # Documentation only — does not open the port

      env:
        - name: NODE_ENV
          value: "production"
        - name: JWT_SECRET
          value: "replace-me"   # Never hardcode real secrets — use a Secret resource

      resources:
        requests:
          cpu: 200m             # 200 millicores = 0.2 of one CPU core
          memory: 128Mi
        limits:
          cpu: 1000m            # Container is throttled if exceeded
          memory: 512Mi         # Container is OOMKilled if it exceeds this

      readinessProbe:
        httpGet:
          path: /api/health
          port: 5000
        initialDelaySeconds: 5
        periodSeconds: 10

      livenessProbe:
        httpGet:
          path: /api/health
          port: 5000
        initialDelaySeconds: 15
        periodSeconds: 15
        failureThreshold: 5     # Container is restarted after 5 consecutive failures
```

---

## Deployment — Managing Stateless Replicas

A Deployment manages a set of identical, interchangeable Pods (stateless). It wraps a **ReplicaSet** which actually manages the Pods.

**Why Deployment over a naked Pod?**
- ✅ **Self-healing:** if a Pod dies, the Deployment creates a new one
- ✅ **Scaling:** `replicas: 3` → `replicas: 10` instantly
- ✅ **Rolling updates:** update image with zero downtime
- ✅ **Rollback:** `kubectl rollout undo` if the new version is broken

### Rolling Update: Zero-Downtime Deploys

This project uses `maxUnavailable: 0` and `maxSurge: 1`:

```
Initial state (3 pods running, all old version):
  [api-abc] [api-def] [api-ghi]   ← old pods

Step 1: Create 1 new pod (4 pods total):
  [api-abc] [api-def] [api-ghi]   ← old
  [api-xyz]                        ← new (starting...)

Step 2: New pod passes readiness probe:
  [api-abc] [api-def] [api-ghi]   ← old (serving)
  [api-xyz]                        ← new (serving)

Step 3: Kill 1 old pod (back to 3):
  [api-def] [api-ghi]             ← old
  [api-xyz]                        ← new

  ... repeat until all replaced ...

Final state:
  [api-xyz] [api-uvw] [api-rst]   ← all new
```

**The readiness probe is the gatekeeper.** If the new pod fails the readiness probe, the rollout pauses — old pods keep serving. No downtime.

### Raw YAML ([k8s-scripts/02-deployment.yaml](../k8s-scripts/02-deployment.yaml))

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: taskflow-api
  namespace: taskflow
spec:
  replicas: 3

  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1          # Allow 1 extra pod during the update
      maxUnavailable: 0    # Never take down a pod before its replacement is ready

  selector:
    matchLabels:
      app: api

  template:
    metadata:
      labels:
        app: api
      annotations:
        # sha256 of ConfigMap/Secret content — changes here trigger a rolling restart
        checksum/config: "abc123..."
        checksum/secret: "def456..."

    spec:
      containers:
        - name: api
          image: ghcr.io/senghaniheet/taskflow-api:latest
          imagePullPolicy: Always   # Always pull so CI/CD new images are picked up

          envFrom:
            - configMapRef:
                name: taskflow-api-config   # loads NODE_ENV, PORT, LOG_LEVEL, etc.
            - secretRef:
                name: taskflow-api-secret   # loads JWT_SECRET, MONGO_URI

          resources:
            requests:
              cpu: 200m
              memory: 128Mi
            limits:
              cpu: 1000m
              memory: 512Mi

          readinessProbe:
            httpGet:
              path: /api/health
              port: 5000
            initialDelaySeconds: 5
            periodSeconds: 10

          livenessProbe:
            httpGet:
              path: /api/health
              port: 5000
            initialDelaySeconds: 15
            periodSeconds: 15
            failureThreshold: 5
```

**Helm equivalent** ([helm/taskflow/templates/api-deployment.yaml](../helm/taskflow/templates/api-deployment.yaml)):
```yaml
spec:
  replicas: {{ .Values.api.replicaCount }}           # → 3
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
        - image: "{{ .Values.api.image.repository }}:{{ .Values.api.image.tag }}"
```

### Rollback

```bash
kubectl rollout history deployment/taskflow-api -n taskflow
kubectl rollout undo deployment/taskflow-api -n taskflow
kubectl rollout undo deployment/taskflow-api -n taskflow --to-revision=2
```

---

## Probes: The Traffic Gatekeeper

### Readiness Probe
Answers: **"Is this container ready to receive traffic?"**
- Until this passes, the Service will **NOT** route traffic to this pod
- If it fails after startup, the pod is temporarily removed from load balancing (not killed)

### Liveness Probe
Answers: **"Is this container still alive?"**
- If this fails `failureThreshold` times, the container is **killed and restarted**
- Catches deadlocks, infinite loops, hung processes

---

## StatefulSet — For Stateful Applications (MongoDB)

StatefulSets are for applications that need:
- **Stable identity:** Pod names don't change (`mongo-0`, `mongo-1`)
- **Ordered deployment:** Start in order (0, 1, 2), stop in reverse (2, 1, 0)
- **Stable storage:** Each pod gets its own PVC that persists across restarts

### Deployment vs StatefulSet

| Feature | Deployment (API, Web) | StatefulSet (MongoDB) |
|---------|----------------------|----------------------|
| Pod names | Random hash (`api-abc123`) | Ordered (`mongo-0`) |
| Pod DNS | Unstable IP | `mongo-0.mongo.taskflow.svc` |
| Start order | Simultaneous | Sequential |
| Storage | Shared or none | Unique PVC per pod |
| Use case | Stateless (HTTP servers) | Stateful (databases, queues) |

### Raw YAML ([k8s-scripts/03-statefulset.yaml](../k8s-scripts/03-statefulset.yaml))

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: taskflow-mongo
  namespace: taskflow
spec:
  serviceName: taskflow-mongo  # Required: links to the headless Service for stable DNS
  replicas: 1

  selector:
    matchLabels:
      app: mongo

  template:
    metadata:
      labels:
        app: mongo
    spec:
      containers:
        - name: mongo
          image: mongo:7

          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi

          volumeMounts:
            - name: mongo-storage
              mountPath: /data/db   # MongoDB stores all data here; must persist across restarts

      volumes:
        - name: mongo-storage
          persistentVolumeClaim:
            claimName: taskflow-mongo-pvc
```

**Helm equivalent** ([helm/taskflow/templates/mongo-statefulset.yaml](../helm/taskflow/templates/mongo-statefulset.yaml)):
```yaml
spec:
  serviceName: {{ include "taskflow.fullname" . }}-mongo
  replicas: 1
  template:
    spec:
      containers:
        - volumeMounts:
            - name: mongo-storage
              mountPath: /data/db
      volumes:
        - persistentVolumeClaim:
            claimName: {{ include "taskflow.fullname" . }}-mongo-pvc
```

---

## 🛠️ Hands-On Challenge

**Goal:** Observe rolling updates and StatefulSet behaviour live.

```bash
# ── Part 1: Watch a Rolling Update ─────────────────────────

# Terminal 1: Watch pods continuously
kubectl get pods -n taskflow -w

# Terminal 2: Trigger a rolling restart (simulates a new image deploy)
kubectl rollout restart deployment/taskflow-api -n taskflow

# In Terminal 1 you should see:
# - New pods created (Pending → Running)
# - Old pods terminated one by one
# - Never more than 1 extra pod at a time

# ── Part 2: Understand the StatefulSet ──────────────────────

# See the stable pod name
kubectl get pods -n taskflow | grep mongo
# Should always be: taskflow-mongo-0  (not a random hash)

# Delete the MongoDB pod (simulate a crash)
kubectl delete pod taskflow-mongo-0 -n taskflow

# Watch it restart — same name, same PVC, same data
kubectl get pods -n taskflow -w

# ── Part 3: Explore Probe Behaviour ─────────────────────────

# See probe configuration for the API
kubectl describe pod <api-pod-name> -n taskflow
# Look for: Liveness, Readiness sections
```

**What to notice:**
- During rolling update: old pods serve traffic while new ones start
- StatefulSet pods always have ordinal names (mongo-0)
- After killing mongo-0, it restarts with the same name and all data intact

---

**Next:** [02 — Networking: Services, Ingress, and DNS →](./02-networking.md)