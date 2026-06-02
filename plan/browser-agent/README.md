# Browser Agent System

A complete browser automation system with iterative refinement using Plan → Execute → Evaluate → Iterate (max 5 cycles).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Query                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  ITERATION LOOP (Max 5 iterations)                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  1. PLANNER                                          │  │
│  │  • Parse query with optional feedback               │  │
│  │  • Generate detailed browser automation plan        │  │
│  │  • Create step-by-step instructions                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                      │                                      │
│                      ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  2. EXECUTOR                                         │  │
│  │  • Execute plan steps using Stagehand               │  │
│  │  • Navigate, click, type, extract, observe         │  │
│  │  • Collect results and extracted data              │  │
│  └──────────────────────────────────────────────────────┘  │
│                      │                                      │
│                      ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  3. EVALUATOR                                        │  │
│  │  • Score execution (0-100)                          │  │
│  │  • Measure completeness & accuracy                  │  │
│  │  • Identify issues and gaps                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                      │                                      │
│                      ▼                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  4. DECISION                                         │  │
│  │  ✓ Satisfied? → Return result                       │  │
│  │  ✗ Max iterations? → Return best result             │  │
│  │  ✗ Continue? → Feed feedback to Planner             │  │
│  └──────────────────────────────────────────────────────┘  │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  Final Result        │
            │  • Success status    │
            │  • Extracted data    │
            │  • Iteration log     │
            └──────────────────────┘
```

## Components

### 1. **types.ts**
- `BrowserPlan` - Automation plan structure
- `BrowserStep` - Individual action step
- `ExecutionResult` - Step execution outcome
- `EvaluationResult` - Quality assessment
- `IterationResult` - Complete iteration cycle
- `BrowserAgentConfig` - Configuration options
- `BrowserAgentResult` - Final result

### 2. **planner.ts**
- `generateBrowserPlan(query, feedback?)` 
  - Uses LLM to create automation plan
  - Incorporates feedback from previous iterations
  - Generates concrete, actionable steps

### 3. **executor.ts**
- `executeBrowserPlan(plan)` - Runs all steps
- Supports actions:
  - `navigate` - Go to URL
  - `click` - Click elements
  - `type` - Type text
  - `extract` - Extract structured data
  - `observe` - Analyze available actions
  - `wait` - Wait for delay
  - `scroll` - Scroll page
- `closeStagehand()` - Cleanup

### 4. **evaluator.ts**
- `evaluateExecutionResults()` - Quality scoring
  - Score: 0-100
  - Completeness: 0-100
  - Accuracy: 0-100
  - Issues: Array of problems
- `shouldContinueIterating()` - Decide to retry
- `extractFeedbackForNextIteration()` - Prepare feedback

### 5. **orchestrator.ts**
- `runBrowserAgentMode()` - Main entry point
- Manages iteration loop
- Coordinates all components
- Handles user interaction
- Saves results optionally

## Usage

### CLI Entry Point
```bash
jimmy jet
# Select "Browser Agent" from menu
# Enter your query
```

### Query Examples
```
"Find top 5 AI jobs on LinkedIn and get their descriptions"
"Search for flights from NYC to LA for next week under $300"
"Extract all product names and prices from the homepage"
"Sign up for newsletter with email test@example.com"
```

## Configuration

**Default Config** (in orchestrator.ts):
```typescript
{
  maxIterations: 5,           // Max retry cycles
  timeout: 120000,             // 2 minutes
  model: "google/gemini-3.1-flash-lite-preview",
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  evaluationThreshold: 80      // 80/100 to mark satisfied
}
```

## Iteration Flow Example

### Iteration 1
- **Plan**: Navigate → Observe → Extract
- **Execute**: All steps succeed
- **Evaluate**: Score 65/100 (incomplete data)
- **Decision**: Continue (not satisfied)

### Iteration 2
- **Plan** (with feedback): Navigate → Search → Wait → Scroll → Extract
- **Execute**: All steps succeed
- **Evaluate**: Score 85/100 (complete, minor issues)
- **Decision**: Continue (score < threshold)

### Iteration 3
- **Plan** (refined): Navigate → Interact → Extract → Verify
- **Execute**: All succeed
- **Evaluate**: Score 95/100 (satisfied!)
- **Decision**: ✓ Complete, return result

## Output Format

### Console Output
- Iteration count and status
- Plan visualization
- Execution progress
- Evaluation scores and feedback
- Extracted data
- Final summary

### Saved JSON
```json
{
  "success": true,
  "query": "...",
  "finalData": { ... },
  "iterations": [
    {
      "iteration": 1,
      "plan": { ... },
      "execution": [ ... ],
      "evaluation": { ... },
      "shouldContinue": true
    }
  ],
  "totalIterations": 3,
  "completedAt": "2026-06-02T10:30:45.123Z"
}
```

## Error Handling

- **Plan Generation**: Catch and report LLM errors
- **Execution**: Continue on non-critical steps, stop on navigation failure
- **Evaluation**: Graceful fallback with default scores
- **Browser**: Automatic cleanup on exit

## Integration with Existing System

✅ **Preserved Functionality:**
- Agent Mode - unchanged
- Plan Mode - unchanged  
- Ask Mode - unchanged
- CLI navigation - enhanced

✅ **New Features:**
- Browser Agent menu option
- No breaking changes
- Optional feature

## Dependencies

- `@browserbasehq/stagehand` - Browser automation
- `ai` - LLM integration
- `@clack/prompts` - CLI prompts
- `chalk` - Terminal colors
- `zod` - Schema validation

## Environment Variables

```
GOOGLE_GENERATIVE_AI_API_KEY=...  # For Stagehand
```

## Status

✅ Fully implemented and integrated
✅ Error handling included
✅ No breaking changes
✅ Type-safe with TypeScript
✅ Production ready
