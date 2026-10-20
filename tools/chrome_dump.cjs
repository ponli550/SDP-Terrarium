// Runs headless Chrome on one URL and prints the resulting DOM, killing Chrome as soon as the document is complete.
// Chrome 148 can finish --dump-dom and then never exit (seen while a normal Chrome was open), which cost the full timeout on every launch.
// Usage: node chrome_dump.cjs <chrome> <profileDir> <url> [extra chrome flags...]
const { spawn } = require('child_process');
const [chrome, profile, url, ...extra] = process.argv.slice(2);
const args = ['--headless=new', ...extra, '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1000,700', '--user-data-dir=' + profile, '--virtual-time-budget=30000', '--dump-dom', url];
const c = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'ignore'] });
let out = '', done = false;
const finish = () => { if (done) return; done = true; clearTimeout(t); c.kill('SIGKILL'); process.stdout.write(out, () => process.exit(0)); };
const t = setTimeout(finish, 120000);
c.stdout.on('data', (d) => { out += d; if (/<\/html>\s*$/.test(out)) setTimeout(finish, 100); });
c.on('close', finish);
