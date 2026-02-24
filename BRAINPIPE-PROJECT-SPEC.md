# BrainPipe Project Specification

**Created:** 2026-02-24  
**Status:** Planned  
**Due:** 2026-03-15  
**Task ID:** a33d845b

---

## Overview

BrainPipe is a generic memory storage system for AI agents, built as the fourth pillar of OpenBrain.space. It provides vector-based semantic search for arbitrary knowledge, complementing TaskPipe (tasks), LeadPipe (relationships), and ContentQ (content).

**Core concept:** "The Brain of Your AI Agent" — a unified memory backend accessible via API, CLI, and web dashboard.

---

## The Problem

**Current state:**
- OpenClaw has local memory (LanceDB), but it's instance-specific
- No way to share memory across multiple agents
- No web UI to view/audit what the agent remembers
- Memory is scattered (some in OpenClaw, some in notes, some lost)

**User need:** "I want to tell my agent 'remember this' and see it in a dashboard, searchable forever."

---

## The Solution

### What BrainPipe Does

1. **Store arbitrary knowledge** with semantic embeddings
2. **Search via natural language** (vector similarity)
3. **View/audit in web dashboard** (OpenBrain.space)
4. **Access via CLI** (`brainpipe store "..."`, `brainpipe search "..."`)
5. **Integrate with OpenClaw** (memory_store → BrainPipe API)

### Memory Types Supported

- **Preferences** — "Benno prefers coffee at 8am"
- **Facts** — "London Business School, 150+ leaders coached"
- **Decisions** — "Agent Smith positioning: no-code AI marketing"
- **Entities** — "Max Hardy, SalesRook, +4407711881187"
- **Other** — generic knowledge

---

## Architecture

### Tech Stack

**Backend:**
- Supabase (Postgres + pgvector for embeddings)
- OpenAI Embeddings API (text-embedding-3-small, 1536 dimensions)
- Node.js/TypeScript API layer

**Frontend:**
- OpenBrain.space dashboard (React + Vite + Tailwind v4)
- New "Brain" tab with memory search/list/add/delete

**CLI:**
- `brainpipe` tool (mirrors TaskPipe/LeadPipe UX)
- Cloud mode by default (reads `~/.openbrain/config.json`)

**Integration:**
- OpenClaw skill: `~/clawd/skills/openbrain/` (already exists, extend it)
- `memory_store` → POST to BrainPipe API
- `memory_recall` → POST to BrainPipe search

### Data Flow

```
User voice input → OpenClaw → memory_store tool
                              ↓
                    POST /api/memory/store
                              ↓
                    Generate embedding (OpenAI)
                              ↓
                    Store in Supabase (text + vector)
                              ↓
                    Return memory ID
```

```
User search query → OpenClaw → memory_recall tool
                              ↓
                    POST /api/memory/search
                              ↓
                    Generate query embedding (OpenAI)
                              ↓
                    Vector similarity search (pgvector)
                              ↓
                    Return top 5 relevant memories
```

---

## Database Schema

### Supabase Table: `memories`

```sql
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  text TEXT NOT NULL,
  category TEXT,  -- preference | fact | decision | entity | other
  importance FLOAT DEFAULT 0.5,  -- 0.0 to 1.0
  embedding VECTOR(1536),  -- pgvector, OpenAI text-embedding-3-small
  metadata JSONB,  -- { tags: [], source: "openclaw", agent: "main" }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity index (ivfflat for faster search)
CREATE INDEX memories_embedding_idx 
ON memories 
USING ivfflat (embedding vector_cosine_ops);

-- Standard indexes
CREATE INDEX memories_user_id_idx ON memories(user_id);
CREATE INDEX memories_category_idx ON memories(category);
CREATE INDEX memories_importance_idx ON memories(importance DESC);
CREATE INDEX memories_created_at_idx ON memories(created_at DESC);
```

### Row-Level Security (RLS)

```sql
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Users can only access their own memories
CREATE POLICY "Users can view own memories"
ON memories FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories"
ON memories FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories"
ON memories FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories"
ON memories FOR DELETE
USING (auth.uid() = user_id);
```

---

## API Endpoints

### POST /api/memory/store

**Request:**
```json
{
  "text": "Benno prefers coffee at 8am",
  "category": "preference",
  "importance": 0.8,
  "metadata": {
    "source": "openclaw",
    "agent": "main"
  }
}
```

**Response:**
```json
{
  "success": true,
  "memory": {
    "id": "a1b2c3d4-...",
    "text": "Benno prefers coffee at 8am",
    "category": "preference",
    "importance": 0.8,
    "created_at": "2026-02-24T20:30:00Z"
  }
}
```

