# PROMPT FOR CHATGPT: Generate Cursor Agent Prompts for MAX Agent Creation Pipeline

You are a technical documentation expert. I need you to break down the following implementation tasks into separate, detailed Cursor agent prompts. Each prompt must be:

1. **Self-contained** - Can be executed independently in Cursor
2. **Specific** - Include exact file paths, line numbers, and code examples
3. **Complete** - Include all imports, error handling, and edge cases
4. **Testable** - Include verification steps
5. **Follow conventions** - Match existing code style (PascalCase for classes, camelCase for functions, kebab-case for components)

## PROJECT CONTEXT

This is a MAX project with:
- **Frontend**: Next.js/React/TypeScript in `frontend/` directory
- **Backend**: Node.js/Fastify in `backend/` directory
- **Styling**: Tailwind CSS with custom color scheme (sage-green, floral-white, pure-black, etc.)
- **API Base**: Functions in `frontend/lib/api.ts` use `request()` helper
- **Components**: Located in `frontend/components/`
- **Pages**: Located in `frontend/app/`

## EXISTING CODE PATTERNS

### API Function Pattern (from `frontend/lib/api.ts`):
```typescript
export async function createSector(sectorName: string, sectorSymbol: string): Promise<Sector> {
  const payload = await request<Sector>('/sectors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sectorName,
      sectorSymbol,
    }),
  });
  return normalizeSector(payload);
}
```

### Modal Pattern (similar to existing modals):
- Use React state for open/close
- Form validation
- Error handling with user feedback
- Loading states
- Success callbacks

### Button Styling Pattern:
```tsx
<button className="rounded-2xl bg-sage-green px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-pure-black hover:bg-sage-green/90">
  Button Text
</button>
```

## TASKS TO BREAK DOWN

Generate **6 separate Cursor agent prompts** for the following tasks:

### TASK 1: Add Frontend API Function for Agent Creation
**File**: `frontend/lib/api.ts`
**Location**: After `createSector()` function (around line 264)
**Requirements**:
- Function name: `createAgent`
- Parameters: `prompt: string, sectorId: string | null`
- Returns: `Promise<Agent>`
- Endpoint: `POST /agents/create`
- Body: `{ prompt, sectorId }`
- Use `normalizeAgent()` helper (already exists)
- Handle response format: `{ success: true, data: agent }` or direct agent object
- Export the function

### TASK 2: Create Agent Creation Modal Component
**File**: `frontend/components/CreateAgentModal.tsx` (NEW FILE)
**Requirements**:
- Modal component with backdrop
- Form fields:
  - Textarea for prompt (required, placeholder: "e.g., 'trade buy sell market' or 'analyze research forecast'")
  - Dropdown for sector selection (fetch sectors using `fetchSectors()`)
  - Option for "Unassigned" (null sectorId)
- Submit button with loading state
- Error display area
- Success callback prop: `onSuccess?: (agent: Agent) => void`
- Close callback prop: `onClose: () => void`
- Styling: Match existing modal patterns, use project color scheme
- Validation: Prompt cannot be empty
- On submit: Call `createAgent()` from `@/lib/api`, show loading, handle errors, call `onSuccess` and `onClose` on success

### TASK 3: Wire Up "Spin New Agent" Button in Agents Page
**File**: `frontend/app/agents/page.tsx`
**Location**: Line 169-171 (the "Spin New Agent" button)
**Requirements**:
- Import `CreateAgentModal` component
- Add state: `const [showCreateModal, setShowCreateModal] = useState(false)`
- Add `onClick` handler to button: `onClick={() => setShowCreateModal(true)}`
- Render `CreateAgentModal` conditionally when `showCreateModal` is true
- Pass `onClose={() => setShowCreateModal(false)}`
- Pass `onSuccess` callback that:
  - Closes modal
  - Refreshes agents list (re-run the `loadAgents` function from useEffect)
  - Shows success message (optional)

### TASK 4: Add "Create Agent" Button to Sector Detail Page
**File**: `frontend/app/sectors/[id]/SectorDetailClient.tsx`
**Location**: In the "SECTOR AGENTS" section header (around line 264, next to the h2 title)
**Requirements**:
- Import `CreateAgentModal` component
- Add state: `const [showCreateModal, setShowCreateModal] = useState(false)`
- Add button next to "SECTOR AGENTS ({sector.agents?.length || 0})" heading
- Button text: "Create Agent"
- Button styling: Match existing button style (sage-green background)
- On click: Open modal with `sectorId` pre-filled from current sector
- Pass `onClose={() => setShowCreateModal(false)}`
- Pass `onSuccess` callback that:
  - Closes modal
  - Reloads sector data (call `fetchSectorById(sectorId)` and update state)
- Pre-fill sector in modal (pass `preselectedSectorId={sector.id}` prop to modal)

### TASK 5: Fix Agent ID Type Mismatch for Contract Registration
**File**: `backend/routes/agents.js`
**Location**: Lines 68-73 (contract registration section)
**Issue**: Agent IDs are UUIDs (strings), but contract expects integers. `parseInt(agent.id)` on UUID returns `NaN`.
**Requirements**:
- Create a mapping system or use a hash function to convert UUID to integer
- Options:
  - Use a simple hash function (e.g., sum of char codes modulo large number)
  - Use first 8 characters of UUID as hex, convert to integer
  - Create a separate integer ID counter for contract registration
- Update the contract registration code to use the converted integer ID
- Add logging to show both UUID and integer ID
- Ensure the integer ID is consistent (same UUID always maps to same integer)
- Keep error handling intact

### TASK 6: Update activeAgents Count When Agents Are Created
**File**: `backend/agents/pipeline/createAgent.js`
**Location**: After agent is saved (after line 116)
**Requirements**:
- After saving agent, check if agent status is 'active'
- If active, update the sector's `activeAgents` count
- Load sectors, find the sector by `sectorId`, increment `activeAgents` if agent is active
- Save updated sectors
- Handle case where sectorId is null (skip update)
- Handle case where sector doesn't exist (log warning, don't fail)
- Also update when agent status changes (but that's a separate task, focus on creation only)

## OUTPUT FORMAT

For each task, generate a prompt in this exact format:

```
# TASK [NUMBER]: [TASK NAME]

## OBJECTIVE
[Clear one-sentence objective]

## FILES TO MODIFY
- `path/to/file1.ext` (lines X-Y, or "NEW FILE")
- `path/to/file2.ext` (lines A-B)

## IMPLEMENTATION REQUIREMENTS

### Step 1: [Step name]
[Detailed instructions with code examples]

### Step 2: [Step name]
[Detailed instructions with code examples]

## CODE EXAMPLES

### Example 1: [What this example shows]
\`\`\`typescript
[paste exact code]
\`\`\`

## VERIFICATION STEPS

1. [How to test this works]
2. [What to check]
3. [Expected behavior]

## NOTES
- [Any important considerations]
- [Edge cases to handle]
```

## ADDITIONAL REQUIREMENTS

- Each prompt should reference existing code patterns from the codebase
- Include all necessary imports
- Handle TypeScript types correctly
- Include error handling
- Follow React best practices (useState, useEffect, etc.)
- Match existing styling patterns
- Include comments where helpful
- Ensure no breaking changes to existing functionality

## START GENERATING

Generate all 6 prompts now, one after another, in the format specified above.

