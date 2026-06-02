# Browser Agent System - Quick Start Guide

## Overview

The Browser Agent is an intelligent automation system that:
- 🎯 Understands your goal
- 📋 Plans automation steps
- 🤖 Executes browser actions
- ✅ Evaluates results
- 🔄 Refines automatically (up to 5 iterations)

## Quick Start

### 1. Launch Browser Agent
```bash
jimmy jet
# Select "Browser Agent" from menu
```

### 2. Enter Your Query
```
Enter query: Find the top 5 AI jobs on LinkedIn and extract their descriptions
```

### 3. Watch the Magic
The system will:
1. **Iteration 1**: Plan → Execute → Evaluate → Score
2. **Iteration 2** (if needed): Refine plan → Execute → Evaluate → Score
3. **Iteration 3+** (if needed): Continue refining...

### 4. Review Results
- Final score and completion status
- Extracted data (if any)
- Iteration logs
- Option to save to JSON file

## Example Queries

### Data Extraction
```
"Extract all product names and prices from Amazon search results for laptops"
"Get emails and phone numbers from the company website"
"List all job titles and salary ranges from the careers page"
```

### Navigation & Interaction
```
"Sign up for newsletter with email: test@example.com"
"Search for flights from NYC to LA and sort by price"
"Add first 5 items to shopping cart and proceed to checkout"
```

### Information Gathering
```
"Find the latest 10 blog posts and extract their titles and dates"
"Get contact information for all team members on the about page"
"List all upcoming webinars with dates and registration links"
```

### Complex Tasks
```
"Compare prices of iPhone 15 across 3 different retailers"
"Find user reviews for product XYZ and extract ratings"
"Automate login and export order history"
```

## Understanding the Iteration Process

### Iteration Feedback Loop

```
Query: "Find top 3 tech jobs with full descriptions"

┌─ Iteration 1 ─────────────────────────────────────┐
│ Plan:  Navigate → Search → Observe                │
│ Score: 60/100 ❌ (Incomplete data)                 │
│ Issues: Found 3 jobs but descriptions cut off     │
└────────────────────────────────────────────────────┘
                      │
                      ▼ (Feedback: Fix description extraction)
┌─ Iteration 2 ─────────────────────────────────────┐
│ Plan:  Navigate → Search → Click → Extract         │
│ Score: 85/100 ⚠️ (Mostly complete)                 │
│ Issues: 2 jobs have full description, 1 missing   │
└────────────────────────────────────────────────────┘
                      │
                      ▼ (Feedback: Get missing job details)
┌─ Iteration 3 ─────────────────────────────────────┐
│ Plan:  Navigate → Search → Extract All → Verify   │
│ Score: 98/100 ✅ (Complete!)                      │
│ Status: SATISFIED - All 3 jobs with descriptions  │
└────────────────────────────────────────────────────┘
```

## Reading the Results

### Console Output Example
```
═════════════════════════════════════════
📊 Browser Agent Execution Summary
═════════════════════════════════════════

Query: Find top 3 AI jobs with descriptions
Status: ✓ Succeeded
Total Iterations: 3/5
Final Score: 98/100
Completeness: 99%
Accuracy: 97%

📦 Extracted Data:
[
  {
    "title": "AI Engineer",
    "company": "Tech Corp",
    "salary": "$150k-$200k",
    "description": "..."
  },
  ...
]
```

### Saved JSON Structure
```json
{
  "success": true,
  "query": "Find top 3 AI jobs with descriptions",
  "finalData": { ... },
  "iterations": [
    {
      "iteration": 1,
      "plan": { "goal": "...", "steps": [...] },
      "execution": [
        { "success": true, "action": "navigate", ... },
        { "success": true, "action": "observe", ... },
        { "success": false, "action": "extract", "error": "..." }
      ],
      "evaluation": {
        "satisfied": false,
        "score": 60,
        "feedback": "...",
        "completeness": 50,
        "accuracy": 70,
        "issues": ["..."]
      },
      "shouldContinue": true
    },
    { "iteration": 2, ... },
    { "iteration": 3, ... }
  ],
  "totalIterations": 3,
  "completedAt": "2026-06-02T10:30:45.123Z"
}
```

