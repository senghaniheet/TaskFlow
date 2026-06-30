
const fs = require("fs");
const path = require("path");

const docsDir = "docs";
const docs = fs.readdirSync(docsDir).filter(f => f.endsWith(".md"));
const allMdFiles = ["README.md", "KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md", ...docs.map(d => "docs/" + d)];

let issues = 0;

// Function to check a file for any broken markdown links to local .md or .yaml files
function checkFile(filePath, content) {
  const linkRegex = /\[.*?\]\((.*?\.md|.*?\.yaml)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    let linkPath = match[1];
    
    // Clean up anchor links (e.g. ./00-introduction.md#some-section)
    if (linkPath.includes("#")) {
      linkPath = linkPath.split("#")[0];
    }
    
    // Resolve relative paths
    const dir = path.dirname(filePath);
    const resolvedPath = path.resolve(dir, linkPath);
    
    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      console.error(`[ERROR] ${filePath}: Broken link to -> ${linkPath}`);
      issues++;
    }
  }
}

// Check all files in docs/
docs.forEach(doc => {
  const filePath = path.join(docsDir, doc);
  const content = fs.readFileSync(filePath, "utf8");
  checkFile(filePath, content);
});

// Check root guide
if (fs.existsSync("KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md")) {
  checkFile("KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md", fs.readFileSync("KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md", "utf8"));
}

if (issues === 0) {
  console.log("SUCCESS: All local markdown and YAML links in all chapters are valid!");
} else {
  console.log(`Found ${issues} broken links.`);
}