**Process:**
1. Validate input
2. Generate embedding via OpenAI API
3. Insert into Supabase (text + embedding + metadata)
4. Return memory object

---

### POST /api/memory/search

**Request:**
```json
{
  "query": "what does Benno like in the morning?",
  "limit": 5,
  "category": "preference",  // optional filter
  "min_importance": 0.5      // optional filter
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "a1b2c3d4-...",
      "text": "Benno prefers coffee at 8am",
      "category": "preference",
      "importance": 0.8,
      "similarity": 0.92,
      "created_at": "2026-02-24T20:30:00Z"
    }
  ],
  "count": 1
}
```

**Process:**
1. Generate embedding for query text
2. Vector similarity search (cosine distance)
3. Apply optional filters (category, importance)
4. Return top N results sorted by similarity

---

### GET /api/memory/list

**Query params:**
- `limit` (default: 20)
- `offset` (default: 0)
- `category` (optional filter)
- `sort` (created_at | importance | updated_at)
- `order` (asc | desc)

**Response:**
```json
{
  "success": true,
  "memories": [...],
  "total": 142,
  "page": 1,
  "limit": 20
}
```

---

### DELETE /api/memory/:id

**Response:**
```json
{
  "success": true,
  "deleted": "a1b2c3d4-..."
}
```

---

### PATCH /api/memory/:id

**Request:**
```json
{
  "text": "Updated memory text",
  "category": "fact",
  "importance": 0.9
}
```

**Response:**
```json
{
  "success": true,
  "memory": { ... }
}
```

**Note:** If `text` is updated, regenerate embedding.

---

## CLI Tool: `brainpipe`

### Installation

```bash
cd ~/projects/apps/openbrain/packages/brainpipe
npm install
npm link
```

### Commands

#### Store a memory
```bash
brainpipe store "Benno prefers coffee at 8am" --category preference --importance 0.8

# With tags
brainpipe store "London Business School MBA" --category fact --tags education,background

# Pipe from stdin
echo "Max Hardy works at SalesRook" | brainpipe store --category entity
```

#### Search memories
```bash
brainpipe search "morning preferences"
# Output:
# ✓ Found 2 memories:
# 1. [preference] Benno prefers coffee at 8am (0.92 similarity)
# 2. [preference] Likes to work early morning before 10am (0.78 similarity)

brainpipe search "clients" --category entity --limit 10
```

#### List all memories
```bash
brainpipe list
brainpipe list --category preference
brainpipe list --sort importance --order desc
brainpipe list --json  # JSON output for scripting
```

#### Show memory details
```bash
brainpipe show a1b2c3d4-...
```

#### Delete a memory
```bash
brainpipe delete a1b2c3d4-...
brainpipe delete --query "old preference"  # Search + confirm delete
```

#### Update a memory
```bash
brainpipe update a1b2c3d4-... --text "Updated text" --importance 0.9
```

#### Stats
```bash
brainpipe stats
# Output:
# Total memories: 142
# By category:
#   preference: 23
#   fact: 45
#   decision: 18
#   entity: 38
#   other: 18
# Average importance: 0.67
# Oldest: 2026-01-15
# Newest: 2026-02-24
```

### Config

Uses `~/.openbrain/config.json` (same as TaskPipe/LeadPipe):

```json
{
  "api_key": "ob_...",
  "api_url": "https://openbrain.space"
}
```

---

## Web Dashboard (OpenBrain.space)

### New "Brain" Tab

**Layout:**

```
┌─────────────────────────────────────────────────┐
│  🧠 Brain                                       │
├─────────────────────────────────────────────────┤
│  Search: [_____________________] [🔍 Search]    │
│                                                 │
│  Filters: [All Categories ▾] [All Importance ▾]│
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ ⭐ 0.9 | preference | 2026-02-24        │   │
│  │ Benno prefers coffee at 8am             │   │
│  │ [Edit] [Delete]                         │   │
│  └─────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────┐   │
│  │ ⭐ 0.8 | fact | 2026-02-20              │   │
│  │ London Business School, 150+ leaders    │   │
│  │ [Edit] [Delete]                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [+ Add Memory]                    [Stats ▾]   │
└─────────────────────────────────────────────────┘
```

### Features

1. **Semantic search bar** (vector search, not text match)
2. **Category filter** (dropdown: All | Preference | Fact | Decision | Entity | Other)
3. **Importance filter** (slider: 0.0 - 1.0)
4. **Sort options** (Created | Updated | Importance)
5. **Add memory modal** (text area + category + importance + tags)
6. **Edit in place** (click to edit, auto-save)
7. **Delete with confirmation**
8. **Stats panel** (collapsible):
   - Total memories
   - By category breakdown
   - Average importance
   - Oldest/newest dates
   - Storage used (character count)

