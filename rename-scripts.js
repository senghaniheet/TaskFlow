
const fs = require("fs");
const path = require("path");

const k8sDir = "k8s-scripts";
const docsDir = "docs";

const files = fs.readdirSync(k8sDir);
const renames = [];

files.forEach(file => {
  const match = file.match(/^\d{2}-(.*\.yaml)$/);
  if (match) {
    const oldPath = path.join(k8sDir, file);
    const newName = match[1];
    const newPath = path.join(k8sDir, newName);
    fs.renameSync(oldPath, newPath);
    console.log(`Renamed ${file} -> ${newName}`);
    renames.push({ old: file, new: newName });
  }
});

// Also handle the user's manual edit for resource-quota in docs
const docs = fs.readdirSync(docsDir).filter(f => f.endsWith(".md"));

docs.forEach(doc => {
  const docPath = path.join(docsDir, doc);
  let content = fs.readFileSync(docPath, "utf8");
  let modified = false;

  renames.forEach(r => {
    // Replace all instances of XX-foo.yaml with foo.yaml
    const regex = new RegExp(r.old, "g");
    if (regex.test(content)) {
      content = content.replace(regex, r.new);
      modified = true;
    }
  });

  // Specifically fix the resource quota reference in 02-namespaces.md
  if (doc === "02-namespaces.md") {
    if (content.includes("k8s-scripts/00-namespace.yaml") && content.includes("ResourceQuota")) {
      content = content.replace(/# k8s-scripts\/00-namespace\.yaml/g, "# k8s-scripts/resource-quota.yaml");
      content = content.replace(/k8s-scripts\/00-namespace\.yaml/g, "k8s-scripts/namespace.yaml"); // the regex loop above already handled 00-namespace.yaml -> namespace.yaml, so we look for the updated name or just rely on replacing it correctly. Wait, the loop above will replace 00-namespace.yaml with namespace.yaml. So it will look like `k8s-scripts/namespace.yaml`. 
      
      // Let's just use string replace on the expected output:
      content = content.replace(/# k8s-scripts\/namespace\.yaml\napiVersion: v1\nkind: ResourceQuota/, "# k8s-scripts/resource-quota.yaml\napiVersion: v1\nkind: ResourceQuota");
      content = content.replace(/kubectl apply -f k8s-scripts\/namespace\.yaml\nkubectl describe resourcequota/, "kubectl apply -f k8s-scripts/resource-quota.yaml\nkubectl describe resourcequota");
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(docPath, content);
    console.log(`Updated references in ${doc}`);
  }
});

