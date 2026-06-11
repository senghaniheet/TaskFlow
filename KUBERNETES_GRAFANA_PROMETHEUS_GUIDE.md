# TaskFlow: Kubernetes & Observability Guide

Welcome to the TaskFlow Kubernetes and Observability curriculum! This project serves as a comprehensive bridge from Docker basics to production-grade Kubernetes, complete with a modern three-pillar observability stack (Prometheus, Loki, Tempo, Grafana).

## 📚 The Curriculum

The documentation has been structured into a 13-part curriculum. Each chapter contains theoretical explanations, references to the exact code in this project, and hands-on KubeCtl/Grafana challenges.

*We recommend reading them in order:*

### Phase 1: Core Kubernetes
1. [00 — Introduction: Docker → Kubernetes](./docs/00-introduction.md)
2. [01 — Core Workloads: Pods, Deployments, StatefulSets](./docs/01-core-workloads.md)
3. [02 — Networking: Services, Ingress, and DNS](./docs/02-networking.md)
4. [03 — Configuration: ConfigMaps and Secrets](./docs/03-configuration.md)
5. [04 — Storage: PV, PVC, and StorageClass](./docs/04-storage.md)

### Phase 2: Helm & Reliability
6. [05 — Helm: The Package Manager for Kubernetes](./docs/05-helm.md)
7. [06 — Reliability: HPA, PDB, Resource Limits](./docs/06-reliability.md)

### Phase 3: Observability Architecture
8. [07 — Observability Architecture: The Three Pillars](./docs/07-observability-arch.md)
9. [08 — Metrics: Prometheus and PromQL](./docs/08-metrics.md)
10. [09 — Logging: Loki, Promtail, and LogQL](./docs/09-logging.md)
11. [10 — Distributed Tracing: OpenTelemetry and Tempo](./docs/10-tracing.md)

### Phase 4: Automation & Validation
12. [11 — CI/CD: Automated Deployments](./docs/11-cicd.md)
13. [12 — Load Testing: Validating Autoscaling](./docs/12-load-testing.md)

---

## 🏗️ Project Architecture Overview

This project runs the TaskFlow API (Node.js/Express) and Web UI (React) backed by MongoDB. The entire stack is instrumented for metrics, logs, and traces.

![Kubernetes Architecture](./assets/kubernetes-architecture.jpg)

![Observability Architecture](./assets/observability-architecture.png)

*For a deep dive into how every component above communicates, see [07 — Observability Architecture](./docs/07-observability-arch.md).*

---

## 🚀 Quick Start Guide

### Prerequisites
1. [Docker](https://docs.docker.com/get-docker/) installed and running.
2. [Minikube](https://minikube.sigs.k8s.io/docs/start/) installed.
3. [Helm](https://helm.sh/docs/intro/install/) installed.

### 1. Start Cluster & Enable Addons
```bash
minikube start --cpus=4 --memory=6144
minikube addons enable ingress
minikube addons enable metrics-server
```

### 2. Install the Observability Stack (Kube-Prometheus + Loki + Tempo)
```bash
# Add Helm repositories
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# 1. Install Prometheus & Grafana
helm install monitoring prometheus-community/kube-prometheus-stack --namespace monitoring --create-namespace

# 2. Install Loki (Logs)
helm install loki grafana/loki-stack --namespace monitoring --set grafana.enabled=false

# 3. Install Tempo (Traces)
helm install tempo grafana/tempo --namespace monitoring
```

### 3. Deploy the TaskFlow Application
The entire application is packaged as a single Helm chart.
```bash
helm upgrade --install taskflow ./helm/taskflow \
  --namespace taskflow \
  --create-namespace \
  --set api.env.jwtSecret="dev-secret-key-123" \
  --set api.env.otelEnabled="true"
```

### 4. Setup Local DNS (Hosts file)
Map the Minikube IP to our custom domains:
```bash
echo "$(minikube ip) taskflow.local grafana.local" | sudo tee -a /etc/hosts
# Windows: Edit C:\Windows\System32\drivers\etc\hosts manually
```

### 5. Access the Interfaces
- **TaskFlow App:** `http://taskflow.local`
- **Grafana:** `http://grafana.local` (or `kubectl port-forward svc/monitoring-grafana -n monitoring 8080:80`)
  - Username: `admin`
  - Password: `prom-operator`

---

## 🛠️ Essential Cheatsheet

### Helm Operations
```bash
helm list -A                                    # List all deployments
helm upgrade taskflow ./helm/taskflow ...       # Apply changes
helm template taskflow ./helm/taskflow          # Dry run (view YAML)
helm uninstall taskflow -n taskflow             # Tear down the app
```

### Pods & Troubleshooting
```bash
kubectl get pods -n taskflow -w                 # Watch pods spin up live
kubectl describe pod <pod-name> -n taskflow     # Find out WHY a pod is failing
kubectl logs <pod-name> -n taskflow             # View standard output logs
kubectl exec -it <pod-name> -n taskflow -- sh   # Shell into a running container
```

### Autoscaling (HPA) & Services
```bash
kubectl get hpa -n taskflow -w                  # Watch autoscaler CPU% live
kubectl top pods -n taskflow                    # Check actual RAM/CPU usage
kubectl get svc,ingress -n taskflow             # View networking rules
```

### Dashboard Imports
To load the custom dashboards in Grafana (`Dashboards -> Import`):
- Metrics & Health: [`monitoring/taskflow-dashboard-import.json`](./monitoring/taskflow-dashboard-import.json)
- Centralized Logs: [`monitoring/log-dashboard.json`](./monitoring/log-dashboard.json)

---

## 📁 Raw YAML vs Helm Templates

If you are learning Kubernetes for the first time, Helm's templating (`{{ .Values... }}`) can be confusing. 

To bridge this gap, the curriculum chapters (such as `01-core-workloads.md`) include a **Raw YAML Reference** section at the bottom. These explain the pure, un-templated Kubernetes configurations found in the [`k8s-scripts/`](./k8s-scripts/) folder.

Read the raw YAML in `k8s-scripts/` and the explanations in the curriculum first to understand *what* Kubernetes wants, then look at `helm/taskflow/templates/` to understand *how* Helm generates it.

Happy scaling!
