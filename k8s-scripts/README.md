# 📁 k8s-scripts — Raw Kubernetes YAML (Before Helm)

This folder contains **plain, unadulterated Kubernetes YAML** — no Helm templating, no `{{ .Values }}`, just raw manifests.

## Why This Folder Exists

Every file in `helm/taskflow/templates/` is a **Helm template** — Go templating syntax replaces real values at deploy time. That's great for production, but hard to read when you're learning.

These files show you the **exact same concepts** written as raw K8s YAML. Once you understand the raw version, the Helm template version will make immediate sense.

Below is a reference guide explaining the theory behind each Kubernetes resource found in this directory.

---

## 1. [00-namespace.yaml](./00-namespace.yaml) — Namespaces
**WHAT IS A NAMESPACE?**
A Namespace is a virtual cluster inside a physical cluster.
Think of it like folders on your computer:
  - `/home/user/work/`   → namespace: `production`
  - `/home/user/play/`   → namespace: `staging`

Resources in different namespaces are isolated:
  - A Service named `api` in `taskflow` won't conflict with a Service named `api` in `monitoring`.
  - RBAC policies can be scoped per-namespace.
  - Resource quotas can be applied per-namespace.

**IN THIS PROJECT:**
  - `taskflow`   → the app (API, Web, MongoDB)
  - `monitoring` → observability (Prometheus, Grafana, Loki, Tempo)
  - `ingress-nginx` → the Nginx Ingress Controller

---

## 2. [01-pod.yaml](./01-pod.yaml) — The Atomic Unit
**WHAT IS A POD?**
A Pod is the smallest deployable unit in Kubernetes.
It wraps one or more containers that:
  - Share the same network namespace (same IP, same `localhost`)
  - Share the same storage volumes
  - Are always co-located on the same node

**THE GOLDEN RULE:** Never deploy naked Pods in production.
If this Pod crashes, Kubernetes won't restart it. Use a Deployment instead. Every Deployment, StatefulSet, and DaemonSet creates Pods under the hood. Understanding Pods helps you debug what `kubectl describe pod` tells you.

---

## 3. [02-deployment.yaml](./02-deployment.yaml) — Stateless Replicas
**WHAT IS A DEPLOYMENT?**
A Deployment manages a ReplicaSet, which in turn manages Pods.
Think of it as: Deployment → ReplicaSet → Pods

**WHY DEPLOYMENT OVER NAKED POD?**
  - ✅ **Self-healing:** if a Pod dies, the Deployment creates a new one
  - ✅ **Scaling:** change replicas: 3 → replicas: 10 instantly
  - ✅ **Rolling updates:** update image with zero downtime
  - ✅ **Rollback:** `kubectl rollout undo` if the new version is broken

**ROLLING UPDATE STRATEGY:**
  - `maxUnavailable: 0`  → never kill old pods before new ones are ready
  - `maxSurge: 1`        → allow 1 extra pod during the transition

---

## 4. [03-statefulset.yaml](./03-statefulset.yaml) — Stateful Apps
**WHAT IS A STATEFULSET?**
A StatefulSet is like a Deployment, but for stateful applications (like MongoDB).
Key differences vs Deployment:
  - **Pod names:** fixed (`mongo-0`, `mongo-1`) vs random
  - **Start order:** sequential (0, then 1, then 2) vs simultaneous
  - **PVC:** one unique PVC per pod (stable storage) vs shared

**WHY MONGODB NEEDS IT:**
MongoDB's data directory (`/data/db`) must persist across pod restarts. If Pod `mongo-0` is deleted and recreated, it must mount the SAME PersistentVolume it had before — otherwise the database is gone. StatefulSets guarantee this through their stable pod identity.

---

## 5. [04-service-clusterip.yaml](./04-service-clusterip.yaml) — Internal Networking
**WHAT IS A SERVICE?**
Pods come and go (IPs change every time). A Service gives your pods a STABLE IP and DNS name that never changes.

**CLUSTERIP (default):**
  - Creates a virtual IP that is only reachable INSIDE the cluster
  - Acts as a load balancer across all matching pods

**HEADLESS SERVICE:**
A Headless Service (`clusterIP: None`) does NOT create a virtual IP. Instead, DNS returns the direct IP of each pod. Required by StatefulSets for stable per-pod DNS (e.g. `mongo-0.mongo.taskflow.svc`).

