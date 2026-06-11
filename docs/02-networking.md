# 02 — Networking: Services, Ingress, and DNS

> **Prerequisites:** [01 — Core Workloads](./01-core-workloads.md)

---

## 🧠 Theory: The Networking Problem

Pods get random IP addresses that change every time they restart. If the API pod dies and comes back, its IP changes. How does the React app know where to send requests?

**Answer: Services.** A Service gives your pods a stable IP and DNS name that never changes — even as the underlying pods come and go.

```
Without Services:          With Services:
API pod: 10.244.0.15  →   API Service: 10.96.10.1 (stable)
(crashes)                               ↓
API pod: 10.244.0.22  →   Still: 10.96.10.1 (same IP!)
```

---

## ClusterIP — Internal Service Discovery

**ClusterIP** is the default Service type. It creates a virtual IP that is only reachable **inside** the cluster.

```
React Pod → "api:5000" → DNS lookup → ClusterIP 10.96.10.1
                                      → kube-proxy routes to one of:
                                        [api-pod-1:5000]
                                        [api-pod-2:5000]
                                        [api-pod-3:5000]
```

The ClusterIP Service acts as a **load balancer** across all matching pods.

### Selector: How Services Find Pods

The Service uses a **label selector** to find which pods to route to:

```yaml
# The Service watches for pods with these labels:
selector:
  app: api

# The Deployment creates pods WITH these labels:
template:
  metadata:
    labels:
      app: api   # ← matches the Service selector
```

When a new pod starts with matching labels, the Service automatically starts routing to it.

### Kubernetes DNS: How `mongo:27017` Works

Every Service gets a DNS entry automatically:
```
Format:   <service-name>.<namespace>.svc.cluster.local
Example:  mongo.taskflow.svc.cluster.local

Short form (within same namespace):
  mongo   ← resolves to the same address
```

This is why `values.yaml` has `mongoUri: "mongodb://mongo:27017/taskflow"` — not an IP address.

### Headless Services (for StatefulSets)

A regular ClusterIP returns one virtual IP for all pods. A **Headless Service** (`clusterIP: None`) returns the actual IP of each individual pod:

```
Regular Service:   mongo.taskflow.svc → 10.96.5.1 (virtual, load balanced)
Headless Service:  mongo-0.mongo.taskflow.svc → 10.244.0.5 (specific pod!)
```

StatefulSets need headless services so each pod gets a stable, individually addressable DNS name.

### Raw YAML ([k8s-scripts/04-service-clusterip.yaml](../k8s-scripts/04-service-clusterip.yaml))

```yaml
# ── API Service ──────────────────────────────────────────────
apiVersion: v1
kind: Service
metadata:
  name: api                   # DNS inside the cluster: api.taskflow.svc.cluster.local
  namespace: taskflow
spec:
  type: ClusterIP             # Internal-only; not reachable from outside the cluster
  ports:
    - name: http
      port: 5000
      targetPort: 5000
  selector:
    app: api                  # Routes to all pods carrying this label

---
# ── MongoDB Headless Service ─────────────────────────────────
apiVersion: v1
kind: Service
metadata:
  name: mongo
  namespace: taskflow
spec:
  clusterIP: None             # Headless — individual pod DNS entries instead of a VIP
  ports:
    - port: 27017
      targetPort: 27017
  selector:
    app: mongo
```

**Helm equivalent** ([helm/taskflow/templates/api-service.yaml](../helm/taskflow/templates/api-service.yaml)):
```yaml
metadata:
  name: {{ include "taskflow.fullname" . }}-api
spec:
  type: {{ .Values.api.service.type }}
  ports:
    - port: {{ .Values.api.service.port }}
  selector:
    app: api
```

---

## NodePort — Exposing Outside the Cluster

NodePort exposes the Service on a static port on **every node's external IP**:

```
External client → NodeIP:30500 → kube-proxy → Service → Pod
```

- Port range: 30000–32767
- Works in Minikube without extra setup
- **Not recommended for production HTTP** — use Ingress instead

```bash
minikube ip           # → 192.168.49.2
curl http://192.168.49.2:30500/api/health
```

### Raw YAML ([k8s-scripts/05-service-nodeport.yaml](../k8s-scripts/05-service-nodeport.yaml))

