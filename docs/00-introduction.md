# 00 — Introduction: Docker → Kubernetes

> **Audience:** You know Docker. You can build images, write `docker-compose.yml`, and run containers. Now you want to understand Kubernetes.

---

## 🧠 Theory: From Docker to Kubernetes

### What Docker Gives You

Docker solves the "works on my machine" problem. You package your app + its dependencies into an **image**. That image runs identically anywhere Docker is installed.

```
Your code + Node.js 20 + all npm packages
         ↓ docker build
Image: ghcr.io/senghaniheet/taskflow-api:latest
         ↓ docker run
Container running on port 5000
```

### What Docker Doesn't Solve

| Problem | Docker's Answer | Reality |
|---------|----------------|---------|
| What if the container crashes? | Restart policy | Manual; fragile in production |
| How do I run 10 copies for traffic? | `docker-compose --scale` | Not production-grade |
| How do containers find each other across servers? | Custom networks | Breaks across machines |
| How do I update my app with zero downtime? | You don't, easily | Rolling updates are manual |
| What happens when a server dies? | Your container dies with it | No failover |

Kubernetes solves all of these — automatically.

### The Key Mental Shift

With Docker you say: **"Run this container."**

With Kubernetes you say: **"I want 3 healthy instances of this app running, always."**

Kubernetes figures out *how* to make that true. If a server dies, it reschedules the container elsewhere. If the container crashes, it restarts it. You declare the **desired state** and Kubernetes maintains it forever.

---

## 🏗️ Cluster Anatomy

A Kubernetes cluster has two types of machines:

```
┌─────────────────── Kubernetes Cluster ──────────────────────┐
│                                                              │
│   ┌──────────────────────────────────────┐                  │
│   │         Control Plane (Master)        │                  │
│   │                                       │                  │
│   │  ┌────────────┐  ┌────────────────┐  │                  │
│   │  │ API Server  │  │      etcd      │  │                  │
│   │  │ (kube API)  │  │ (source of     │  │                  │
│   │  │             │  │  truth / DB)   │  │                  │
│   │  └────────────┘  └────────────────┘  │                  │
│   │  ┌────────────┐  ┌────────────────┐  │                  │
│   │  │  Scheduler  │  │   Controller   │  │                  │
│   │  │ (places     │  │   Manager      │  │                  │
│   │  │  pods on    │  │ (watches state)│  │                  │
│   │  │  nodes)     │  │                │  │                  │
│   │  └────────────┘  └────────────────┘  │                  │
│   └──────────────────────────────────────┘                  │
│                         │ instructions                        │
│          ┌──────────────┼──────────────┐                     │
│          ▼              ▼              ▼                     │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│   │  Node 1  │  │  Node 2  │  │  Node 3  │                  │
│   │ ┌──────┐ │  │ ┌──────┐ │  │ ┌──────┐ │                  │
│   │ │kubelet│ │  │ │kubelet│ │  │ │kubelet│ │                 │
│   │ │kproxy │ │  │ │kproxy │ │  │ │kproxy │ │                 │
│   │ │ Pods  │ │  │ │ Pods  │ │  │ │ Pods  │ │                 │
│   │ └──────┘ │  │ └──────┘ │  │ └──────┘ │                  │
│   └──────────┘  └──────────┘  └──────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

### Control Plane Components

| Component | Role | Analogy |
|-----------|------|---------|
| **API Server** | The front door. All `kubectl` commands talk to it. | Reception desk |
| **etcd** | A distributed key-value store. The cluster's source of truth. Stores all state. | The database |
| **Scheduler** | Decides which Node a new Pod should run on (based on resources, affinity rules). | Dispatcher |
| **Controller Manager** | Watches actual vs desired state. Creates new pods when replicas are missing. | The enforcer |

### Worker Node Components

| Component | Role |
|-----------|------|
| **Kubelet** | Agent on every node. Receives pod specs from the API Server and starts containers. |
| **kube-proxy** | Manages network rules (iptables/IPVS) for Service traffic routing. |
| **Container Runtime** | Actually runs containers (containerd, CRI-O). Docker is not used in modern K8s. |

---

## Namespaces — Virtual Clusters

A Namespace is a logical partition inside a cluster. Think of it like folders: resources in different namespaces are isolated from each other.

```
taskflow      → the application (API, Web, MongoDB)
monitoring    → observability stack (Prometheus, Grafana, Loki, Tempo)
ingress-nginx → the Nginx Ingress Controller
kube-system   → Kubernetes internal components
```

**Raw YAML** ([k8s-scripts/00-namespace.yaml](../k8s-scripts/00-namespace.yaml)):
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: taskflow
  labels:
    # key=value pairs used for grouping and filtering resources
    app.kubernetes.io/managed-by: helm
    environment: production
```

