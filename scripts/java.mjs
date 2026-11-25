// محاكي Firestore يحتاج Java 11+؛ نبحث عنه ونضيفه للمسار.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export function withJava() {
  const env = { ...process.env };
  const ok = () => { try { execSync("java -version", { stdio: "ignore", env }); return true; } catch { return false; } };
  if (!ok()) {
    const dir = [env.JAVA_HOME && path.join(env.JAVA_HOME, "bin"), "/opt/homebrew/opt/openjdk@21/bin", "/opt/homebrew/opt/openjdk@17/bin", "/opt/homebrew/opt/openjdk/bin", "/usr/local/opt/openjdk/bin"].find((d) => d && existsSync(path.join(d, "java")));
    if (dir) env.PATH = `${dir}${path.delimiter}${env.PATH}`;
  }
  if (!ok()) {
    console.error("\n✖ محاكي Firestore يحتاج Java 11 أو أحدث.\n  ماك: brew install openjdk@21   لينكس: sudo apt install openjdk-21-jre\n");
    process.exit(1);
  }
  delete env.FIREBASE_SERVICE_ACCOUNT; // لا نلمس قاعدة حقيقية أبدًا من هنا
  return env;
}

export function emulate(config, project, inner, extra = []) {
  return ["firebase", "emulators:exec", "--config", config, "--only", "firestore", "--project", project, ...extra, inner];
}
