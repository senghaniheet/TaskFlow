# 🚀 Kubernetes + Grafana + Prometheus: The Complete Learning Journey

> **Built from the TaskFlow production journey** — a MERN SaaS app deployed on Minikube with full observability.

This guide isn't just a list of commands. It's an interactive curriculum designed to take you through the exact journey of building a production-grade infrastructure from scratch. You won't just deploy pre-built files; you will write them, template them, and break them to see how the system reacts.

---

## 🎯 Phase 1: Setup & Groundwork

Your first task is to get the code and start the local environment.

> 🛠️ **Action Required:** Head over to the [README: Kubernetes Deployment Setup](./README.md#%E2%98%90%EF%B8%8F-kubernetes-deployment-full-setup) and follow **Steps 1 and 2** to:
> 1. Start Minikube with the required addons (`ingress`, `metrics-server`).
> 2. Build the Docker images for the API and Web frontend.
> 3. Load the images into Minikube.

Come back here once your images are loaded into Minikube!

---

## 🧱 Phase 2: Vanilla Kubernetes (The "Hard Way")

Before relying on package managers, you must understand the raw YAML components that make up a Kubernetes application. 

### 🧠 Challenge 1: Write and Deploy the API Manually

Let's build the API deployment from a blank slate.

**Step 1: The Deployment**
A Deployment manages your stateless pods. It ensures a specific number of replicas are running and handles zero-downtime rolling updates.
Create a file named `my-api.yaml` and add the following:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-taskflow-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-api
  template:
    metadata:
      labels:
        app: my-api
    spec:
      containers:
        - name: api
          image: ghcr.io/senghaniheet/taskflow-api:latest
          imagePullPolicy: Never # Crucial for local minikube images!
          ports:
            - containerPort: 5000
          # The Journey Note: Without Probes, K8s doesn't know if your app is actually ready to receive traffic, leading to dropped requests on startup!
          readinessProbe:
            httpGet:
              path: /api/health
              port: 5000
```

**Step 2: The Service**
A Service gives your pods a stable IP address so other parts of your app can find them, even as pods die and are recreated. Append this to `my-api.yaml` (separate with `---`):

```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: my-api-service
spec:
  selector:
    app: my-api # Matches the label in our Deployment!
  ports:
    - port: 5000
      targetPort: 5000
```

**Step 3: Apply and Verify**
Run the following command to send this instruction to Kubernetes:
```bash
kubectl apply -f my-api.yaml
```
Verify your pods are running:
```bash
kubectl get pods
kubectl get svc
```

*Journey Lesson:* Writing raw YAML works, but imagine managing 50 of these files across Dev, Staging, and Production. You'd be copy-pasting and manually changing `replicas: 2` to `replicas: 10`. That's where Helm comes in. 

Clean up your test: `kubectl delete -f my-api.yaml`

---

## 📦 Phase 3: Helm (The "Smart Way")

Helm is a package manager for Kubernetes. It allows you to **template** your YAML files. Instead of hardcoding values, you inject them from a central `values.yaml` file.

### 🧠 Challenge 2: Create a Helm Chart from Scratch

**Step 1: Generate the Boilerplate**
Run this command in your terminal:
```bash
helm create my-chart
```
This generates a massive folder of example files. Delete everything inside `my-chart/templates/` (we are going to write our own!).

**Step 2: Template your YAML**
Take the `my-api.yaml` we wrote in Phase 2, and save it as `my-chart/templates/api.yaml`. Now, change the hardcoded `replicas: 2` to use Go templating:

```yaml
spec:
  replicas: {{ .Values.api.replicaCount }}
```

**Step 3: Define the Values**
Open `my-chart/values.yaml` (delete the boilerplate inside it) and define your variable:
```yaml
api:
  replicaCount: 3
```

**Step 4: Deploy your Custom Chart**
```bash
helm install my-release ./my-chart
```
Check `kubectl get pods`—you should see 3 pods running because Helm injected the value from `values.yaml`!

Clean up: `helm uninstall my-release`

> 🛠️ **Action Required:** Now that you understand how Helm works under the hood, let's deploy the production-grade TaskFlow chart we built for this project. Follow **Steps 3, 4, and 5** in the [README: Kubernetes Deployment Setup](./README.md#step-3--deploy-with-helm) to deploy the real stack and configure your Ingress.

---

## 📊 Phase 4: Observability (Prometheus & Grafana)

Running an app without monitoring is flying blind. We use **Prometheus** to scrape and store metrics, and **Grafana** to visualize them.

> 🛠️ **Action Required:** Follow **Steps 1, 2, and 3** in the [README: Monitoring Setup](./README.md#%F0%9F%93%8A-monitoring-setup-prometheus--grafana) to install the stack and access the UIs.

### Prometheus & PromQL Basics
Go to your Prometheus UI (`http://localhost:9090/graph`) and try these PromQL queries to see the raw data:

- **Instant Vector (Current Value of all pods):**
  `kube_pod_info{namespace="taskflow"}`
- **Rate of Change (CPU cores used per second over 5 mins):**
  `rate(container_cpu_usage_seconds_total{namespace="taskflow", container="api"}[5m])`
- **Aggregation (Sum total CPU used by API pods, grouped by pod name):**
  `sum(rate(container_cpu_usage_seconds_total{namespace="taskflow", container="api"}[5m])) by (pod)`

### 🧠 Challenge 3: Build the Dashboard from Scratch

We provided a JSON dashboard to import, but during our journey, we built it by hand. Let's recreate a piece of it!

1. Open Grafana (`http://localhost:3000`).
2. Click **+** (Create) -> **Dashboard** -> **Add visualization**. Select the **Prometheus** data source.

**Panel 1: API CPU Usage (Time Series)**
- **The Query:** `sum(rate(container_cpu_usage_seconds_total{namespace="taskflow", container="api"}[5m])) by (pod)`
- **The Formatting:** Under the "Legend" options, type `{{pod}}` so the messy metric names turn into clean pod names.
- **The Look:** In the right sidebar, search for "Fill opacity" and turn it up to create a nice area chart. Click "Apply".

**Panel 2: API Pod Count (Stat Panel)**
- **Add a new panel.**
- **The Query:** `count(kube_pod_info{namespace="taskflow", pod=~"taskflow-api-.*"} unless on(pod) kube_pod_deletion_timestamp{namespace="taskflow"})`
- **The Formatting:** In the top right, change the visualization type from "Time series" to "Stat". Click "Apply".

You've just built a monitoring dashboard from raw metrics! *(You can always import our full comprehensive dashboard by following **Step 4** in the README).*

---

## 🔥 Phase 5: Real-World Testing & Scenarios

Now for the best part of the journey: breaking things to ensure the system is resilient.

### Scenario 1: Load Testing & Autoscaling

We configured our Horizontal Pod Autoscaler (HPA) to scale up if API CPU usage exceeds 60%. Let's prove it works by flooding the Ingress with traffic.

1. Open a terminal and run the load test script:
   ```bash
   cd server/tests/load
   node loadtest.js http://taskflow.local/api/health 50 1000
   ```
   *(This script unleashes 1000 requests using 50 concurrent connections).*
   
2. Watch the HPA react in real-time in another terminal:
   ```bash
   kubectl get hpa -n taskflow -w
   ```
3. Look at your Grafana dashboard.
   - **The Journey:** You will see the CPU spike dramatically. After about 15-30 seconds, Prometheus scrapes the new high CPU metric. The HPA detects this, requests more pods, and your Pod Count stat panel will tick upwards. Once the new pods are running, the CPU load is distributed, and the average CPU drops back down!

### Scenario 2: The Elusive Memory Leak

We added a temporary memory leak endpoint to the API (`setInterval` allocating 1MB Buffers) to test our alerting. 

1. Apply the Prometheus Alert Rules (Follow **Step 5** in the README).
2. Look at `monitoring/prometheus-alert-rule.yaml`. The `PodHighMemory` alert triggers if memory goes above a certain threshold for 1 minute (`for: 1m`).
3. **The Journey:** When we first ran this, the alert never fired! Why? Because we had a hard Kubernetes memory limit of `512Mi`. The pod was eating memory so fast that Kubernetes stepped in and **OOMKilled** (Out Of Memory Kill) the pod before the 1-minute alert timer could finish!
4. **The Lesson:** Setting aggressive K8s memory limits protects your node, but it means your pods might die before your alerting system notifies you. You have to balance limits and alert thresholds carefully.

### Scenario 3: CrashLoopBackOff

What happens when a pod keeps crashing on startup due to a bad config or broken code?
1. Apply our failure test deployment:
   ```bash
   kubectl apply -f helm/FailureTest/CrashLoopBackOff-Deply.yaml
   ```
2. Watch the pod status:
   ```bash
   kubectl get pods -w
   ```
3. **The Journey:** You'll see the pod crash, restart immediately, crash again, and then wait 10s, then 20s, then 40s. Kubernetes uses **exponential backoff** to prevent a broken app from consuming all the CPU on the node by endlessly restarting.
4. Clean up:
   ```bash
   kubectl delete -f helm/FailureTest/CrashLoopBackOff-Deply.yaml
   ```

---

## 📜 Cheatsheet

### kubectl Essentials
```bash
kubectl get pods -n taskflow -w           # Watch mode
kubectl describe pod <name> -n taskflow   # Inspect why a pod is failing (OOMKilled, ImagePullBackOff)
kubectl logs <pod-name> -n taskflow -f    # Tail logs
kubectl exec -it <pod-name> -n taskflow -- sh # SSH into a running pod
kubectl rollout restart deployment/taskflow-api -n taskflow # Force restart all pods
```

### Helm Essentials
```bash
helm install <release> <chart> -n <ns>
helm upgrade <release> <chart> -n <ns>    # Apply values.yaml changes without downtime
helm uninstall <release> -n <ns>          # Teardown the whole stack
```
