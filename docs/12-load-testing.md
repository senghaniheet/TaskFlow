# 12 — Load Testing: Validating Autoscaling

> **Prerequisites:** [11 — CI/CD](./11-cicd.md)

---

## 🧠 Theory: Why Load Test?

You've configured resource requests, limits, and an HPA. But how do you know it actually works? 

Will your application crash before the HPA has time to react? Will it scale up correctly? Does the database become a bottleneck when 10 Pods hit it simultaneously?

You must **prove** your infrastructure under stress.

### What is k6?

[k6](https://k6.io/) is an open-source load testing tool created by Grafana Labs. You write performance tests in JavaScript, and k6 executes them using a highly optimized Go engine capable of simulating thousands of virtual users.

### The Problem with Local Load Testing

If you run a load test from your laptop terminal against a remote cluster, you are testing your internet connection, your ISP's routing, and the cluster's external load balancer. You are *not* testing the raw capacity of your application pods.

### The Solution: The Load Generator Pod

The best way to load test a Kubernetes cluster is from *inside* the cluster itself. We deploy k6 as a single, one-shot Pod inside Kubernetes. It sits right next to the application and blasts traffic directly at the internal Ingress or ClusterIP service.

---

## Designing a Realistic Load Test

A good load test doesn't just hit the `/api/health` endpoint repeatedly. It simulates real user behavior.

In our test, we use a randomized distribution to mimic typical app usage:
- **40%** GET Workspaces (Light read)
- **30%** GET Tasks (Medium read, joins)
- **20%** GET Health (Very light read)
- **10%** POST Workspace (Database write operation)

This varied traffic pattern is much more likely to expose locking issues or slow queries in the database.

---

## The Feedback Loop: HPA in Action

When you start the load test, you will witness the complete Kubernetes autoscaling feedback loop:

1. **T=0s:** 200 Virtual Users begin hitting the API.
2. **T=5s:** CPU utilization across the 3 API pods spikes from 2% to 100%. They are struggling.
3. **T=15s:** Prometheus scrapes the `/api/metrics` and `cAdvisor` metrics.
4. **T=30s:** The HorizontalPodAutoscaler (HPA) controller runs its evaluation loop. It sees CPU at 100% (target is 60%).
5. **T=35s:** HPA calculates desired replicas: `ceil(3 * (100 / 60)) = 5`. It updates the Deployment.
6. **T=40s:** Kubernetes schedules 2 new API pods. They start Pending, then Running.
7. **T=45s:** New pods pass Readiness Probes. The Service adds them to the load balancing pool.
8. **T=50s:** Traffic is now split across 5 pods. CPU utilization per pod drops to ~60%.

This is the exact sequence of events that keeps production systems online during sudden traffic surges.

---

## 🔍 In This Project

### 1. The k6 Script
**File:** [`server/tests/load/loadtest.js`](../server/tests/load/loadtest.js)

```javascript
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
    vus: 200,          // 200 concurrent users
    duration: '5m',    // run for 5 minutes
};

export default function () {
    const baseUrl = __ENV.API_URL;
    const params = { headers: { 'Host': 'taskflow.local', 'Content-Type': 'application/json' } };
    const random = Math.random();

    // Randomized distribution logic...
    if (random < 0.40) { http.get(`${baseUrl}/api/workspaces`, params); }
    // ...
    
    sleep(Math.random() * 1.5 + 0.25); // Dynamic wait to space requests
}
```

### 2. The k6 Kubernetes Pod
**File:** [`server/tests/load/loadtest-pod.yaml`](../server/tests/load/loadtest-pod.yaml)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: k6-load-generator
spec:
  restartPolicy: Never   # It's a one-shot job, don't restart when finished
  containers:
    - name: k6
      image: grafana/k6:latest
      command: ["k6", "run", "/scripts/loadtest.js"]
      env:
        # We hit the internal Ingress controller Service directly
        - name: API_URL
          value: "http://ingress-nginx-controller.ingress-nginx.svc.cluster.local"
```
Notice how we bypass the external `minikube ip` entirely. The load generator connects directly to the internal DNS of the Nginx Ingress Controller.

---

## 🛠️ Hands-On Challenge

**Goal:** Run the load test and watch the HPA scale the application.

```bash
# 1. Setup: Open two terminals to monitor the cluster

# Terminal 1: Watch the HPA react
kubectl get hpa -n taskflow -w

# Terminal 2: Watch the Pods scale up
kubectl get pods -n taskflow -w

# 2. Open Grafana Dashboards
# Ensure you are port-forwarding Grafana: kubectl port-forward svc/monitoring-grafana -n monitoring 8080:80
# Open http://localhost:8080 and navigate to the TaskFlow dashboard.

# 3. Create a ConfigMap from the k6 JS script
kubectl create configmap loadtest-config --from-file=loadtest.js=server/tests/load/loadtest.js -n taskflow

# 4. Launch the Load Test Pod
kubectl apply -f server/tests/load/loadtest-pod.yaml

# 5. Observe!
# - Look at Terminal 1: You should see the CPU target jump past 60%, and replicas increase.
# - Look at Terminal 2: You should see new pods spin up.
# - Look at Grafana: Watch the Request Rate and CPU graphs spike.
# - Open Tempo in Grafana: Look at the trace volume increase.

# 6. View the k6 final report
# Once the 5 minutes are up (or if you stop it early):
kubectl logs k6-load-generator -n taskflow
# Look for: http_req_duration (avg, p90, p95) and http_req_failed

# 7. Clean up
kubectl delete pod k6-load-generator -n taskflow
kubectl delete configmap loadtest-config -n taskflow
```

**What to notice:**
- It takes a few seconds for the metrics pipeline to report the spike.
- The system scales up quickly, but when the test ends, it takes much longer to scale down (the 5-minute cooldown period we learned about in [06 - Reliability](./06-reliability.md)).
- If you check Loki logs during the test, you'll see a massive stream of structured JSON logs confirming the varied request types.

---

**Congratulations!** You've completed the complete Kubernetes + Observability journey. You've gone from a naked Pod to a fully instrumented, auto-scaling, load-tested production architecture.

**Review the Cheatsheet:** [KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md](../KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md)
