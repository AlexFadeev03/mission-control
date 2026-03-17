import { NextResponse } from 'next/server'
import { runClaudeCode } from '@/lib/command'

const NPM_VERSION_URL =
  'https://registry.npmjs.org/@anthropic-ai/claude-code/latest'
const NPM_PACKAGE_URL =
  'https://www.npmjs.com/package/@anthropic-ai/claude-code'

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

const headers = { 'Cache-Control': 'public, max-age=3600' }

export async function GET() {
  let installed: string | null = null

  try {
    const result = await runClaudeCode(['--version'], { timeoutMs: 3000 })
    const match = result.stdout.match(/(\d+\.\d+\.\d+)/)
    if (match) installed = match[1]
  } catch {
    return NextResponse.json(
      { installed: null, latest: null, updateAvailable: false },
      { headers }
    )
  }

  if (!installed) {
    return NextResponse.json(
      { installed: null, latest: null, updateAvailable: false },
      { headers }
    )
  }

  try {
    const res = await fetch(NPM_VERSION_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { installed, latest: null, updateAvailable: false },
        { headers }
      )
    }

    const release = await res.json()
    const latest = String(release.version ?? '').replace(/^v/, '')
    const updateAvailable = latest ? compareSemver(latest, installed) > 0 : false

    return NextResponse.json(
      {
        installed,
        latest,
        updateAvailable,
        releaseUrl: NPM_PACKAGE_URL,
        releaseNotes: '',
        updateCommand: 'claude update --channel stable',
      },
      { headers }
    )
  } catch {
    return NextResponse.json(
      {
        installed,
        latest: null,
        updateAvailable: false,
        releaseUrl: NPM_PACKAGE_URL,
        releaseNotes: '',
        updateCommand: 'claude update --channel stable',
      },
      { headers }
    )
  }
}
