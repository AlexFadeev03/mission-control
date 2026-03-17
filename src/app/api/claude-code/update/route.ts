import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { runClaudeCode } from '@/lib/command'
import { getDatabase } from '@/lib/db'
import { logger } from '@/lib/logger'

export async function POST(request: Request) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let installedBefore: string | null = null

  try {
    const vResult = await runClaudeCode(['--version'], { timeoutMs: 3000 })
    const match = vResult.stdout.match(/(\d+\.\d+\.\d+)/)
    if (match) installedBefore = match[1]
  } catch {
    return NextResponse.json(
      { error: 'Claude Code is not installed or not reachable' },
      { status: 400 }
    )
  }

  try {
    const result = await runClaudeCode(['update', '--channel', 'stable'], {
      timeoutMs: 5 * 60 * 1000,
    })

    let installedAfter: string | null = null
    try {
      const vResult = await runClaudeCode(['--version'], { timeoutMs: 3000 })
      const match = vResult.stdout.match(/(\d+\.\d+\.\d+)/)
      if (match) installedAfter = match[1]
    } catch {}

    try {
      const db = getDatabase()
      db.prepare(
        'INSERT INTO audit_log (action, actor, detail) VALUES (?, ?, ?)'
      ).run(
        'claude-code.update',
        auth.user.username,
        JSON.stringify({ previousVersion: installedBefore, newVersion: installedAfter })
      )
    } catch {}

    return NextResponse.json({
      success: true,
      previousVersion: installedBefore,
      newVersion: installedAfter,
      output: result.stdout,
    })
  } catch (err: any) {
    const detail =
      err?.stderr?.toString?.()?.trim() ||
      err?.stdout?.toString?.()?.trim() ||
      err?.message ||
      'Unknown error during Claude Code update'

    logger.error({ err }, 'Claude Code update failed')

    return NextResponse.json(
      { error: 'Claude Code update failed', detail },
      { status: 500 }
    )
  }
}