## Supported Actions

### Navigation
- `navigate` - Go to URL
- `scroll` - Scroll up/down/left/right

### Interaction
- `click` - Click on elements
- `type` - Enter text

### Extraction
- `extract` - Get structured data with custom schema
- `observe` - Analyze available actions on page

### Timing
- `wait` - Wait for specified milliseconds

## Evaluation Metrics

**Score (0-100)**
- 0-30: Task not started/failed
- 31-60: Partial progress
- 61-80: Mostly complete
- 81-100: Complete/satisfied

**Completeness (0-100)**
- Percentage of required data obtained

**Accuracy (0-100)**
- Correctness of extracted data

**Satisfaction**
- Default threshold: 80/100
- Task marked as satisfied when score ≥ threshold

## Tips for Better Results

### 1. **Be Specific**
```
❌ "Find jobs"
✅ "Find senior software engineer jobs in SF with salary > $200k"
```

### 2. **Include Context**
```
❌ "Extract prices"
✅ "Extract iPhone 15 prices from Apple, Amazon, and Best Buy"
```

### 3. **Define Output Format**
```
❌ "Get company info"
✅ "Extract company name, founded year, and employee count"
```

### 4. **Set Clear Success Criteria**
```
❌ "Search for flights"
✅ "Find cheapest round-trip flights from NYC to LA under $300 for next week"
```

## Troubleshooting

### Query Too Vague
**Error**: Multiple iterations with low scores
**Solution**: Be more specific about what you need

### Navigation Fails
**Error**: First iteration fails on navigate step
**Solution**: Verify URL is correct and accessible

### Data Not Extracting
**Error**: Extract steps succeed but return empty data
**Solution**: Try with screenshot tool first to see page structure

### Browser Not Opening
**Error**: Connection error on init
**Solution**: Ensure Chrome is installed and `GOOGLE_GENERATIVE_AI_API_KEY` is set

## System Configuration

Edit `plan/browser-agent/orchestrator.ts`:

```typescript
const DEFAULT_CONFIG = {
  maxIterations: 5,              // Increase for complex tasks
  timeout: 120000,               // 2 minutes per execution
  model: "google/gemini-3.1-flash-lite-preview",
  evaluationThreshold: 80,       // Lower = accept sooner
};
```

## Environment Setup

**Required:**
```bash
export GOOGLE_GENERATIVE_AI_API_KEY="your-api-key-here"
```

**Optional:**
```bash
export DEBUG=true  # Enable verbose logging
```

## Integration Notes

✅ Works alongside existing modes:
- Agent Mode - File/folder operations
- Plan Mode - Task planning
- Ask Mode - General questions
- Browser Agent Mode - Web automation (NEW)

✅ No conflicts or breaking changes

## Performance Tips

1. **Reduce maxIterations** for quick results (default: 5)
2. **Increase timeout** for slower sites (default: 120s)
3. **Lower threshold** to accept "good enough" results faster
4. **Use variables** for repeated values (email, password, etc.)

## Advanced Usage

### Manual Plan (Future Feature)
```typescript
const manualPlan = {
  goal: "Extract pricing info",
  steps: [
    { id: 1, action: "navigate", value: "https://example.com" },
    { id: 2, action: "click", value: "Search for laptops" },
    { id: 3, action: "extract", description: "Get name and price" }
  ]
};

const result = await executeBrowserPlan(manualPlan);
```

### Direct Executor Usage
```typescript
import { runBrowserAgentMode } from './plan/browser-agent';

await runBrowserAgentMode();
```

## Support & Issues

For issues or feature requests, check:
1. Browser console for detailed error messages
2. Saved JSON result files for iteration logs
3. TypeScript types in `plan/browser-agent/types.ts`

---

**Happy automating!** 🚀
