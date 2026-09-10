import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const lines = [];
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
for (const name of fs.readdirSync('dist').filter(n => /\.(exe|dmg)$/.test(n) && n.includes(version))) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(path.join('dist', name))) hash.update(chunk);
  lines.push(`${hash.digest('hex')}  ${name}`);
}
if (!lines.length) throw new Error('No release artifacts found');
fs.writeFileSync(path.join('dist', `SHA256SUMS-${process.platform}.txt`), lines.join('\n') + '\n');
console.log(lines.join('\n'));
