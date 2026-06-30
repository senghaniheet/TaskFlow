
const fs = require("fs");
const path = require("path");

const docsDir = "docs";
const k8sDir = "k8s-scripts";

const docs = fs.readdirSync(docsDir).filter(f => f.endsWith(".md"));
const scripts = fs.readdirSync(k8sDir).filter(f => f.endsWith(".yaml"));

let issues = 0;

docs.forEach(doc => {
  const content = fs.readFileSync(path.join(docsDir, doc), "utf8");
  
  // Find all matches for k8s-scripts/xyz.yaml
  const matches = [...content.matchAll(/k8s-scripts\/([a-zA-Z0-9.-]+)/g)];
  
  matches.forEach(match => {
    const scriptName = match[1];
    if (!scripts.includes(scriptName)) {
      console.error(`[ERROR] File "${doc}" references missing script: "${scriptName}"`);
      issues++;
    }
    if (/^\d{2}-/.test(scriptName)) {
      console.error(`[WARNING] File "${doc}" still contains a numbered reference: "${scriptName}"`);
      issues++;
    }
  });
});

if (issues === 0) {
  console.log("All k8s-scripts references in docs are valid and un-numbered!");
} else {
  console.log(`Found ${issues} issues to fix.`);
}

