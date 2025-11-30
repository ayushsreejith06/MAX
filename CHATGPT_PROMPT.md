# COPY THIS ENTIRE PROMPT INTO CHATGPT

---

You are a technical documentation expert. I need you to break down the following implementation tasks into separate, detailed Cursor agent prompts. Each prompt must be self-contained, specific (with exact file paths and line numbers), complete (all imports and error handling), testable (with verification steps), and follow existing code conventions.

## PROJECT CONTEXT

MAX project structure:
- Frontend: Next.js/React/TypeScript in `frontend/` directory
- Backend: Node.js/Fastify in `backend/` directory  
- Styling: Tailwind CSS with custom colors (sage-green, floral-white, pure-black, ink-500, etc.)
- API functions in `frontend/lib/api.ts` use `request()` helper
- Components in `frontend/components/`, Pages in `frontend/app/`

## EXISTING CODE PATTERNS

**API Function Pattern** (from `frontend/lib/api.ts` line 253):
```typescript
export async function createSector(sectorName: string, sectorSymbol: string): Promise<Sector> {
  const payload = await request<Sector>('/sectors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sectorName, sectorSymbol }),
  });
  return normalizeSector(payload);
}
```

**Button Styling**:
```tsx
<button className="rounded-2xl bg-sage-green px-5 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-pure-black hover:bg-sage-green/90">
  Button Text
</button>
```

## TASKS TO BREAK DOWN

Generate **6 separate Cursor agent prompts** in this exact format:

```
# TASK [N]: [TASK NAME]

## OBJECTIVE
[One-sentence objective]

## FILES TO MODIFY
- `path/to/file.ext` (lines X-Y or "NEW FILE")

## IMPLEMENTATION REQUIREMENTS

### Step 1: [Step name]
[Detailed instructions with code examples]

### Step 2: [Step name]
[Detailed instructions]

## CODE EXAMPLES

### Example: [Description]
\`\`\`typescript
[exact code]
\`\`\`

## VERIFICATION STEPS
1. [Test step]
2. [Check this]
3. [Expected result]

## NOTES
- [Important consideration]
```

### TASK 1: Add Frontend API Function
**File**: `frontend/lib/api.ts` after line 264 (after `createSector` function)
- Function: `createAgent(prompt: string, sectorId: string | null): Promise<Agent>`
- Endpoint: `POST /agents/create`
- Body: `{ prompt, sectorId }`
- Response format: `{ success: true, data: agent }` or direct agent
- Use existing `normalizeAgent()` helper
- Export the function

### TASK 2: Create Agent Creation Modal Component
**File**: `frontend/components/CreateAgentModal.tsx` (NEW FILE)
- Modal with backdrop
- Form fields:
  - Textarea for prompt (required, placeholder: "e.g., 'trade buy sell market'")
  - Dropdown for sector (fetch via `fetchSectors()`, include "Unassigned" option)
- Props: `onClose: () => void`, `onSuccess?: (agent: Agent) => void`, `preselectedSectorId?: string`
- Submit button with loading state
- Error display
- Validation: prompt required
- On submit: call `createAgent()` from `@/lib/api`, handle errors, call callbacks
- Styling: Match project color scheme (sage-green, floral-white, etc.)

### TASK 3: Wire Up "Spin New Agent" Button
**File**: `frontend/app/agents/page.tsx` line 169-171
- Import `CreateAgentModal`
- Add state: `const [showCreateModal, setShowCreateModal] = useState(false)`
- Add `onClick={() => setShowCreateModal(true)}` to button
- Render modal conditionally
- `onClose={() => setShowCreateModal(false)}`
- `onSuccess`: close modal, refresh agents list (re-run `loadAgents` from useEffect)

### TASK 4: Add "Create Agent" Button to Sector Detail Page
**File**: `frontend/app/sectors/[id]/SectorDetailClient.tsx` around line 264
- In "SECTOR AGENTS" section header, add button next to title
- Import `CreateAgentModal`
- Add state: `const [showCreateModal, setShowCreateModal] = useState(false)`
- Button text: "Create Agent", styling: sage-green background
- On click: open modal with `preselectedSectorId={sector.id}`
- `onSuccess`: close modal, reload sector (`fetchSectorById(sectorId)`)

### TASK 5: Fix Agent ID Type Mismatch for Contract
**File**: `backend/routes/agents.js` lines 68-73
- Issue: Agent IDs are UUIDs (strings), contract expects integers. `parseInt(agent.id)` returns `NaN`.
- Solution: Convert UUID to integer using hash function
- Options: Sum char codes modulo large number, or use first 8 chars as hex
- Update contract registration to use converted integer
- Add logging for both UUID and integer ID
- Ensure consistent mapping (same UUID → same integer)
- Keep error handling intact

### TASK 6: Update activeAgents Count on Agent Creation
**File**: `backend/agents/pipeline/createAgent.js` after line 116
- After saving agent, if status is 'active', update sector's `activeAgents`
- Load sectors, find by `sectorId`, increment `activeAgents` if agent is active
- Save updated sectors
- Handle null `sectorId` (skip)
- Handle missing sector (log warning, don't fail)

## REQUIREMENTS FOR EACH PROMPT

- Reference existing code patterns
- Include all necessary imports
- Handle TypeScript types correctly
- Include error handling
- Follow React best practices
- Match existing styling
- No breaking changes

**Now generate all 6 prompts in the specified format.**