---

## 6. [05-service-nodeport.yaml](./05-service-nodeport.yaml) — External Access
**NODEPORT:**
Exposes the Service on a static port (30000-32767) on EVERY node.
External traffic → NodeIP:NodePort → Service → Pod

When to use NodePort:
  - ✅ Development / Minikube (quick external access without Ingress)
  - ✅ Non-HTTP protocols (gRPC, TCP)
  - ❌ Production: use LoadBalancer or Ingress instead

---

## 7. [06-ingress.yaml](./06-ingress.yaml) — HTTP Routing
**WHAT IS AN INGRESS?**
An Ingress is an API object that manages external HTTP/HTTPS access to services inside the cluster. It acts as a SMART REVERSE PROXY.

**WHY INGRESS OVER NodePort?**
  - NodePort: one port per service (messy, limited range)
  - Ingress: ONE entry point for ALL services, routed by path/host

**HOW IT WORKS:**
Browser → DNS → Nginx Ingress Controller → Ingress rules → route to correct Service → Pod

---

## 8. [07-configmap.yaml](./07-configmap.yaml) — Non-Sensitive Config
**WHAT IS A CONFIGMAP?**
A ConfigMap stores key-value pairs of non-sensitive configuration data. It decouples config from container images.

**GOLDEN RULE:**
  - ConfigMap  → non-sensitive config (`NODE_ENV`, `PORT`)
  - Secret     → sensitive credentials (`JWT_SECRET`, `MONGO_URI`)

**THE CHECKSUM TRICK:**
When a ConfigMap changes, pods won't restart automatically. The Helm checksum annotation forces a rolling restart so the new configuration takes effect.

---

## 9. [08-secret.yaml](./08-secret.yaml) — Sensitive Credentials
**WHAT IS A SECRET?**
A Secret is like a ConfigMap but for sensitive data. It stores data as base64-encoded strings.

**IMPORTANT: Base64 is ENCODING, not ENCRYPTION.**
Anyone with cluster access can decode it! Real security in production uses Sealed Secrets, HashiCorp Vault, or Cloud Secrets Managers.

**TYPES SHOWN HERE:**
  - `stringData`: write plaintext → K8s base64-encodes it for you
  - `data`: you must pre-encode with: `echo -n "value" | base64`

---

## 10. [09-pvc.yaml](./09-pvc.yaml) — Durable Storage
**THE STORAGE TRILOGY:**
  - **PersistentVolume (PV):** A cluster-level storage resource (like a physical hard disk).
  - **PersistentVolumeClaim (PVC):** A pod's request for storage. Like renting an apartment (you specify size and access mode).
  - **StorageClass:** A template for dynamically creating PVs on demand.

**ACCESS MODES:**
  - `ReadWriteOnce (RWO)`: mounted by ONE node at a time (MongoDB's mode)
  - `ReadWriteMany (RWX)`: mounted by MANY nodes simultaneously

---

## 11. [10-hpa.yaml](./10-hpa.yaml) — Autoscaling
**WHAT IS HPA?**
HPA automatically scales the number of pod replicas based on observed CPU/memory utilisation (or custom metrics).

**THE SCALING LOOP:**
  1. `metrics-server` scrapes CPU/memory from every pod every 15s
  2. HPA controller reads metrics every 15s
  3. Calculates: `desiredReplicas = ceil(currentReplicas × (currentUsage / targetUsage))`
  4. Patches the Deployment's replicas field

**COOLDOWN PERIODS:**
Scale-up waits 3 minutes after last scale-up before scaling up again. Scale-down waits 5 minutes (default) — more conservative to prevent flapping.

---

## 12. [11-pdb.yaml](./11-pdb.yaml) — Disruption Budgets
**WHAT IS A PDB?**
A PodDisruptionBudget limits how many pods of an application can be voluntarily disrupted at the same time.

**VOLUNTARY vs INVOLUNTARY DISRUPTION:**
  - **Voluntary (PDB applies):** Node drain (`kubectl drain`) for maintenance, Node upgrade
  - **Involuntary (PDB does NOT apply):** Node hardware failure, OOMKilled, Pod crash

With 3 API replicas and `maxUnavailable: 1`, a node drain can take down AT MOST 1 pod at a time. The drain blocks until a replacement pod is Running, ensuring no downtime during maintenance.
