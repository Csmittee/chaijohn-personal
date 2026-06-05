✅ COMPLETE — 2026-06-05
Summary: Executed on branch feat/mindmap. Built M4.1 Mind Map panel — Canvas 2D force-directed graph with pan/zoom, node CRUD modals, edge management, type/search filters. 5 new API endpoints (mindmap-nodes GET/POST, mindmap-nodes/:id PATCH/DELETE with cascade, mindmap-edges GET/POST, mindmap-edges/:id DELETE, setup/mindmap-schema). 60 seed nodes + 35 edges seeded once on empty Airtable state. Agent memory layer comment block in injector. RULES-dom.md updated with L161–L163. PR #83 created. Owner action required: call GET /api/setup/mindmap-schema once after deploy.

---

# CC_PROMPT_fix9I-mindmap.md
> Branch: feat/mindmap
> New panel: M4.1 Mind Map (route: mindmap, panel: #panel-mindmap)
> New Airtable tables: MindMapNodes, MindMapEdges
> New files: mindmap.injector.js, functions/api/mindmap-nodes.js,
>            functions/api/mindmap-nodes/[id].js, functions/api/mindmap-edges.js,
>            functions/api/mindmap-edges/[id].js, functions/api/setup/mindmap-schema.js
> Merge to main after owner QA

---

## ⚠️ OWNER ACTION REQUIRED AFTER DEPLOY

Call once to create Airtable tables:
```
GET https://chaijohn-dashboard.pages.dev/api/setup/mindmap-schema
```
Expected: `{"status":"ok","created":true}`

---

## CC INTRO

```
New session. Ignore all previous context.

You are working on CHAIJOHN OS at:
https://github.com/Csmittee/chaijohn-personal

Before doing anything else, read:
1. CLAUDE.md
2. RULES.md
3. .claude/rules/RULES-dom.md
4. .claude/rules/RULES-data.md
5. public/index.html               ← confirm panel-mindmap div + ROUTES array
6. public/assets/js/timemanagement.injector.js  ← reference for panel pattern only

Read ALL before writing a single line.
Then execute: CC_PROMPT_fix9I-mindmap.md — Branch: feat/mindmap
```

---

## CONTEXT

Build M4.1 Mind Map — an Obsidian-style force-directed network graph.
This is the owner's knowledge graph: everything that exists around them NOW —
businesses, projects, tools, people, skills, resources — and how they connect.

This panel serves TWO purposes:
1. Visual exploration — owner sees their world as a living network
2. Agent memory layer — future CC sessions query this to know the owner instantly

Panel shell already exists in index.html as `#panel-mindmap` (route: `mindmap`).
Replace `.coming-soon` placeholder. Injector owns everything inside.

---

## PART 1 — AIRTABLE SCHEMA

### Table: MindMapNodes

| Field | Type | Notes |
|---|---|---|
| `label` | Single line text | Primary — display name |
| `node_type` | Single select | Business, Project, Tool, People, Skill, Resource, Idea |
| `description` | Long text | Owner's own words about this node |
| `tags` | Single line text | Comma-separated — for agent queries |
| `context` | Long text | Structured context for AI: style, workflow, status |
| `status` | Single select | Active, Paused, Archived, Idea |
| `url` | Single line text | Optional link |
| `created_at` | Date | Auto |

### Table: MindMapEdges

| Field | Type | Notes |
|---|---|---|
| `from_id` | Single line text | Node record ID |
| `to_id` | Single line text | Node record ID |
| `edge_type` | Single select | uses, funds, spawned, inspired_by, requires, knows, failed_to, led_to, supports |
| `label` | Single line text | Short human label e.g. "failed → opened path" |
| `strength` | Number | 1–3 (1=weak, 2=normal, 3=strong) — affects edge thickness |
| `created_at` | Date | Auto |

---

## PART 2 — API ENDPOINTS

### 2A — Schema setup: `functions/api/setup/mindmap-schema.js`
`GET /api/setup/mindmap-schema`
Creates both tables using Airtable Meta API. Same pattern as daily-items-schema.js.
Return `{ status: 'ok', created: true }` or `{ status: 'exists' }`.

### 2B — Nodes CRUD: `functions/api/mindmap-nodes.js`
- GET → list all, flat, sorted by node_type then label
- POST → create node, required: label, node_type

### 2C — Node by ID: `functions/api/mindmap-nodes/[id].js`
- PATCH → update any field
- DELETE → delete node AND all edges where from_id or to_id = this id

### 2D — Edges CRUD: `functions/api/mindmap-edges.js`
- GET → list all edges
- POST → create edge, required: from_id, to_id, edge_type

### 2E — Edge by ID: `functions/api/mindmap-edges/[id].js`
- DELETE → delete single edge

No KV caching on any mindmap endpoint — data changes frequently.

---

## PART 3 — SEED DATA

On first load, if MindMapNodes table is empty, auto-seed with owner's data below.
Seed via POST to /api/mindmap-nodes for each node, then POST edges.
Show a "Seeding your network..." message during seed, then render graph.

### SEED NODES

**Businesses:**
- I-Flex Pilates | Business | Active | Chinese sponsor backed. Current main pilates studio business.
- Daje Queencatcher | Business | Active | 40 claw machines. Arcade/vending operation.
- Janis Flow | Business | Active | Board sport lifestyle. 2 shops at Rugby school. SUP yoga branch.

**Projects (from owner's active list):**
- Stock Market Simulator | Project | Active | Financial simulation tool.
- Janis OS Dashboard | Project | Active | Operating system dashboard for Janis businesses.
- Chaijohn OS | Project | Active | This system. Personal finance + life OS. 10 weeks of build.
- Satu 1.0 | Project | Active | Vending machine concept. First serious hardware project.
- Ploikong | Project | Active | Collectors online marketplace.
- Jade Coffee Capsule | Project | Idea | Coffee capsule product line.
- Satu Backend | Project | Active | Backend system for Satu vending machine.
- BBQ Offset Texas Style | Project | Idea | Texas-style BBQ offset smoker business.
- Craft Beer Vending System | Project | Idea | Automated craft beer vending.
- Off Road Buggy Import | Project | Idea | Import and sale of off-road buggies.
- Plant Pot Import China | Project | Idea | Import premium plant pots from China.
- Thai Massage Saudi Arabia | Project | Idea | Thai massage business concept for Saudi market.
- AI Game Center Riyadh | Project | Idea | AI-powered game center in Riyadh.

**Tools:**
- Claude AI | Tool | Active | Primary build partner. Agent layer for all projects.
- Airtable | Tool | Active | All data storage. Every table across all systems.
- Cloudflare | Tool | Active | Hosting + Workers + KV cache.
- Cloudinary | Tool | Active | Media management across systems.
- Canva | Tool | Active | Design and content creation.
- FreeCAD | Tool | Active | 3D design tool for hardware projects.
- P&L Generator | Tool | Active | Built-in Chaijohn OS module.
- Social Content Generator | Tool | Idea | Future tool for content automation.

**People:**
- Kyle | People | Active | Snail time China. Key China connection.
- K.Nok | People | Active | Pilates trainer. Introduced owner to pilates business.
- Scott | People | Active | Adjust Body China. 4 years later became Thailand representative.
- Choo | People | Active | Candy Land Arcade. Claw machine partner.
- BeiBei | People | Active | Doll factory China. Claw machine supply.
- Zack | People | Active | Coffee capsule machine maker.
- Andy | People | Active | Coffee capsule machine maker.
- K.Been | People | Active | Pilates studio owner. Gym owner. Potential buggy land partner.
- Dalibor | People | Active | Croatian knife maker. Great friend. Helped acquire 30M THB collection.
- Fune | People | Active | Sanit Sport Fitness owner. Gym owner. Claw machine buyer.
- Stefan | People | Active | Old friend Germany.
- Mr.Z | People | Active | Buggy cart supplier China.
- Mr.Y | People | Active | Plant pot supplier China. Son of biggest potting material manufacturer.
- Ting | People | Active | Great electrician. Trusted builder network.
- LungLek | People | Active | Trusted construction builder.
- Fluke | People | Active | Wood and steel welder.
- KimSu | People | Active | Aluminum stainless fabricator.
- Bar | People | Active | Great machinist.
- Pun | People | Active | Craft beer sales.
- Not | People | Active | Former colleague. Beer making expert.

**Skills:**
- Prompt Engineering | Skill | Active | 10 weeks. Core capability enabling all AI projects.
- System Design | Skill | Active | Cloudflare + Airtable + API architecture.
- Operations Director | Skill | Active | Multi-site operation management.
- Plant Manager | Skill | Active | Factory and production management.
- Supplier Development | Skill | Active | Global supplier sourcing and development.
- Supply Chain Director | Skill | Active | End-to-end supply chain management.
- Import Export | Skill | Active | Deep knowledge from Hammer Strength episode. Rules and discipline.

**Resources:**
- Surf/Skate Collection | Resource | Active | Boards over 1M THB value.
- 40 Claw Machines | Resource | Active | Full claw machine fleet. Daje Queencatcher operation.
- Warehouse Borwin | Resource | Active | Rental warehouse for operations.
- Knife Collection | Resource | Active | Premium knives. Dalibor connection. Famous in Thailand.
- Agave Plants | Resource | Active | Large agave collection.
- Bromeliad Plants | Resource | Active | Import from Florida. Friend network led to this.
- EDC Collection | Resource | Active | Every day carry tools collection.
- Steelflame Collection | Resource | Active | Premium lighter collection.
- Vintage Tools | Resource | Active | Bench vices USA/UK/Europe. Vintage tool collection.
- Weird Dolls | Resource | Active | Sigikid and weird doll collection.

---

## SEED EDGES

Post these edges after nodes are seeded. Match by label to get IDs:

```
Janis Flow → led_to → I-Flex Pilates [label: "SUP yoga → discovered pilates"]
K.Nok → led_to → I-Flex Pilates [label: "asked to order pilates"]
K.Been → supports → I-Flex Pilates [label: "studio owner relationship"]
Scott → supports → I-Flex Pilates [label: "Thailand representative"]
Prompt Engineering → enables → Chaijohn OS [label: "core build skill"]
Prompt Engineering → enables → Janis OS Dashboard [label: "core build skill"]
Claude AI → supports → Chaijohn OS [label: "built with"]
Claude AI → supports → Janis OS Dashboard [label: "built with"]
Airtable → supports → Chaijohn OS [label: "all data"]
Cloudflare → supports → Chaijohn OS [label: "hosting"]
Dalibor → supports → Knife Collection [label: "acquisition partner"]
Choo → supports → Daje Queencatcher [label: "arcade partner"]
BeiBei → supports → Daje Queencatcher [label: "doll supply"]
Fune → supports → Daje Queencatcher [label: "claw machine buyer"]
K.Been → supports → Daje Queencatcher [label: "bought claw machine"]
Not → inspired_by → Craft Beer Vending System [label: "beer making expertise"]
Pun → supports → Craft Beer Vending System [label: "craft beer sales"]
Mr.Z → supports → Off Road Buggy Import [label: "buggy supplier China"]
Mr.Y → supports → Plant Pot Import China [label: "pot supplier China"]
K.Been → supports → Off Road Buggy Import [label: "potential land for buggy"]
Zack → supports → Jade Coffee Capsule [label: "machine maker"]
Andy → supports → Jade Coffee Capsule [label: "machine maker"]
Import Export → enables → Satu 1.0 [label: "hardware import knowledge"]
Supply Chain Director → enables → Satu 1.0 [label: "supply chain expertise"]
Supplier Development → enables → Daje Queencatcher [label: "China supplier network"]
40 Claw Machines → funds → Daje Queencatcher [label: "primary asset"]
Warehouse Borwin → supports → Daje Queencatcher [label: "operations base"]
Knife Collection → led_to → Dalibor [label: "collector community"]
Bromeliad Plants → inspired_by → Agave Plants [label: "plant passion expanded"]
Surf/Skate Collection → supports → Janis Flow [label: "core inventory"]
Chaijohn OS → requires → Airtable [label: "data layer"]
Chaijohn OS → requires → Cloudflare [label: "infrastructure"]
Chaijohn OS → uses → Cloudinary [label: "media"]
Chaijohn OS → uses → Claude AI [label: "AI agent"]
Satu 1.0 → requires → Satu Backend [label: "backend system"]
```

---

## PART 4 — INJECTOR: `public/assets/js/mindmap.injector.js`

Full IIFE, same pattern as timemanagement.injector.js.
Route guard: `if (e.detail !== 'mindmap') return;`
Panel: `document.getElementById('panel-mindmap')`

### Module state

```javascript
let nodes = [];      // all MindMapNodes
let edges = [];      // all MindMapEdges
let selectedNode = null;   // currently clicked node
let filterType = 'all';    // node_type filter
let searchTerm = '';       // search filter
let transform = { x: 0, y: 0, scale: 1 }; // pan/zoom
let simulation = null;     // force layout state
```

### Panel layout (top to bottom)

**Header:**
```
Mind Map                                    [+ Add Node] [⟳ Reload]
// your world · connections · now
```

**Toolbar (below header):**
- Search input (filter nodes by label or tags)
- Type filter pills: [All] [Business] [Project] [Tool] [People] [Skill] [Resource]
- Active pill = yellow, inactive = muted

**Canvas area (fills remaining height):**
- Full-width canvas element
- Force-directed graph rendered on canvas
- Pan: drag on empty canvas area
- Zoom: scroll wheel
- Click node: select → highlight connections, show detail panel on right
- Double-click node: open edit modal

**Detail panel (right side, 280px, slides in on node select):**
Shows: label, type badge, status badge, description, tags, context,
list of connected nodes with edge type labels.
Buttons: [Edit] [Add Connection] [Delete Node]

### Force layout algorithm (pure JS, no D3 dependency)

Implement a simple force-directed simulation:

```javascript
// Node positions initialized randomly within canvas bounds
// Forces:
// 1. Repulsion: every node pair repels (strength: -800 / distance²)
// 2. Attraction: connected nodes attract (strength: edge.strength * 0.05)
// 3. Center gravity: weak pull toward canvas center (strength: 0.002)
// 4. Collision: nodes cannot overlap (radius + 10px buffer)

// Run simulation for 300 ticks on load, then stop (static after initial layout)
// On window resize: re-center without re-running simulation

function tick() {
  // Apply forces, update velocities, dampen (0.85), clamp to bounds
  // After 300 ticks: freeze positions, render final state
}
```

### Node rendering

Node types → colors (use same palette as mockup):
```javascript
const NODE_COLORS = {
  Business: '#8b5cf6',
  Project:  '#3b82f6',
  Idea:     '#f59e0b',
  Tool:     '#10b981',
  Resource: '#ef4444',
  Skill:    '#06b6d4',
  People:   '#f97316'
};
```

Node radius by type:
- Business: 22px
- Project: 18px
- People: 15px
- Tool: 14px
- Skill: 13px
- Resource: 13px

Selected node: radius + 4px, white ring 2px

Label: below node, 10px font, truncated 14 chars

Dimmed (when another node selected and not connected): opacity 0.25

### Edge rendering

- Default: 0.8px, rgba(200,200,220,0.12)
- Highlighted (connected to selected): 1.5px, rgba(200,200,220,0.4)
- Edge label: shown only when highlighted, 9px, centered on edge midpoint
- Edge thickness: 1px × edge.strength (1/2/3)

### Add Node modal

Fields: Label (required), Type (required, dropdown), Status, Description, Tags, Context
Save → POST /api/mindmap-nodes → add to nodes[] → re-run simulation 100 ticks → render

### Add Connection modal (from detail panel)

Fields: Connect to (searchable dropdown of all nodes), Edge type, Label, Strength (1/2/3)
Save → POST /api/mindmap-edges → add to edges[] → render

### Edit Node modal

All fields editable. Save → PATCH /api/mindmap-nodes/:id → update nodes[] → render
Delete → confirm → DELETE /api/mindmap-nodes/:id → removes node + all its edges → render

### Agent memory query endpoint note

Add a comment block in the injector near the top:
```javascript
/*
 * AGENT MEMORY LAYER
 * Future CC sessions can query the mind map for context:
 * GET /api/mindmap-nodes?type=Skill     → owner's skills
 * GET /api/mindmap-nodes?type=Tool      → owner's tools + preferences
 * GET /api/mindmap-nodes?status=Active  → what's active right now
 * GET /api/mindmap-edges?from=nodeId   → what this node connects to
 *
 * When starting a new project: query type=Business,Project,Skill,Tool (status=Active)
 * to know owner's capabilities, preferred stack, and available resources.
 */
```

Also update GET handler in mindmap-nodes.js to support `?type=` and `?status=` filters.

---

## PART 5 — index.html WIRING

1. Confirm `mindmap` is in ROUTES array — add if missing
2. Add `<script src="/assets/js/mindmap.injector.js"></script>` near other injector tags
3. Clear `.coming-soon` placeholder inside `#panel-mindmap`

---

## PERMANENT RULES — add to `.claude/rules/RULES-dom.md`

```
L161  Mind Map panel: route=mindmap, panel=#panel-mindmap,
      injector=mindmap.injector.js. Two Airtable tables: MindMapNodes + MindMapEdges.
      No KV caching — data changes frequently.
      Agent memory layer: GET /api/mindmap-nodes?type=X&status=Active for context queries.

L162  MindMapNodes node_types: Business, Project, Tool, People, Skill, Resource, Idea.
      Each node has: label, description, tags (comma CSV), context (AI-readable text),
      status (Active/Paused/Archived/Idea).

L163  MindMapEdges edge_types: uses, funds, spawned, inspired_by, requires, knows,
      failed_to, led_to, supports. Strength 1–3 affects edge thickness.
      Deleting a node also deletes all its edges (cascade in API).
```

---

## QA CHECKLIST (CC self-verify)

- [ ] Panel loads without console errors
- [ ] Force graph renders with seed nodes (50+ nodes visible)
- [ ] Nodes colored by type correctly
- [ ] Pan (drag) and zoom (scroll) work
- [ ] Click node → highlights its connections, dims others, opens detail panel
- [ ] Detail panel shows label, type, description, connected nodes list
- [ ] Type filter pills filter visible nodes correctly
- [ ] Search filters nodes by label
- [ ] Add Node modal → saves → node appears in graph
- [ ] Add Connection modal → saves → edge appears in graph
- [ ] Edit node → saves → updates in graph
- [ ] Delete node → removes node + its edges from graph
- [ ] Seeding runs once on empty table, not on subsequent loads
- [ ] GET /api/mindmap-nodes?type=Skill returns skill nodes only
- [ ] GET /api/mindmap-nodes?status=Active returns active nodes only
- [ ] No other injector files modified

---

## COMMIT ORDER

```
feat(api): mindmap-nodes + mindmap-edges CRUD endpoints + schema setup
feat(mindmap): mindmap.injector.js — force graph, seed data, agent memory layer
chore(index): wire mindmap route + script tag
docs: RULES-dom.md L161-L163 after fix9I
```

Merge to main after owner confirms QA checklist.
