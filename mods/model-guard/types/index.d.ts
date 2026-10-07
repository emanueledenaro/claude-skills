// model-guard's named values in $.state: they outlive a reload of the hooks module, not /clear, /resume or /branch.

// A workflow run's width record, one per runId: the agentIndex values admitted so far, and the width
// (and profile name) that applied when the run started or was resumed.
export type ModelGuardRun = { admitted: number[]; width: number; name?: string }

// The `Claude plan:` line read from the person's CLAUDE.md (parsePlanLine's result).
export type ModelGuardPlan = {
  name: string | null
  reserve: number | null
  banked: { type: string; expires: string | null }[]
  usageFile: string | null
  raw: string
}

declare module 'claude-code' {
  interface PluginState {
    'model-guard': { runs: StateFamily<ModelGuardRun>; plan: ModelGuardPlan }
  }
}
