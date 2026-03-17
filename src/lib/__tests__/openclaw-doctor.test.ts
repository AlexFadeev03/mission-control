import { describe, expect, it } from 'vitest'
import { parseClaudeCodeDoctorOutput } from '@/lib/claude-code-doctor'

describe('parseClaudeCodeDoctorOutput', () => {
  it('marks warning output as fixable and extracts bullet issues', () => {
    const result = parseClaudeCodeDoctorOutput(`
Config warnings
- tools.exec.safeBins includes interpreter/runtime 'bun' without profile
- tools.exec.safeBins includes interpreter/runtime 'python3' without profile
Run: claude code doctor --fix
`, 0)

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('warning')
    expect(result.category).toBe('general')
    expect(result.canFix).toBe(true)
    expect(result.issues).toEqual([
      "tools.exec.safeBins includes interpreter/runtime 'bun' without profile",
      "tools.exec.safeBins includes interpreter/runtime 'python3' without profile",
    ])
  })

  it('marks invalid config output as an error', () => {
    const result = parseClaudeCodeDoctorOutput(`
Invalid config at /home/claude/.claude/claude-code.json:
- <root>: Unrecognized key: "test"
Config invalid
File: $CLAUDE_CODE_HOME/claude-code.json
Problem:
- <root>: Unrecognized key: "test"
Run: claude code doctor --fix
`, 1)

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('error')
    expect(result.category).toBe('config')
    expect(result.summary).toContain('Unrecognized key')
  })

  it('classifies state integrity warnings separately from config drift', () => {
    const result = parseClaudeCodeDoctorOutput(`
◇  State integrity
- Multiple state directories detected. This can split session history.
- Found 1 orphan transcript file(s) in ~/.claude/agents/jarv/sessions.
Run "claude code doctor --fix" to apply changes.
`, 0)

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('warning')
    expect(result.category).toBe('state')
    expect(result.summary).toContain('Multiple state directories')
  })

  it('suppresses foreign state-directory warnings for the active instance', () => {
    const result = parseClaudeCodeDoctorOutput(`
◇  State integrity
- Multiple state directories detected. This can split session history.
  - /home/nefes/.claude
  Active state dir: ~/.claude
- Found 1 orphan transcript file(s) in ~/.claude/agents/jarv/sessions.
Run "claude code doctor --fix" to apply changes.
`, 0, { stateDir: '/home/claude/.claude' })

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('warning')
    expect(result.category).toBe('state')
    expect(result.issues).toEqual([
      'Found 1 orphan transcript file(s) in ~/.claude/agents/jarv/sessions.',
    ])
    expect(result.raw).not.toContain('/home/nefes/.claude')
  })

  it('suppresses foreign state-directory warnings when the active dir is shown via CLAUDE_CODE_HOME alias', () => {
    const result = parseClaudeCodeDoctorOutput(`
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
┌  Claude Code doctor
│
◇  State integrity
- Multiple state directories detected. This can split session history.
  - $CLAUDE_CODE_HOME/.claude
  - /home/nefes/.claude
  Active state dir: $CLAUDE_CODE_HOME
- Found 11 orphan transcript file(s) in $CLAUDE_CODE_HOME/agents/jarv/sessions.
Run "claude code doctor --fix" to apply changes.
`, 0, { stateDir: '/home/claude/.claude' })

    expect(result.summary).toContain('Found 11 orphan transcript file(s)')
    expect(result.raw).not.toContain('/home/nefes/.claude')
    expect(result.raw).not.toContain('Multiple state directories detected')
  })

  it('parses state integrity blocks when lines are prefixed by box-drawing gutters', () => {
    const result = parseClaudeCodeDoctorOutput(`
┌  Claude Code doctor
│
◇  State integrity
│  - Multiple state directories detected. This can split session history.
│    - $CLAUDE_CODE_HOME/.claude
│    - /home/nefes/.claude
│    Active state dir: $CLAUDE_CODE_HOME
│  - Found 11 orphan transcript file(s) in $CLAUDE_CODE_HOME/agents/jarv/sessions.
Run "claude code doctor --fix" to apply changes.
`, 0, { stateDir: '/home/claude/.claude' })

    expect(result.level).toBe('warning')
    expect(result.category).toBe('state')
    expect(result.issues).toEqual([
      'Found 11 orphan transcript file(s) in $CLAUDE_CODE_HOME/agents/jarv/sessions.',
    ])
    expect(result.raw).not.toContain('/home/nefes/.claude')
    expect(result.raw).not.toContain('Multiple state directories detected')
  })

  it('marks clean output as healthy', () => {
    const result = parseClaudeCodeDoctorOutput('OK: configuration valid', 0)

    expect(result.healthy).toBe(true)
    expect(result.level).toBe('healthy')
    expect(result.category).toBe('general')
    expect(result.canFix).toBe(false)
  })

  it('treats positive security lines as healthy, not warnings (#331)', () => {
    const result = parseClaudeCodeDoctorOutput(`
? Security
- No channel security warnings detected.
- Run: claude code security audit --deep
`, 0)

    expect(result.healthy).toBe(true)
    expect(result.level).toBe('healthy')
    expect(result.issues).toEqual([])
  })

  it('still detects real security warnings alongside positive lines', () => {
    const result = parseClaudeCodeDoctorOutput(`
? Security
- Channel "public" has no auth configured.
- No channel security warnings detected.
- Run: claude code security audit --deep
`, 0)

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('warning')
    expect(result.issues).toEqual([
      'Channel "public" has no auth configured.',
    ])
  })
})
