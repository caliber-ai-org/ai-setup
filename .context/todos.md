# Deferred TODOs from CEO Plan Review (2026-03-18)

## P2: Context Utilization Summary
After generation completes, show token usage in the task display:
`Generating configs    Context: 45K/120K tokens (37%), 23 files included    12s`

Data is already available inside `buildGeneratePrompt` — surface it as a status message
on the "Generating configs" task line. Builds user trust and aids debugging.

Effort: S | Depends on: nothing

## P3: Interactive Context Negotiation (Two-Pass Generation)
First pass: send file tree + skeletons only (~20K tokens). LLM responds with which files
it needs to see in full detail. Second pass: send the requested files.

Research experiment — measure quality improvement vs priority-based approach before committing.
Risk: doubles LLM calls (cost + latency), requires new prompt engineering, conflicts with
streaming architecture.

Effort: L | Depends on: model-adaptive budgets
