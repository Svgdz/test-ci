import { NextRequest, NextResponse } from 'next/server'

/*
 * OPTIONS handler for CORS preflight requests
 * CORS headers are handled globally in next.config.ts
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sandboxId = searchParams.get('sandboxId')
  const path = searchParams.get('path') || '/'

  if (!sandboxId) {
    return NextResponse.json({ success: false, error: 'sandboxId required' }, { status: 400 })
  }

  const upstream = `https://5173-${sandboxId}.e2b.dev${path}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(upstream, { signal: controller.signal })
    clearTimeout(timeout)

    const contentType = res.headers.get('content-type') || ''
    const isHtml = contentType.includes('text/html')
    const body = await res.text()

    if (!isHtml) {
      // For JS/TS modules, rewrite absolute imports to proxy endpoint
      const isJs =
        /javascript|ecmascript|\bjsx\b|\btsx\b|\bmodule\b/i.test(contentType) ||
        /\.(mjs|js|ts|jsx|tsx)(\?|$)/i.test(path)
      if (isJs) {
        const proxyBase = `/api/sandbox/visual-editor-proxy?sandboxId=${sandboxId}&path=`
        const rewritten = body
          // import "/@vite/client"; or from "/@vite/client"
          .replace(
            /(import\s+(?:[^'"\n]+\s+from\s+)?)["']\/(?:@vite|@id)\/client["']/g,
            `$1"${proxyBase}/@vite/client"`
          )
          .replace(/(from\s+)["']\/(?:@vite|@id)\/client["']/g, `$1"${proxyBase}/@vite/client"`)
          // generic absolute imports starting with /src/ or /@vite/ or /@fs/
          .replace(/(["'])\/(src|@vite|@fs|node_modules)\//g, `$1${proxyBase}/$2/`)
        return new NextResponse(rewritten, {
          status: res.status,
          headers: {
            'Content-Type': contentType || 'application/javascript',
            'Cache-Control': 'no-cache',
          },
        })
      }
      // Proxy other asset types as-is
      return new NextResponse(body, {
        status: res.status,
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // Inject lightweight selector script and rewrite URLs back to proxy
    const proxyBase = `/api/sandbox/visual-editor-proxy?sandboxId=${sandboxId}&path=`

    const currentPath = path || '/'
    const baseForRelative = currentPath.endsWith('/')
      ? currentPath
      : currentPath.substring(0, currentPath.lastIndexOf('/') + 1)

    const resolveResource = (p: string): string => {
      try {
        if (p.startsWith('http://') || p.startsWith('https://')) return p
        if (p.startsWith('/')) return p // root-relative from E2B
        // relative path -> resolve against current base
        const u = new URL(p, `https://dummy${baseForRelative}`)
        return u.pathname
      } catch {
        return p
      }
    }

    let html = body
      // absolute e2b urls
      .replace(/src=["']https:\/\/[^"']*-[^"']*\.e2b\.dev([^"']*?)["']/g, `src="${proxyBase}$1"`)
      .replace(/href=["']https:\/\/[^"']*-[^"']*\.e2b\.dev([^"']*?)["']/g, `href="${proxyBase}$1"`)
      // root-relative and relative urls (non-http)
      .replace(/(src|href)=["'](?!https?:)([^"']+)["']/g, (_m, attr: string, val: string) => {
        const resolved = resolveResource(val)
        return `${attr}="${proxyBase}${encodeURI(resolved)}"`
      })

    const injection = `
<script id="__visual_editor_injected__">
(function(){
  try{
    if (window.__visual_editor_ready__) return; 
    window.__visual_editor_ready__ = true;
    window.parent && window.parent.postMessage({ type: 'VISUAL_EDITOR_READY' }, '*');
    window.addEventListener('message', function(ev){
      if (!ev || !ev.data) return;
      if (ev.data.type === 'ENABLE_VISUAL_EDITOR') {
        try {
          const style = document.getElementById('visual-editor-styles') || (function(){
            const s = document.createElement('style');
            s.id = 'visual-editor-styles';
            s.textContent = '.visual-editor-hover{outline:2px dashed #3b82f6;outline-offset:2px;cursor:crosshair} .visual-editor-selected{outline:3px solid #ef4444;outline-offset:2px}';
            document.head.appendChild(s);
            return s;
          })();
          let last;
          document.addEventListener('mousemove', function(e){
            const t = e.target;
            if (!(t instanceof Element)) return;
            if (last && last !== t) last.classList.remove('visual-editor-hover');
            t.classList.add('visual-editor-hover');
            last = t;
          }, { capture:true });
          document.addEventListener('click', function(e){
            e.preventDefault();
            e.stopPropagation();
            const el = e.target;
            if (!(el instanceof Element)) return;
            document.querySelectorAll('.visual-editor-selected').forEach(n=>n.classList.remove('visual-editor-selected'));
            el.classList.add('visual-editor-selected');
            const r = el.getBoundingClientRect();
            // Mapping to component/file can be added in a safer path later
            const sel = (function gen(n){
              if (!n || !(n instanceof Element)) return '';
              if (n.id) return '#'+n.id;
              const cls = (n.className||'').toString().split(' ').filter(Boolean).slice(0,2).map(c=>'.'+c).join('');
              const parent = n.parentElement; 
              const head = n.tagName.toLowerCase()+cls; 
              if (!parent || parent===document.body) return head; 
              return gen(parent)+' > '+head;
            })(el);
            window.parent && window.parent.postMessage({
              type:'ELEMENT_SELECTED',
              selector: sel,
              elementType: el.tagName.toLowerCase(),
              textContent: (el.textContent||'').trim(),
              bounds:{ x:r.x, y:r.y, width:r.width, height:r.height }
            }, '*');
          }, { capture:true });
        } catch(_e){}
      }
    });
  }catch(_e){}
})();
</script>`

    if (html.includes('</body>')) html = html.replace('</body>', `${injection}</body>`)
    else html = `${html}\n${injection}`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ success: false, error: 'proxy_failed' }, { status: 502 })
  }
}
