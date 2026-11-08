// Serves a directory over HTTP, so the examples and the benchmark page can
// be opened in a browser without a bundler.
//   node examples/serve.mjs [dir] [url-path]     (PORT defaults to 8080)
// A path with no file falls back to the directory's index.html, so a
// reloaded client-side route still reaches the page.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [dir = 'examples/output', urlPath = '/'] = process.argv.slice(2);
const root = path.resolve(dir);
const port = Number(process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
};

function resolve(pathname) {
  const file = path.join(root, decodeURIComponent(pathname));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) return path.join(file, 'index.html');
  if (fs.existsSync(file)) return file;
  // The History example has its own shell so a deep-link reload does not
  // return to the gallery. Assets above are still served as files.
  if (pathname.startsWith('/history-router/')) return path.join(root, 'history-router/index.html');
  return path.join(root, 'index.html');
}

const server = http.createServer((req, res) => {
  const file = resolve(new URL(req.url, 'http://localhost').pathname);
  if (file === null) {
    res.writeHead(403).end('Forbidden');
  } else if (!fs.existsSync(file)) {
    res.writeHead(404).end(`Not found: ${file}`);
  } else {
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${port} is in use; set PORT to another` : e.message);
  process.exitCode = 1;
});
server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}${urlPath}`);
});