```yaml
# for development/testing only; use Ingress in production
apiVersion: v1
kind: Service
metadata:
  name: api-nodeport
  namespace: taskflow
spec:
  type: NodePort
  ports:
    - port: 5000
      targetPort: 5000
      nodePort: 30500     # Static port on every node (valid range: 30000–32767)
  selector:
    app: api
```

---

## Ingress — The Smart HTTP Router

An Ingress manages **HTTP/HTTPS routing** from outside the cluster to Services inside. Think of it as a programmatic Nginx config that Kubernetes manages for you.

```
Browser: http://taskflow.local/api/workspaces

  ↓ DNS: taskflow.local → 192.168.49.2 (Minikube IP)
  ↓ Nginx Ingress Controller (listening on port 80/443)
  ↓ Reads Ingress rules
  ↓ Path: /api → Service: api:5000
  ↓ ClusterIP routes to one of the 3 API pods
  ↓ Response returned to browser
```

An Ingress **object** (YAML) is just configuration. You also need an **Ingress Controller** — the actual running reverse proxy. This project uses Nginx:

```bash
minikube addons enable ingress
```

### Raw YAML ([k8s-scripts/06-ingress.yaml](../k8s-scripts/06-ingress.yaml))

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: taskflow-ingress
  namespace: taskflow
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
    nginx.ingress.kubernetes.io/use-regex: "true"
spec:
  ingressClassName: nginx     # Selects the Nginx Ingress Controller

  rules:
    - host: "taskflow.local"
      http:
        paths:
          # More specific path must come first — evaluated top to bottom
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 5000

          - path: /
            pathType: Prefix  # Catch-all
            backend:
              service:
                name: web
                port:
                  number: 80
```

**Helm equivalent** ([helm/taskflow/templates/ingress.yaml](../helm/taskflow/templates/ingress.yaml)):
```yaml
spec:
  ingressClassName: nginx
  rules:
    - host: "{{ .Values.ingress.host }}"
      http:
        paths:
          - path: /api → backend: api:5000
          - path: /    → backend: web:80
```

---

## Traffic Flow: End-to-End

```
Browser (outside cluster)
    │
    │ HTTP request: taskflow.local/api/workspaces
    ▼
Minikube Node (192.168.49.2:80)
    │
    ▼
Nginx Ingress Controller
    │ Path /api → Service: api:5000
    ▼
Service: api (ClusterIP — load balances across 3 pods)
    ▼
One of: [taskflow-api-pod-1] or [taskflow-api-pod-2] or [taskflow-api-pod-3]
    │
    │ MongoDB query: mongodb://mongo:27017
    ▼
Service: mongo (Headless)
    ▼
StatefulSet Pod: taskflow-mongo-0
```

---

## 🛠️ Hands-On Challenge

**Goal:** Trace a request through the networking stack.

```bash
# ── Part 1: Inspect Services ────────────────────────────────

kubectl get svc -n taskflow
# You'll see: api (ClusterIP), mongo (ClusterIP), web (ClusterIP)

kubectl describe svc api -n taskflow
# Look for: Endpoints — these are the actual pod IPs being load-balanced

kubectl get endpoints api -n taskflow
# Lists the 3 pod IPs currently behind the Service

# ── Part 2: Test Internal DNS ────────────────────────────────

kubectl exec -it <api-pod-name> -n taskflow -- sh

# Inside the pod — test DNS resolution
nslookup mongo                              # → mongo.taskflow.svc.cluster.local
nslookup api                               # → resolves to the Service ClusterIP
nslookup monitoring-grafana.monitoring     # → even cross-namespace!
exit

# ── Part 3: Test the Ingress ─────────────────────────────────

# Make sure hosts file has: 192.168.49.2 taskflow.local
curl http://taskflow.local/api/health
curl http://taskflow.local/api/workspaces

kubectl describe ingress -n taskflow
# Look for: Rules, Backend, Endpoints

# ── Part 4: Watch Load Balancing ─────────────────────────────

# Watch logs across all API pods simultaneously
kubectl logs -l app=api -n taskflow -f --max-log-requests=10
# Make several requests and notice different pods handling them
```

**What to notice:**
- Services have an `Endpoints` object listing the actual pod IPs
- DNS works across namespaces: `<service>.<namespace>`
- The Ingress routes `/api/*` to the API, everything else to the frontend
- Load is distributed across all 3 API replicas

---

**Next:** [03 — Configuration: ConfigMaps and Secrets →](./03-configuration.md)