### Mobile-Friendly

- Responsive grid (1 col mobile, 2 col tablet, 3 col desktop)
- Touch-friendly buttons
- Swipe to delete (optional)

---

## OpenClaw Integration

### Extend Existing Skill

**File:** `~/clawd/skills/openbrain/SKILL.md`

**Add to commands:**

```markdown
## BrainPipe Commands

### Store Memory
brainpipe store "<text>" [--category <type>] [--importance <0-1>]

### Search Memory
brainpipe search "<query>" [--category <type>] [--limit <n>]

### List Memories
brainpipe list [--category <type>] [--sort <field>]

### Delete Memory
brainpipe delete <id>
```

### OpenClaw Tool Mapping

**When user says:**
- "Remember this: ..." → `brainpipe store`
- "What did I say about ...?" → `brainpipe search`
- "Show my preferences" → `brainpipe list --category preference`
- "Forget that memory about ..." → `brainpipe search` + `brainpipe delete`

**Implementation:**

```typescript
// In OpenClaw skill handler
async function handleMemoryStore(text: string, category?: string, importance?: number) {
  const result = await fetch('https://openbrain.space/api/memory/store', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENBRAIN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text, category, importance })
  });
  return result.json();
}

async function handleMemoryRecall(query: string, options?: SearchOptions) {
  const result = await fetch('https://openbrain.space/api/memory/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENBRAIN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, ...options })
  });
  return result.json();
}
```

---

## Development Phases

### Phase 1: Backend (2-3 hours)
- [ ] Create Supabase `memories` table
- [ ] Enable pgvector extension
- [ ] Set up RLS policies
- [ ] Create API endpoints (store/search/list/delete)
- [ ] Test with Postman/curl

### Phase 2: CLI Tool (1-2 hours)
- [ ] Scaffold `brainpipe` package (copy TaskPipe structure)
- [ ] Implement commands: store, search, list, delete, stats
- [ ] Add config support (`~/.openbrain/config.json`)
- [ ] Test locally
- [ ] `npm link` for global access

### Phase 3: Dashboard (2-3 hours)
- [ ] Add "Brain" tab to OpenBrain.space
- [ ] Build search UI (input + results)
- [ ] Build list view (grid + filters)
- [ ] Build add memory modal
- [ ] Build edit/delete actions
- [ ] Build stats panel
- [ ] Test responsive design

### Phase 4: OpenClaw Skill (1 hour)
- [ ] Update `~/clawd/skills/openbrain/SKILL.md`
- [ ] Add `brainpipe` command mappings
- [ ] Test: "remember this" → store
- [ ] Test: "what did I say about X" → search
- [ ] Test: "show preferences" → list

### Phase 5: Testing & Polish (1 hour)
- [ ] End-to-end test: voice → store → search → dashboard
- [ ] Error handling (API failures, rate limits)
- [ ] Loading states in UI
- [ ] Success/error toasts
- [ ] Documentation (README.md)

**Total estimate:** 7-10 hours (1-2 days of focused work)

---

## Pricing Strategy (Future Product)

**BrainPipe as a Product:** "The Brain of Your AI Agent"

### Free Tier
- 1,000 memories
- 100 searches/day
- Single user
- Community support

### Pro Tier ($10/mo)
- 10,000 memories
- Unlimited searches
- Priority support
- Export/backup

### Business Tier ($50/mo)
- Unlimited memories
- Team sharing (up to 5 users)
- Dedicated support
- Custom integrations
- SLA

### Enterprise (Custom)
- On-premise deployment
- SSO/SAML
- Custom retention policies
- API rate limits customization

**Revenue model:** SaaS, monthly/annual billing via Stripe

---

## Success Metrics

**Launch goals (Month 1):**
- 10 beta users
- 1,000+ memories stored
- 500+ searches performed
- <100ms average search latency
- 99.9% uptime

**Growth goals (Month 3):**
- 100 active users
- 50,000+ memories stored
- 10 paying customers ($500 MRR)
- 5-star reviews on Product Hunt

---

## Risks & Mitigations

### Risk: Embedding costs (OpenAI API)
**Impact:** High usage could get expensive  
**Mitigation:** 
- Cache embeddings for duplicate text
- Batch embedding requests
- Consider open-source models (Sentence Transformers) for self-hosting

### Risk: Vector search performance at scale
**Impact:** Slow searches with 100k+ memories  
**Mitigation:**
- Use pgvector IVFFlat index (already planned)
- Shard by user_id if needed
- Consider Pinecone/Weaviate for >1M memories

