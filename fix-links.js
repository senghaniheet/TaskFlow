
const fs = require("fs");
const path = require("path");

function replaceInFile(filePath, oldStr, newStr) {
  let content = fs.readFileSync(filePath, "utf8");
  if (content.includes(oldStr)) {
    content = content.replace(new RegExp(oldStr.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), "g"), newStr);
    fs.writeFileSync(filePath, content);
    console.log(`Fixed link in ${filePath}`);
  }
}

replaceInFile("docs/03-stateless-workloads.md", "./05-helm.md", "./08-helm.md");
replaceInFile("docs/09-cicd.md", "./01-core-workloads.md", "./03-stateless-workloads.md");
replaceInFile("docs/16-deployment-strategies.md", "./06-cicd.md", "./09-cicd.md");
replaceInFile("docs/16-deployment-strategies.md", "./07-reliability.md", "./10-reliability.md");
replaceInFile("docs/16-deployment-strategies.md", "./KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md", "../KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md");
replaceInFile("KUBERNETES_GRAFANA_PROMETHEUS_GUIDE.md", "./docs/13-deployment-strategies.md", "./docs/16-deployment-strategies.md");

