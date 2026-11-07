#!/usr/bin/env node
// 工具页行内 JS 语法体检：提取 tools/*/app.html 与 index.html 的行内 <script> 块做解析级校验。
// 只做语法解析（不执行），能抓住字符串跨行、正则残缺、引号键污染这类「页面能开但按钮全废」的损伤。
// 用法：node scripts/check_tools_js.mjs [目录...]（默认扫描 tools/ 下所有工具目录）
// 输出 JSON：{ checked, errors: [{ file, error }] }；退出码恒 0，违例由 check_tools.py 汇总决定。
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const checked = [];
const errors = [];

function scanPage(path) {
  if (!existsSync(path)) return;
  let html;
  try {
    html = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue; // 外链脚本不归本检查管
    if (/type\s*=\s*["'][^"']*(json|template)/i.test(attrs)) continue; // 数据/模板块不是 JS
    const code = m[2] || '';
    if (!code.trim()) continue;
    checked.push(path.replaceAll('\\', '/'));
    try {
      new Function(code); // 仅解析，不执行
    } catch (e) {
      errors.push({ file: path.replaceAll('\\', '/'), error: e.message });
    }
  }
}

const args = process.argv.slice(2);
let dirs;
if (args.length) {
  dirs = args; // 显式指定目录（供单测/复现单个页面）
} else {
  dirs = readdirSync('tools', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join('tools', d.name));
}
for (const d of dirs) {
  scanPage(join(d, 'app.html'));
  scanPage(join(d, 'index.html'));
}
console.log(JSON.stringify({ checked: checked.length, errors }));
