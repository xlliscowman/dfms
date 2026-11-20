import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = await realpath(fileURLToPath(new URL('../dist/', import.meta.url)))
const port = Number(process.argv[2] || process.env.PORT || 8080)
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.avif': 'image/avif',
}

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }
  try {
    const { pathname } = new URL(request.url, 'http://localhost')
    const name = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1))
    const target = await realpath(join(root, name))
    const path = relative(root, target)
    const info = await stat(target)
    if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`) || !info.isFile()) throw new Error('Not found')
    response.writeHead(200, {
      'Content-Length': info.size,
      'Content-Type': mime[extname(path).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    })
    if (request.method === 'HEAD') response.end()
    else createReadStream(target).on('error', () => response.destroy()).pipe(response)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
  }
})
server.listen(port, '127.0.0.1', () => console.log(`东方淼森预览：http://127.0.0.1:${server.address().port}/`))