**Helm equivalent** ([helm/taskflow/templates/namespace.yaml](../helm/taskflow/templates/namespace.yaml)):
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: {{ .Values.namespace }}   # → "taskflow" from values.yaml
```

---

## ⌨️ kubectl Essentials

`kubectl` is your CLI for talking to the Kubernetes API Server.

### Contexts & Namespaces

```bash
# Which cluster am I connected to?
kubectl config current-context

# Switch cluster
kubectl config use-context minikube

# Work in a specific namespace (so you don't have to type -n every time)
kubectl config set-context --current --namespace=taskflow
```

### The Core Commands

```bash
# List resources
kubectl get pods -n taskflow
kubectl get pods -n taskflow -w              # -w = watch mode (live updates)
kubectl get pods -n taskflow -o wide         # Show node assignment + IP
kubectl get all -n taskflow                  # Pods, Services, Deployments...

# Inspect a resource (extremely useful for debugging)
kubectl describe pod <pod-name> -n taskflow  # Events section shows WHY it's failing

# Logs
kubectl logs <pod-name> -n taskflow          # Last run's logs
kubectl logs <pod-name> -n taskflow -f       # Follow/tail live
kubectl logs <pod-name> -n taskflow --previous  # Logs from crashed previous container

# Execute into a running container
kubectl exec -it <pod-name> -n taskflow -- sh
kubectl exec -it <pod-name> -n taskflow -- env | grep MONGO  # Check env vars

# Apply / Delete YAML
kubectl apply -f my-file.yaml
kubectl delete -f my-file.yaml
kubectl delete pod <pod-name> -n taskflow    # Force restart a single pod

# Restart all pods (triggers rolling update)
kubectl rollout restart deployment/taskflow-api -n taskflow
kubectl rollout status deployment/taskflow-api -n taskflow
```

---

## 🖥️ Minikube: Local K8s Cluster

Minikube runs a **single-node** Kubernetes cluster inside a VM or container on your laptop.

### How It Differs from Production

| Aspect | Minikube | Production (GKE/EKS) |
|--------|----------|----------------------|
| Nodes | 1 | 3–100+ |
| Control Plane | Shared with worker | Managed, separate |
| Load Balancers | `minikube tunnel` or NodePort | Cloud LBs (ELB, GCLB) |
| Storage | hostPath on local disk | Managed disks (EBS, PD) |
| Image Registry | Load images locally | Container registries (GHCR, ECR) |

### Minikube Commands

```bash
minikube start --cpus=4 --memory=6144   # Start with enough resources
minikube status                          # Check if it's running
minikube ip                              # Get the cluster IP (for /etc/hosts)
minikube ssh                             # SSH into the Minikube VM
minikube addons enable ingress           # Enable Nginx Ingress Controller
minikube addons enable metrics-server    # Required for HPA
minikube image load <image>              # Load a local Docker image (skip registry)
minikube stop                            # Stop without destroying
minikube delete                          # Destroy the cluster
```

---

## 🛠️ Hands-On Challenge

**Goal:** Start Minikube and explore the cluster.

```bash
# 1. Start Minikube
minikube start --cpus=4 --memory=6144

# 2. Explore the cluster nodes
kubectl get nodes
kubectl describe node minikube          # Read the Capacity, Allocatable, and Events sections

# 3. Look at the system namespaces that K8s creates itself
kubectl get namespaces
kubectl get pods -n kube-system         # K8s internal components running as pods!

# 4. See the control plane components running as pods
kubectl get pods -n kube-system | grep -E "apiserver|etcd|scheduler|controller"

# 5. Look at your taskflow namespace (after deploying)
kubectl get all -n taskflow

# 6. Explore a running API pod
kubectl get pods -n taskflow
kubectl describe pod <api-pod-name> -n taskflow
# Look for: Node, Status, Containers, Conditions, Events
```

**What to notice:**
- The control plane runs as pods in `kube-system`
- Every pod has its own cluster IP (ephemeral, changes on restart)
- The `Events` section in `describe` tells you why a pod is failing (ImagePullBackOff, OOMKilled, etc.)

---

**Next:** [01 — Core Workloads: Pods, Deployments, StatefulSets →](./01-core-workloads.md)
