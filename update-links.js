
const fs = require("fs");
const path = require("path");

const files = [
  { name: "04-networking.md", titleRegex: /# 02/, titleRepl: "# 04", pre: "03-stateless-workloads.md", next: "05-configuration.md" },
  { name: "05-configuration.md", titleRegex: /# 03/, titleRepl: "# 05", pre: "04-networking.md", next: "06-storage.md" },
  { name: "06-storage.md", titleRegex: /# 04/, titleRepl: "# 06", pre: "05-configuration.md", next: "07-statefulsets.md" },
  { name: "08-helm.md", titleRegex: /# 05/, titleRepl: "# 08", pre: "07-statefulsets.md", next: "09-cicd.md" },
  { name: "09-cicd.md", titleRegex: /# 06/, titleRepl: "# 09", pre: "08-helm.md", next: "10-reliability.md" },
  { name: "10-reliability.md", titleRegex: /# 07/, titleRepl: "# 10", pre: "09-cicd.md", next: "11-observability-arch.md" },
  { name: "11-observability-arch.md", titleRegex: /# 08/, titleRepl: "# 11", pre: "10-reliability.md", next: "12-load-testing.md" },
  { name: "12-load-testing.md", titleRegex: /# 09/, titleRepl: "# 12", pre: "11-observability-arch.md", next: "13-metrics.md" },
  { name: "13-metrics.md", titleRegex: /# 10/, titleRepl: "# 13", pre: "12-load-testing.md", next: "14-logging.md" },
  { name: "14-logging.md", titleRegex: /# 11/, titleRepl: "# 14", pre: "13-metrics.md", next: "15-tracing.md" },
  { name: "15-tracing.md", titleRegex: /# 12/, titleRepl: "# 15", pre: "14-logging.md", next: "16-deployment-strategies.md" },
  { name: "16-deployment-strategies.md", titleRegex: /# 13/, titleRepl: "# 16", pre: "15-tracing.md", next: "KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md" }
];

files.forEach(f => {
  const filePath = path.join("docs", f.name);
  if (!fs.existsSync(filePath)) { console.log("Missing", f.name); return; }
  let content = fs.readFileSync(filePath, "utf8");
  
  // Update Title
  content = content.replace(f.titleRegex, f.titleRepl);
  
  // Update Prerequisites link
  content = content.replace(/> \*\*Prerequisites:\*\* \[.*?\]\(.*?\)/, `> **Prerequisites:** [Previous Chapter](./${f.pre})`);
  
  // Update Next link
  content = content.replace(/\*\*Next:\*\* \[.*?\]\(.*?\)/, `**Next:** [Next Chapter](./${f.next})`);
  
  fs.writeFileSync(filePath, content);
  console.log("Updated", f.name);
});

