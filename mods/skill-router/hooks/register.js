// skill-router: the right skill loads at the right moment, by deterministic rules and no model call.
//   1. Tracks the skills loaded this session (skill.prompt, the Skill tool, slash-command expansion).
//   2. Knows which skills exist ($.command.list() at session start).
//   3. On the person's prompts, adds one hidden English line naming the matching skills not loaded yet.
//   4. Holds a launch, a merge or a mod edit once until its prerequisite skills are loaded.
// The only module that touches `$`; the route table and every decision live in routes.js.

import {
  ancestorDirs, contextLine, gateCheck, gateLog, isPersonOrigin, isUnder, joinPath, logLine,
  namesFrom, pickSuggestions, samePath, shellGates, skillTail, trustedList, writeGates,
} from './routes.js'

const config = { lang: 'it', gate: 'deny-once', suggest: 'on' }
const memo = {
  installed: null,          // Set of skill names from $.command.list(); null = unknown
  listTries: 0,
  loaded: new Set(),        // skill names (without plugin prefix) loaded in this conversation
  suggestedAt: new Map(),   // skill -> number of the person's prompt it was last suggested on
  prompts: 0,               // the person's prompts in this conversation
  fired: new Set(),         // gate keys that already held a call
}

// A new conversation (/clear, /resume, a fork) starts with nothing loaded, suggested or held.
function resetConversation() {
  memo.loaded = new Set()
  memo.suggestedAt = new Map()
  memo.prompts = 0
  memo.fired = new Set()
}

function markLoaded(name) {
  const tail = skillTail(name)
  if (tail) memo.loaded.add(tail)
}

// At most 3 tries per process: a failing list, or one naming no routed skill, leaves `installed` unknown.
async function refreshInstalled($) {
  if (memo.installed || memo.listTries >= 3) return
  memo.listTries++
  try {
    const names = namesFrom(await $.command.list())
    if (trustedList(names)) memo.installed = names
  } catch {}
}

function log($, text) {
  try {
    $.ui.log(text, { to: 'transcript' })
  } catch {}
}

async function exists($, path) {
  try {
    return (await $.fs.exists(path)) === true
  } catch {
    return false
  }
}

// The mod a file belongs to: the nearest folder above it with .claude-plugin/plugin.json, when that
// folder also has hooks/. A file being written as that manifest, or under hooks/, counts as there.
async function inMod($, filePath) {
  for (const dir of ancestorDirs(filePath)) {
    const manifest = joinPath(dir, '.claude-plugin', 'plugin.json')
    if (!samePath(filePath, manifest) && !(await exists($, manifest))) continue
    const hooks = joinPath(dir, 'hooks')
    return isUnder(filePath, hooks) || (await exists($, hooks))
  }
  return false
}

// Holds the call once when one of these gates fires; check and mark run with no await in between,
// so parallel calls in one batch hold only the first.
function hold($, e, next, keys) {
  const check = gateCheck(keys, memo)
  if (!check) return next(e)
  for (const key of check.keys) memo.fired.add(key)
  log($, gateLog(e.tool, check.skills, config.lang))
  return { deny: check.reason }
}

async function passOn($, e, next) {
  return next(e)
}

export function register(on, options) {
  const opts = options || {}
  config.lang = opts.language === 'en' ? 'en' : 'it'
  config.gate = opts.gate === 'off' ? 'off' : 'deny-once'
  config.suggest = opts.suggest === 'off' ? 'off' : 'on'

  // ------------------------------------------------ observers: they record and pass on unchanged

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refreshInstalled($)
    return result
  }).catch(passOn)

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear' || e.source === 'resume' || e.source === 'fork') resetConversation()
    return next(e)
  }).catch(passOn)

  on('skill.prompt', async ($, e, next) => {
    markLoaded(e.skill)
    return next(e)
  }).catch(passOn)

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const result = await next(e)
    if (!(result && result.isError)) markLoaded(e.skill)
    return result
  }).catch(passOn)

  on('classic.UserPromptExpansion', async ($, e, next) => {
    if (e.expansion_type !== 'mcp_prompt') markLoaded(e.command_name)
    return next(e)
  }).catch(passOn)

  // ------------------------------------------------ suggestions on the person's prompts

  if (config.suggest !== 'off') {
    // Adds one context line and never touches the prompt text; a failure passes the prompt on.
    on('prompt.submit', async ($, e, next) => {
      if (!isPersonOrigin(e.origin)) return next(e)
      if (typeof e.text !== 'string') throw new TypeError('prompt text is not text')
      memo.prompts++
      await refreshInstalled($)
      const picks = pickSuggestions({
        text: e.text,
        installed: memo.installed,
        loaded: memo.loaded,
        suggestedAt: memo.suggestedAt,
        promptNo: memo.prompts,
      })
      if (!picks.length) return next(e)
      const context = [...(e.context || []), contextLine(picks)]
      for (const p of picks) memo.suggestedAt.set(p.skill, memo.prompts)
      log($, logLine(picks, config.lang))
      return next({ ...e, context })
    }).catch(passOn)
  }

  // ------------------------------------------------ prerequisite gates (deny once)

  if (config.gate !== 'off') {
    // These gates are workflow nudges, not security guards: each holds a call at most once per
    // session per requirement, the retry always passes, and a gate that fails lets the call through
    // (.catch passes on with next(e) instead of refusing).

    on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
      const resume = e.resumeFromRunId
      if (resume !== undefined && resume !== null) {
        if (typeof resume !== 'string') throw new TypeError('resumeFromRunId is not text')
        return next(e) // resuming finishes open work: nothing to hold
      }
      return hold($, e, next, ['workflow'])
    }).catch(passOn)

    on('tool.call', { tool: 'Agent' }, async ($, e, next) => hold($, e, next, ['agent'])).catch(passOn)

    on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
      const keys = shellGates(e.command)
      if (!keys.length) return next(e)
      return hold($, e, next, keys)
    }).catch(passOn)

    on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
      const keys = writeGates(e)
      // No file system call unless a gate could still fire.
      if (!gateCheck(keys, memo)) return next(e)
      if (!(await inMod($, e.file_path))) return next(e)
      return hold($, e, next, keys)
    }).catch(passOn)
  }
}