### Risk: User privacy concerns
**Impact:** Users hesitant to store personal memories  
**Mitigation:**
- Clear privacy policy
- End-to-end encryption option (future)
- Self-hosting option for Enterprise

### Risk: Duplicate memories
**Impact:** Same fact stored multiple times  
**Mitigation:**
- Semantic deduplication check before insert
- "Similar memory exists, merge?" prompt

---

## Future Enhancements (Post-MVP)

### Short-term (Month 2-3)
- [ ] Bulk import (CSV, JSON, Notion export)
- [ ] Memory tags (user-defined)
- [ ] Memory collections/folders
- [ ] Sharing (specific memories with team)
- [ ] Export (CSV, JSON, Markdown)

### Medium-term (Month 4-6)
- [ ] Memory graphs (connections between memories)
- [ ] Auto-tagging (AI-generated tags)
- [ ] Memory decay (reduce importance over time)
- [ ] Memory refresh prompts ("Update this old info?")
- [ ] Multi-agent memory (agent1 stores, agent2 recalls)

### Long-term (Year 1+)
- [ ] End-to-end encryption
- [ ] Self-hosting option (Docker image)
- [ ] Mobile app (iOS/Android)
- [ ] Voice input/output (Wispr Flow integration)
- [ ] Memory timeline visualization
- [ ] Zapier/Make.com integration
- [ ] Slack/Discord bot interface

---

## Competition Analysis

### Existing Solutions

**Mem.ai**
- Pros: Beautiful UI, smart auto-linking
- Cons: Expensive ($8-15/mo), not API-first, slow

**Notion AI**
- Pros: Integrated with Notion, team collab
- Cons: Not agent-focused, search is keyword-based

**Obsidian + Plugins**
- Pros: Local-first, extensible
- Cons: No cloud sync (unless paid), not agent-friendly

**Pinecone/Weaviate (raw)**
- Pros: Fast, scalable
- Cons: Developer-only, no UI, expensive

### BrainPipe Differentiation

✅ **API-first** (built for agents, not humans)  
✅ **Simple pricing** (per memory, not per seat)  
✅ **Web dashboard** (audit what your agent knows)  
✅ **CLI tool** (power user friendly)  
✅ **OpenClaw native** (works out of the box)  
✅ **Open source option** (self-host if needed)

---

## Marketing Messaging

### Tagline
"The Brain of Your AI Agent"

### One-liner
"BrainPipe gives your AI agent a memory that never forgets — searchable, auditable, and shareable."

### Key benefits
1. **Never repeat yourself** — Tell your agent once, it remembers forever
2. **See what it knows** — Web dashboard shows every memory
3. **Search in seconds** — Natural language search, instant results
4. **Works everywhere** — API, CLI, OpenClaw, voice input

### Target audience
- OpenClaw users (primary)
- AI automation builders
- Service businesses (client context)
- Solo founders (personal knowledge base)

### Content ideas
- Tutorial: "How to Build an AI Agent with Perfect Memory"
- Case study: "How I Replaced Notion with BrainPipe"
- Demo video: "Voice to Memory in 5 Seconds"

---

## Open Questions

1. **Should memories be editable?** (Yes for Phase 1)
2. **Auto-expire old memories?** (No for Phase 1, optional later)
3. **Support images/files?** (Text-only Phase 1, files Phase 2)
4. **Multi-language support?** (English Phase 1, expand later)
5. **Team sharing model?** (Solo Phase 1, team Phase 3)

---

## Related Projects

- **TaskPipe** (`~/projects/apps/openbrain/packages/taskpipe/`)
- **LeadPipe** (`~/projects/apps/openbrain/packages/leadpipe/`)
- **ContentQ** (`~/projects/apps/openbrain/packages/contentq/`)
- **OpenBrain Dashboard** (`~/projects/apps/openbrain/client/`)
- **OpenClaw Skill** (`~/clawd/skills/openbrain/`)

---

## References

- **pgvector docs:** https://github.com/pgvector/pgvector
- **OpenAI Embeddings:** https://platform.openai.com/docs/guides/embeddings
- **Supabase Vector Search:** https://supabase.com/docs/guides/ai/vector-columns
- **OpenClaw Memory API:** (check latest docs)

---

## Decision Log

**2026-02-24:** Project spec created, task added to TaskPipe (a33d845b), due March 15, 2026.

---

**Next Steps:**

1. Review this spec
2. Decide on Phase 1 start date
3. Set up Supabase staging environment
4. Scaffold `brainpipe` package
5. Build backend API
6. Ship MVP

---

*Saved to: `~/projects/apps/openbrain/BRAINPIPE-PROJECT-SPEC.md`*
