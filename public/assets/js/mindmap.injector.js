/*
 * M4.1 Mind Map — mindmap.injector.js
 *
 * AGENT MEMORY LAYER
 * Future CC sessions can query the mind map for context:
 * GET /api/mindmap-nodes?type=Skill      → owner's skills
 * GET /api/mindmap-nodes?type=Tool       → owner's tools + preferences
 * GET /api/mindmap-nodes?status=Active   → what's active right now
 * GET /api/mindmap-edges?from=nodeId    → what this node connects to
 *
 * When starting a new project: query type=Business,Project,Skill,Tool (status=Active)
 * to know owner's capabilities, preferred stack, and available resources.
 */
(function () {
  'use strict';

  let nodes        = [];
  let edges        = [];
  let selectedNode = null;
  let filterType   = 'all';
  let searchTerm   = '';
  let transform    = { x: 0, y: 0, scale: 1 };
  let simulation   = null;
  let initialized  = false;
  let dragNode        = null;     // node being individually dragged
  let dragOffset      = { x: 0, y: 0 };
  let dragMoved       = false;   // true only after mouse moves > 3px
  let dragStartClient = { x: 0, y: 0 };

  // ── Node appearance ───────────────────────────────────────────────────────
  const NODE_COLORS = {
    Business: '#8b5cf6',
    Project:  '#3b82f6',
    Idea:     '#f59e0b',
    Tool:     '#10b981',
    Resource: '#ef4444',
    Skill:    '#06b6d4',
    People:   '#f97316'
  };
  const NODE_RADIUS = { Business: 22, Project: 18, People: 15, Tool: 14, Skill: 13, Resource: 13, Idea: 13 };
  const NODE_TYPES  = ['Business', 'Project', 'Tool', 'People', 'Skill', 'Resource', 'Idea'];

  function panel()  { return document.getElementById('panel-mindmap'); }
  function canvas() { return document.getElementById('mm-canvas'); }

  // ── Styles ────────────────────────────────────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('mm-styles')) return;
    const s = document.createElement('style');
    s.id = 'mm-styles';
    s.textContent = `
      #panel-mindmap.active { display: flex; flex-direction: column; overflow: hidden; }
      .mm-wrap { display: flex; flex-direction: column; flex: 1; min-height: 0; padding: 1.25rem 1.25rem 0.5rem; overflow: hidden; }
      .mm-header { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; margin-bottom: 0.6rem; flex-wrap: wrap; }
      .mm-title  { font-size: 1.35rem; font-weight: 700; color: var(--text); flex: 1; }
      .mm-subtitle { font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-dim); }
      .mm-header-btns { display: flex; gap: 0.4rem; }
      .mm-btn  { font-family: var(--font-mono); font-size: 0.72rem; padding: 0.3rem 0.7rem; border-radius: var(--radius); cursor: pointer; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-muted); }
      .mm-btn:hover { border-color: var(--yellow); color: var(--yellow); }
      .mm-btn-primary { background: var(--yellow); color: #0a0a10; border-color: var(--yellow); font-weight: 600; }
      .mm-btn-primary:hover { background: #e6b800; border-color: #e6b800; color: #0a0a10; }
      .mm-toolbar { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; margin-bottom: 0.5rem; flex-wrap: wrap; }
      .mm-search { font-size: 0.78rem; padding: 0.3rem 0.6rem; border-radius: var(--radius); border: 1px solid var(--border-strong); background: var(--bg-raised); color: var(--text); width: 180px; }
      .mm-filter-pills { display: flex; gap: 0.3rem; flex-wrap: wrap; }
      .mm-pill { font-family: var(--font-mono); font-size: 0.65rem; padding: 0.18rem 0.55rem; border-radius: 100px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-dim); cursor: pointer; }
      .mm-pill.active { border-color: var(--yellow); color: #0a0a10; background: var(--yellow); }
      .mm-body { display: flex; gap: 0; flex: 1; min-height: 0; }
      .mm-canvas-wrap { flex: 1; min-width: 0; position: relative; background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
      #mm-canvas { display: block; width: 100%; height: 100%; cursor: grab; }
      #mm-canvas:active { cursor: grabbing; }
      .mm-detail { width: 280px; flex-shrink: 0; background: var(--bg-raised); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 0.85rem; overflow-y: auto; margin-left: 0.6rem; display: none; flex-direction: column; gap: 0.5rem; }
      .mm-detail.open { display: flex; }
      .mm-detail-label { font-size: 1rem; font-weight: 700; color: var(--text); word-break: break-word; }
      .mm-badge { font-family: var(--font-mono); font-size: 0.62rem; font-weight: 600; padding: 0.15rem 0.45rem; border-radius: 3px; display: inline-block; }
      .mm-detail-desc { font-size: 0.78rem; color: var(--text-muted); line-height: 1.45; }
      .mm-detail-tags { font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-dim); }
      .mm-detail-ctx  { font-size: 0.72rem; color: var(--text-dim); background: var(--bg-card); border-radius: var(--radius); padding: 0.4rem 0.55rem; border: 1px solid var(--border); }
      .mm-conn-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
      .mm-conn-item { font-size: 0.75rem; padding: 0.25rem 0.45rem; border-radius: var(--radius); background: var(--bg-card); border: 1px solid var(--border); display: flex; align-items: center; gap: 0.35rem; cursor: pointer; }
      .mm-conn-item:hover { border-color: var(--border-strong); }
      .mm-conn-type { font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-dim); }
      .mm-detail-btns { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.25rem; }
      .mm-detail-sec { font-family: var(--font-mono); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-dim); margin-top: 0.15rem; }
      .mm-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 700; display: flex; align-items: center; justify-content: center; }
      .mm-modal { background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); padding: 1.25rem; width: min(460px, 92vw); max-height: 85vh; overflow-y: auto; }
      .mm-modal h3 { margin: 0 0 0.75rem; font-size: 0.95rem; }
      .mm-modal label { display: block; font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-dim); margin-bottom: 0.15rem; margin-top: 0.45rem; }
      .mm-modal input, .mm-modal select, .mm-modal textarea { width: 100%; box-sizing: border-box; font-size: 0.8rem; padding: 0.3rem 0.5rem; border-radius: var(--radius); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); }
      .mm-modal textarea { resize: vertical; min-height: 3rem; }
      .mm-modal .mm-modal-btns { display: flex; gap: 0.4rem; margin-top: 0.75rem; }
      .mm-status-bar { font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-dim); padding: 0.25rem 0.5rem; flex-shrink: 0; }
      .mm-hint { position: absolute; bottom: 0.5rem; left: 0.5rem; font-family: var(--font-mono); font-size: 0.6rem; color: rgba(255,255,255,0.2); pointer-events: none; }
      .mm-del-btn { background: none; border: 1px solid var(--red); color: var(--red); border-radius: var(--radius); font-size: 0.72rem; padding: 0.25rem 0.6rem; cursor: pointer; }
      .mm-del-btn:hover { background: rgba(239,68,68,0.1); }
      .mm-tooltip { position: absolute; background: var(--bg-card); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 0.2rem 0.5rem; font-family: var(--font-mono); font-size: 0.6rem; color: var(--text-dim); pointer-events: none; white-space: nowrap; z-index: 10; display: none; max-width: 260px; white-space: normal; line-height: 1.35; }
      @media (max-width: 700px) { .mm-detail { display: none !important; } }
    `;
    document.head.appendChild(s);
  }

  // ── Seed data ─────────────────────────────────────────────────────────────
  const SEED_NODES = [
    // Businesses
    { label: 'I-Flex Pilates',        node_type: 'Business', status: 'Active',   description: 'Chinese sponsor backed. Current main pilates studio business.' },
    { label: 'Daje Queencatcher',     node_type: 'Business', status: 'Active',   description: '40 claw machines. Arcade/vending operation.' },
    { label: 'Janis Flow',            node_type: 'Business', status: 'Active',   description: 'Board sport lifestyle. 2 shops at Rugby school. SUP yoga branch.' },
    // Projects
    { label: 'Stock Market Simulator',node_type: 'Project',  status: 'Active',   description: 'Financial simulation tool.' },
    { label: 'Janis OS Dashboard',    node_type: 'Project',  status: 'Active',   description: 'Operating system dashboard for Janis businesses.' },
    { label: 'Chaijohn OS',           node_type: 'Project',  status: 'Active',   description: 'This system. Personal finance + life OS. 10 weeks of build.' },
    { label: 'Satu 1.0',             node_type: 'Project',  status: 'Active',   description: 'Vending machine concept. First serious hardware project.' },
    { label: 'Ploikong',             node_type: 'Project',  status: 'Active',   description: 'Collectors online marketplace.' },
    { label: 'Jade Coffee Capsule',   node_type: 'Project',  status: 'Idea',     description: 'Coffee capsule product line.' },
    { label: 'Satu Backend',         node_type: 'Project',  status: 'Active',   description: 'Backend system for Satu vending machine.' },
    { label: 'BBQ Offset Texas Style',node_type: 'Project',  status: 'Idea',     description: 'Texas-style BBQ offset smoker business.' },
    { label: 'Craft Beer Vending System', node_type: 'Project', status: 'Idea', description: 'Automated craft beer vending.' },
    { label: 'Off Road Buggy Import', node_type: 'Project',  status: 'Idea',     description: 'Import and sale of off-road buggies.' },
    { label: 'Plant Pot Import China',node_type: 'Project',  status: 'Idea',     description: 'Import premium plant pots from China.' },
    { label: 'Thai Massage Saudi Arabia', node_type: 'Project', status: 'Idea', description: 'Thai massage business concept for Saudi market.' },
    { label: 'AI Game Center Riyadh', node_type: 'Project',  status: 'Idea',     description: 'AI-powered game center in Riyadh.' },
    // Tools
    { label: 'Claude AI',            node_type: 'Tool',     status: 'Active',   description: 'Primary build partner. Agent layer for all projects.' },
    { label: 'Airtable',             node_type: 'Tool',     status: 'Active',   description: 'All data storage. Every table across all systems.' },
    { label: 'Cloudflare',           node_type: 'Tool',     status: 'Active',   description: 'Hosting + Workers + KV cache.' },
    { label: 'Cloudinary',           node_type: 'Tool',     status: 'Active',   description: 'Media management across systems.' },
    { label: 'Canva',                node_type: 'Tool',     status: 'Active',   description: 'Design and content creation.' },
    { label: 'FreeCAD',              node_type: 'Tool',     status: 'Active',   description: '3D design tool for hardware projects.' },
    { label: 'P&L Generator',        node_type: 'Tool',     status: 'Active',   description: 'Built-in Chaijohn OS module.' },
    { label: 'Social Content Generator', node_type: 'Tool', status: 'Idea',     description: 'Future tool for content automation.' },
    // People
    { label: 'Kyle',   node_type: 'People', status: 'Active', description: 'Snail time China. Key China connection.' },
    { label: 'K.Nok',  node_type: 'People', status: 'Active', description: 'Pilates trainer. Introduced owner to pilates business.' },
    { label: 'Scott',  node_type: 'People', status: 'Active', description: 'Adjust Body China. 4 years later became Thailand representative.' },
    { label: 'Choo',   node_type: 'People', status: 'Active', description: 'Candy Land Arcade. Claw machine partner.' },
    { label: 'BeiBei', node_type: 'People', status: 'Active', description: 'Doll factory China. Claw machine supply.' },
    { label: 'Zack',   node_type: 'People', status: 'Active', description: 'Coffee capsule machine maker.' },
    { label: 'Andy',   node_type: 'People', status: 'Active', description: 'Coffee capsule machine maker.' },
    { label: 'K.Been', node_type: 'People', status: 'Active', description: 'Pilates studio owner. Gym owner. Potential buggy land partner.' },
    { label: 'Dalibor',node_type: 'People', status: 'Active', description: 'Croatian knife maker. Great friend. Helped acquire 30M THB collection.' },
    { label: 'Fune',   node_type: 'People', status: 'Active', description: 'Sanit Sport Fitness owner. Gym owner. Claw machine buyer.' },
    { label: 'Stefan', node_type: 'People', status: 'Active', description: 'Old friend Germany.' },
    { label: 'Mr.Z',   node_type: 'People', status: 'Active', description: 'Buggy cart supplier China.' },
    { label: 'Mr.Y',   node_type: 'People', status: 'Active', description: 'Plant pot supplier China. Son of biggest potting material manufacturer.' },
    { label: 'Ting',   node_type: 'People', status: 'Active', description: 'Great electrician. Trusted builder network.' },
    { label: 'LungLek',node_type: 'People', status: 'Active', description: 'Trusted construction builder.' },
    { label: 'Fluke',  node_type: 'People', status: 'Active', description: 'Wood and steel welder.' },
    { label: 'KimSu',  node_type: 'People', status: 'Active', description: 'Aluminum stainless fabricator.' },
    { label: 'Bar',    node_type: 'People', status: 'Active', description: 'Great machinist.' },
    { label: 'Pun',    node_type: 'People', status: 'Active', description: 'Craft beer sales.' },
    { label: 'Not',    node_type: 'People', status: 'Active', description: 'Former colleague. Beer making expert.' },
    // Skills
    { label: 'Prompt Engineering',   node_type: 'Skill', status: 'Active', description: '10 weeks. Core capability enabling all AI projects.' },
    { label: 'System Design',        node_type: 'Skill', status: 'Active', description: 'Cloudflare + Airtable + API architecture.' },
    { label: 'Operations Director',  node_type: 'Skill', status: 'Active', description: 'Multi-site operation management.' },
    { label: 'Plant Manager',        node_type: 'Skill', status: 'Active', description: 'Factory and production management.' },
    { label: 'Supplier Development', node_type: 'Skill', status: 'Active', description: 'Global supplier sourcing and development.' },
    { label: 'Supply Chain Director',node_type: 'Skill', status: 'Active', description: 'End-to-end supply chain management.' },
    { label: 'Import Export',        node_type: 'Skill', status: 'Active', description: 'Deep knowledge from Hammer Strength episode. Rules and discipline.' },
    // Resources
    { label: 'Surf/Skate Collection',node_type: 'Resource', status: 'Active', description: 'Boards over 1M THB value.' },
    { label: '40 Claw Machines',     node_type: 'Resource', status: 'Active', description: 'Full claw machine fleet. Daje Queencatcher operation.' },
    { label: 'Warehouse Borwin',     node_type: 'Resource', status: 'Active', description: 'Rental warehouse for operations.' },
    { label: 'Knife Collection',     node_type: 'Resource', status: 'Active', description: 'Premium knives. Dalibor connection. Famous in Thailand.' },
    { label: 'Agave Plants',         node_type: 'Resource', status: 'Active', description: 'Large agave collection.' },
    { label: 'Bromeliad Plants',     node_type: 'Resource', status: 'Active', description: 'Import from Florida. Friend network led to this.' },
    { label: 'EDC Collection',       node_type: 'Resource', status: 'Active', description: 'Every day carry tools collection.' },
    { label: 'Steelflame Collection',node_type: 'Resource', status: 'Active', description: 'Premium lighter collection.' },
    { label: 'Vintage Tools',        node_type: 'Resource', status: 'Active', description: 'Bench vices USA/UK/Europe. Vintage tool collection.' },
    { label: 'Weird Dolls',          node_type: 'Resource', status: 'Active', description: 'Sigikid and weird doll collection.' }
  ];

  const SEED_EDGES = [
    { from: 'Janis Flow',            to: 'I-Flex Pilates',        edge_type: 'led_to',      label: 'SUP yoga → discovered pilates',  strength: 2 },
    { from: 'K.Nok',                 to: 'I-Flex Pilates',        edge_type: 'led_to',      label: 'asked to order pilates',          strength: 3 },
    { from: 'K.Been',                to: 'I-Flex Pilates',        edge_type: 'supports',    label: 'studio owner relationship',       strength: 2 },
    { from: 'Scott',                 to: 'I-Flex Pilates',        edge_type: 'supports',    label: 'Thailand representative',         strength: 2 },
    { from: 'Prompt Engineering',    to: 'Chaijohn OS',           edge_type: 'enables',     label: 'core build skill',                strength: 3 },
    { from: 'Prompt Engineering',    to: 'Janis OS Dashboard',    edge_type: 'enables',     label: 'core build skill',                strength: 3 },
    { from: 'Claude AI',             to: 'Chaijohn OS',           edge_type: 'supports',    label: 'built with',                      strength: 3 },
    { from: 'Claude AI',             to: 'Janis OS Dashboard',    edge_type: 'supports',    label: 'built with',                      strength: 2 },
    { from: 'Airtable',              to: 'Chaijohn OS',           edge_type: 'supports',    label: 'all data',                        strength: 3 },
    { from: 'Cloudflare',            to: 'Chaijohn OS',           edge_type: 'supports',    label: 'hosting',                         strength: 3 },
    { from: 'Dalibor',               to: 'Knife Collection',      edge_type: 'supports',    label: 'acquisition partner',             strength: 3 },
    { from: 'Choo',                  to: 'Daje Queencatcher',     edge_type: 'supports',    label: 'arcade partner',                  strength: 3 },
    { from: 'BeiBei',                to: 'Daje Queencatcher',     edge_type: 'supports',    label: 'doll supply',                     strength: 2 },
    { from: 'Fune',                  to: 'Daje Queencatcher',     edge_type: 'supports',    label: 'claw machine buyer',              strength: 2 },
    { from: 'K.Been',                to: 'Daje Queencatcher',     edge_type: 'supports',    label: 'bought claw machine',             strength: 1 },
    { from: 'Not',                   to: 'Craft Beer Vending System', edge_type: 'inspired_by', label: 'beer making expertise',       strength: 2 },
    { from: 'Pun',                   to: 'Craft Beer Vending System', edge_type: 'supports',    label: 'craft beer sales',            strength: 2 },
    { from: 'Mr.Z',                  to: 'Off Road Buggy Import', edge_type: 'supports',    label: 'buggy supplier China',            strength: 2 },
    { from: 'Mr.Y',                  to: 'Plant Pot Import China',edge_type: 'supports',    label: 'pot supplier China',              strength: 2 },
    { from: 'K.Been',                to: 'Off Road Buggy Import', edge_type: 'supports',    label: 'potential land for buggy',        strength: 1 },
    { from: 'Zack',                  to: 'Jade Coffee Capsule',   edge_type: 'supports',    label: 'machine maker',                   strength: 2 },
    { from: 'Andy',                  to: 'Jade Coffee Capsule',   edge_type: 'supports',    label: 'machine maker',                   strength: 2 },
    { from: 'Import Export',         to: 'Satu 1.0',              edge_type: 'enables',     label: 'hardware import knowledge',       strength: 2 },
    { from: 'Supply Chain Director', to: 'Satu 1.0',              edge_type: 'enables',     label: 'supply chain expertise',          strength: 2 },
    { from: 'Supplier Development',  to: 'Daje Queencatcher',     edge_type: 'enables',     label: 'China supplier network',          strength: 2 },
    { from: '40 Claw Machines',      to: 'Daje Queencatcher',     edge_type: 'funds',       label: 'primary asset',                   strength: 3 },
    { from: 'Warehouse Borwin',      to: 'Daje Queencatcher',     edge_type: 'supports',    label: 'operations base',                 strength: 2 },
    { from: 'Knife Collection',      to: 'Dalibor',               edge_type: 'led_to',      label: 'collector community',             strength: 2 },
    { from: 'Bromeliad Plants',      to: 'Agave Plants',          edge_type: 'inspired_by', label: 'plant passion expanded',          strength: 1 },
    { from: 'Surf/Skate Collection', to: 'Janis Flow',            edge_type: 'supports',    label: 'core inventory',                  strength: 3 },
    { from: 'Chaijohn OS',           to: 'Airtable',              edge_type: 'requires',    label: 'data layer',                      strength: 3 },
    { from: 'Chaijohn OS',           to: 'Cloudflare',            edge_type: 'requires',    label: 'infrastructure',                  strength: 3 },
    { from: 'Chaijohn OS',           to: 'Cloudinary',            edge_type: 'uses',        label: 'media',                           strength: 2 },
    { from: 'Chaijohn OS',           to: 'Claude AI',             edge_type: 'uses',        label: 'AI agent',                        strength: 3 },
    { from: 'Satu 1.0',             to: 'Satu Backend',           edge_type: 'requires',    label: 'backend system',                  strength: 3 }
  ];

  // ── Load data ─────────────────────────────────────────────────────────────
  async function loadData() {
    const [nr, er] = await Promise.allSettled([
      fetch('/api/mindmap-nodes').then(r => r.json()),
      fetch('/api/mindmap-edges').then(r => r.json())
    ]);
    nodes = nr.status === 'fulfilled' ? (nr.value.records || []) : [];
    edges = er.status === 'fulfilled' ? (er.value.records || []) : [];
  }

  async function seedData() {
    setStatus('Seeding your network…');
    const labelToId = {};

    for (const n of SEED_NODES) {
      try {
        const res  = await fetch('/api/mindmap-nodes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n) });
        const data = await res.json();
        if (data.record) { labelToId[n.label] = data.record.id; nodes.push(data.record); }
      } catch {}
    }

    for (const e of SEED_EDGES) {
      const fromId = labelToId[e.from];
      const toId   = labelToId[e.to];
      if (!fromId || !toId) continue;
      try {
        const res  = await fetch('/api/mindmap-edges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from_id: fromId, to_id: toId, edge_type: e.edge_type, label: e.label, strength: e.strength }) });
        const data = await res.json();
        if (data.record) edges.push(data.record);
      } catch {}
    }
    setStatus('');
  }

  // ── Canvas height ─────────────────────────────────────────────────────────
  function getCanvasHeight() {
    return Math.max(500, window.innerHeight - 180);
  }

  // ── Force simulation ──────────────────────────────────────────────────────
  function initPositions(w, h, visibleNodes) {
    // Single circle layout — even distribution, preserves existing positions
    const cx     = w / 2;
    const cy     = h / 2;
    const radius = Math.min(w, h) * 0.35;
    visibleNodes.forEach((n, i) => {
      if (n.x !== undefined) return; // keep existing position
      const angle = (2 * Math.PI * i) / visibleNodes.length;
      n.x  = cx + radius * Math.cos(angle);
      n.y  = cy + radius * Math.sin(angle);
      n.vx = 0; n.vy = 0;
    });
  }

  function runSimulation(visibleNodes, visibleEdges, ticks) {
    if (!visibleNodes.length) return;
    const c = canvas();
    if (!c) return;
    const W = c.offsetWidth || 800;
    const H = c.offsetHeight || getCanvasHeight();

    initPositions(W, H, visibleNodes);

    const nodeMap = Object.fromEntries(visibleNodes.map(n => [n.id, n]));
    const pad = 40;

    for (let t = 0; t < ticks; t++) {
      const alpha = 1 - t / ticks;

      // Repulsion — skip velocity on pinned nodes
      for (let i = 0; i < visibleNodes.length; i++) {
        for (let j = i + 1; j < visibleNodes.length; j++) {
          const a = visibleNodes[i], b = visibleNodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (-12000 / (dist * dist)) * alpha;
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          if (!a.pinned) { a.vx += fx; a.vy += fy; }
          if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
        }
      }

      // Attraction along edges — skip pinned
      for (const e of visibleEdges) {
        const a = nodeMap[e.from_id], b = nodeMap[e.to_id];
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const str  = (e.strength || 2) * 0.04 * alpha;
        if (!a.pinned) { a.vx += (dx / dist) * str * dist * 0.01; a.vy += (dy / dist) * str * dist * 0.01; }
        if (!b.pinned) { b.vx -= (dx / dist) * str * dist * 0.01; b.vy -= (dy / dist) * str * dist * 0.01; }
      }

      // Center gravity — skip pinned
      for (const n of visibleNodes) {
        if (n.pinned) continue;
        n.vx += (W / 2 - n.x) * 0.004 * alpha;
        n.vy += (H / 2 - n.y) * 0.004 * alpha;
      }

      // Apply velocity — skip pinned
      for (const n of visibleNodes) {
        if (n.pinned) continue;
        n.vx *= 0.78; n.vy *= 0.78;
        n.x  += n.vx; n.y  += n.vy;
        n.x   = Math.max(pad, Math.min(W - pad, n.x));
        n.y   = Math.max(pad, Math.min(H - pad, n.y));
      }
    }
  }

  // ── Connected node IDs (all edges, not just visible) ──────────────────────
  function getEdgeConnectedIds() {
    const ids = new Set();
    edges.forEach(e => { ids.add(e.from_id); ids.add(e.to_id); });
    return ids;
  }

  // ── Render canvas ─────────────────────────────────────────────────────────
  function getVisibleNodes() {
    let vis = nodes;
    if (filterType !== 'all') vis = vis.filter(n => n.node_type === filterType);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      vis = vis.filter(n => (n.label||'').toLowerCase().includes(s) || (n.tags||'').toLowerCase().includes(s));
    }
    return vis;
  }

  function getVisibleEdges(visibleNodeIds) {
    return edges.filter(e => visibleNodeIds.has(e.from_id) && visibleNodeIds.has(e.to_id));
  }

  function renderCanvas() {
    const c = canvas();
    if (!c) return;
    const ctx  = c.getContext('2d');
    const W    = c.width;
    const H    = c.height;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    const visNodes        = getVisibleNodes();
    const visNodeIds      = new Set(visNodes.map(n => n.id));
    const visEdges        = getVisibleEdges(visNodeIds);
    const nodeMap         = Object.fromEntries(visNodes.map(n => [n.id, n]));
    const edgeConnectedIds = getEdgeConnectedIds();

    // Connected node IDs for selected node
    const connectedIds = new Set();
    if (selectedNode) {
      visEdges.forEach(e => {
        if (e.from_id === selectedNode.id) connectedIds.add(e.to_id);
        if (e.to_id   === selectedNode.id) connectedIds.add(e.from_id);
      });
    }

    // Draw edges
    for (const e of visEdges) {
      const a = nodeMap[e.from_id], b = nodeMap[e.to_id];
      if (!a || !b || a.x == null || b.x == null) continue;

      const isHighlighted = selectedNode && (e.from_id === selectedNode.id || e.to_id === selectedNode.id);
      const str = e.strength || 2;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = isHighlighted ? 'rgba(200,200,220,0.5)' : 'rgba(200,200,220,0.1)';
      ctx.lineWidth   = isHighlighted ? str * 1.5 : str * 0.8;
      ctx.stroke();

      // Edge label on highlighted
      if (isHighlighted && e.label) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(200,200,220,0.55)';
        ctx.textAlign = 'center';
        ctx.fillText(e.label, mx, my - 4);
      }
    }

    // Draw nodes
    for (const n of visNodes) {
      if (n.x == null) continue;
      const baseR         = NODE_RADIUS[n.node_type] || 13;
      const r             = baseR + (n.id === selectedNode?.id ? 4 : 0);
      const color         = NODE_COLORS[n.node_type] || '#6b7280';
      const isDimmed      = selectedNode && n.id !== selectedNode.id && !connectedIds.has(n.id);
      const isDisconnected = !edgeConnectedIds.has(n.id);

      ctx.globalAlpha = isDimmed ? 0.2 : (isDisconnected ? 0.7 : 1);

      // Shadow glow for selected
      if (n.id === selectedNode?.id) {
        ctx.shadowColor = color;
        ctx.shadowBlur  = 18;
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.shadowBlur = 0;

      // Dashed ring for disconnected nodes
      if (isDisconnected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // White ring for selected
      if (n.id === selectedNode?.id) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }

      // Pin indicator — yellow dot at top-right
      if (n.pinned) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(n.x + r * 0.7, n.y - r * 0.7, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#f5c518';
        ctx.fill();
      }

      // Label: show when baseR >= 13 OR node is selected/connected; truncate to 12 chars
      const isHighlightedNode = n.id === selectedNode?.id || connectedIds.has(n.id);
      const showLabel = baseR >= 13 || isHighlightedNode;
      if (showLabel) {
        const label    = (n.label || '').slice(0, 12);
        const fontSize = Math.max(8, baseR * 0.55);
        ctx.globalAlpha = isDimmed ? 0.15 : (isDisconnected ? 0.55 : 0.75);
        ctx.font      = `${fontSize}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,1)';
        ctx.textAlign = 'center';
        ctx.fillText(label, n.x, n.y + r + fontSize + 2);
      }

      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function resizeCanvas() {
    const c = canvas();
    if (!c) return;
    const wrap = c.parentElement;
    const h = getCanvasHeight();
    wrap.style.height = h + 'px';
    c.width  = wrap.clientWidth  || 800;
    c.height = h;
  }

  // ── Detail panel ──────────────────────────────────────────────────────────
  function renderDetail() {
    const detail = document.getElementById('mm-detail');
    if (!detail) return;
    if (!selectedNode) {
      detail.classList.remove('open');
      return;
    }
    detail.classList.add('open');

    const connEdges = edges.filter(e => e.from_id === selectedNode.id || e.to_id === selectedNode.id);
    const nodeMap   = Object.fromEntries(nodes.map(n => [n.id, n]));

    const connHtml = connEdges.map(e => {
      const other = nodeMap[e.from_id === selectedNode.id ? e.to_id : e.from_id];
      if (!other) return '';
      const dot = `<span style="width:8px;height:8px;border-radius:50%;background:${NODE_COLORS[other.node_type]||'#666'};flex-shrink:0;display:inline-block"></span>`;
      const dir = e.from_id === selectedNode.id ? '→' : '←';
      return `<li class="mm-conn-item" data-nav-node="${other.id}">${dot}<span style="flex:1">${other.label}</span><span class="mm-conn-type">${dir} ${e.edge_type}</span></li>`;
    }).filter(Boolean).join('');

    const color   = NODE_COLORS[selectedNode.node_type] || '#6b7280';
    const stColor = selectedNode.status === 'Active' ? 'var(--green)' : selectedNode.status === 'Idea' ? 'var(--yellow)' : 'var(--text-dim)';
    const pinNote = selectedNode.pinned ? '<div style="font-family:var(--font-mono);font-size:0.62rem;color:#f5c518">📌 Pinned — double-click to unpin</div>' : '';

    detail.innerHTML = `
      <div class="mm-detail-label">${selectedNode.label || '—'}</div>
      <div style="display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap">
        <span class="mm-badge" style="background:${color}20;color:${color}">${selectedNode.node_type || '—'}</span>
        <span class="mm-badge" style="background:transparent;border:1px solid ${stColor};color:${stColor}">${selectedNode.status || '—'}</span>
      </div>
      ${pinNote}
      ${selectedNode.description ? `<div class="mm-detail-desc">${selectedNode.description}</div>` : ''}
      ${selectedNode.tags ? `<div class="mm-detail-tags">🏷 ${selectedNode.tags}</div>` : ''}
      ${selectedNode.context ? `<div class="mm-detail-ctx">${selectedNode.context}</div>` : ''}
      ${connEdges.length ? `<div class="mm-detail-sec">Connections (${connEdges.length})</div><ul class="mm-conn-list">${connHtml}</ul>` : '<div class="mm-detail-sec">No connections yet</div>'}
      <div class="mm-detail-btns">
        <button type="button" class="mm-btn" id="mm-edit-node">Edit</button>
        <button type="button" class="mm-btn" id="mm-add-conn">+ Connect</button>
        <button type="button" class="mm-del-btn" id="mm-del-node">Delete</button>
      </div>`;
  }

  // ── Status bar ────────────────────────────────────────────────────────────
  function setStatus(msg) {
    const el = document.getElementById('mm-status');
    if (el) el.textContent = msg;
  }

  // ── Tooltip helper ────────────────────────────────────────────────────────
  function showTooltip(x, y, msg) {
    const tt = document.getElementById('mm-tooltip');
    if (!tt) return;
    tt.textContent = msg;
    tt.style.left    = (x + 14) + 'px';
    tt.style.top     = (y - 10) + 'px';
    tt.style.display = 'block';
  }
  function hideTooltip() {
    const tt = document.getElementById('mm-tooltip');
    if (tt) tt.style.display = 'none';
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function renderAll() {
    const visNodes = getVisibleNodes();
    const visIds   = new Set(visNodes.map(n => n.id));
    const visEdges = getVisibleEdges(visIds);
    resizeCanvas();
    runSimulation(visNodes, visEdges, 500);
    renderCanvas();
    renderDetail();
    updatePills();
    setStatus(`${visNodes.length} nodes · ${visEdges.length} edges`);
  }

  function updatePills() {
    document.querySelectorAll('.mm-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.type === filterType);
    });
  }

  // ── Panel HTML ────────────────────────────────────────────────────────────
  function buildPanel() {
    const p = panel();
    if (!p) return;
    const pillsHtml = ['all', ...NODE_TYPES].map(t =>
      `<button type="button" class="mm-pill${t === filterType ? ' active' : ''}" data-type="${t}">${t === 'all' ? 'All' : t}</button>`
    ).join('');

    p.innerHTML = `<div class="mm-wrap">
      <div class="mm-header">
        <div>
          <div class="mm-title">Mind Map</div>
          <div class="mm-subtitle">// your world · connections · now</div>
        </div>
        <div class="mm-header-btns">
          <button type="button" class="mm-btn mm-btn-primary" id="mm-add-node-btn">+ Add Node</button>
          <button type="button" class="mm-btn" id="mm-reload-btn">⟳ Reload</button>
        </div>
      </div>
      <div class="mm-toolbar">
        <input type="text" class="mm-search" id="mm-search" placeholder="Search nodes…" value="${searchTerm}">
        <div class="mm-filter-pills">${pillsHtml}</div>
      </div>
      <div class="mm-body">
        <div class="mm-canvas-wrap" id="mm-canvas-wrap">
          <canvas id="mm-canvas"></canvas>
          <div class="mm-hint">Drag nodes · Pan canvas · Scroll to zoom · Dbl-click to edit</div>
          <div class="mm-tooltip" id="mm-tooltip"></div>
        </div>
        <div class="mm-detail" id="mm-detail"></div>
      </div>
      <div class="mm-status-bar" id="mm-status"></div>
    </div>`;

    wireCanvasEvents();
    wirePanelEvents();
  }

  // ── Canvas interaction ────────────────────────────────────────────────────
  function nodeAt(canvasX, canvasY) {
    const wx = (canvasX - transform.x) / transform.scale;
    const wy = (canvasY - transform.y) / transform.scale;
    const vis = getVisibleNodes();
    for (let i = vis.length - 1; i >= 0; i--) {
      const n = vis[i];
      if (n.x == null) continue;
      const r = (NODE_RADIUS[n.node_type] || 13) + 4;
      if ((n.x - wx) ** 2 + (n.y - wy) ** 2 <= r * r) return n;
    }
    return null;
  }

  function wireCanvasEvents() {
    const c = canvas();
    if (!c) return;

    resizeCanvas();

    let drag = null, lastClick = 0;

    c.addEventListener('mousedown', e => {
      const rect = c.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;
      const hit  = nodeAt(cx, cy);

      if (hit) {
        // Prepare for potential node drag — do NOT pin yet, wait for movement
        const wx = (cx - transform.x) / transform.scale;
        const wy = (cy - transform.y) / transform.scale;
        dragNode        = hit;
        dragOffset      = { x: hit.x - wx, y: hit.y - wy };
        dragMoved       = false;
        dragStartClient = { x: e.clientX, y: e.clientY };
        e.stopPropagation();
      } else {
        // Start canvas pan
        drag = { startX: e.clientX, startY: e.clientY, tx: transform.x, ty: transform.y, moved: false };
      }
    });

    c.addEventListener('mousemove', e => {
      const rect = c.getBoundingClientRect();
      const cx   = e.clientX - rect.left;
      const cy   = e.clientY - rect.top;

      if (dragNode) {
        // Commit to drag only after moving > 3px
        const dxC = e.clientX - dragStartClient.x;
        const dyC = e.clientY - dragStartClient.y;
        if (!dragMoved && (Math.abs(dxC) > 3 || Math.abs(dyC) > 3)) {
          dragMoved        = true;
          dragNode.pinned  = true;
          dragNode.vx      = 0; dragNode.vy = 0;
          c.style.cursor   = 'grabbing';
        }
        if (dragMoved) {
          const wx = (cx - transform.x) / transform.scale;
          const wy = (cy - transform.y) / transform.scale;
          dragNode.x  = wx + dragOffset.x;
          dragNode.y  = wy + dragOffset.y;
          dragNode.vx = 0; dragNode.vy = 0;
          hideTooltip();
          renderCanvas();
        }
        return;
      }

      if (drag) {
        const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
        transform.x = drag.tx + dx;
        transform.y = drag.ty + dy;
        hideTooltip();
        renderCanvas();
        return;
      }

      // Tooltip for disconnected nodes on hover
      const hovered = nodeAt(cx, cy);
      if (hovered && !getEdgeConnectedIds().has(hovered.id)) {
        showTooltip(cx, cy, 'No connections yet — use Add Connection to link this node');
      } else {
        hideTooltip();
      }
    });

    c.addEventListener('mouseup', e => {
      if (dragNode) {
        const node     = dragNode;
        const wasDragged = dragMoved;
        dragNode  = null;
        dragMoved = false;
        c.style.cursor = 'grab';

        if (!wasDragged) {
          // Treat as click/double-click — no movement occurred
          const rect = c.getBoundingClientRect();
          const cx   = e.clientX - rect.left, cy = e.clientY - rect.top;
          const now  = Date.now();
          if (now - lastClick < 350) {
            // Double-click: unpin if pinned, else open edit modal
            if (node.pinned) {
              node.pinned = false;
              renderCanvas();
              renderDetail();
            } else {
              openEditModal(node);
            }
          } else {
            // Single click: select/deselect
            selectedNode = selectedNode?.id === node.id ? null : node;
            renderCanvas();
            renderDetail();
          }
          lastClick = now;
        }
        return;
      }

      if (!drag) return;
      if (!drag.moved) {
        const rect = c.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
        const hit = nodeAt(cx, cy);
        const now = Date.now();
        if (hit) {
          // Shouldn't reach here normally (node hits handled above) but guard anyway
          selectedNode = selectedNode?.id === hit.id ? null : hit;
          renderCanvas();
          renderDetail();
        } else {
          selectedNode = null;
          renderCanvas();
          renderDetail();
        }
        lastClick = now;
      }
      drag = null;
    });

    c.addEventListener('mouseleave', () => { hideTooltip(); });

    c.addEventListener('wheel', e => {
      e.preventDefault();
      const rect  = c.getBoundingClientRect();
      const mx    = e.clientX - rect.left;
      const my    = e.clientY - rect.top;
      const delta = e.deltaY < 0 ? 1.1 : 0.91;
      transform.x = mx + (transform.x - mx) * delta;
      transform.y = my + (transform.y - my) * delta;
      transform.scale = Math.max(0.15, Math.min(4, transform.scale * delta));
      renderCanvas();
    }, { passive: false });

    // Touch pan
    let touch0 = null;
    c.addEventListener('touchstart', e => {
      if (e.touches.length === 1) touch0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: transform.x, ty: transform.y };
    }, { passive: true });
    c.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && touch0) {
        transform.x = touch0.tx + (e.touches[0].clientX - touch0.x);
        transform.y = touch0.ty + (e.touches[0].clientY - touch0.y);
        renderCanvas();
      }
    }, { passive: true });
    c.addEventListener('touchend', () => { touch0 = null; });

    window.addEventListener('resize', () => {
      const wrap = c.parentElement;
      const h = getCanvasHeight();
      wrap.style.height = h + 'px';
      c.width  = wrap.clientWidth || 800;
      c.height = h;
      renderCanvas();
    });
  }

  function wirePanelEvents() {
    const p = panel();
    if (!p || p._mmWired) return;
    p._mmWired = true;

    p.addEventListener('click', async function (e) {
      const t = e.target;

      // Type filter pills
      if (t.dataset.type !== undefined) {
        filterType = t.dataset.type;
        selectedNode = null;
        renderAll();
        return;
      }

      // Add node
      if (t.id === 'mm-add-node-btn') { openAddNodeModal(); return; }

      // Reload
      if (t.id === 'mm-reload-btn') { await loadAndRender(); return; }

      // Detail panel: navigate to connected node
      const navId = t.dataset.navNode || t.closest('[data-nav-node]')?.dataset.navNode;
      if (navId) {
        selectedNode = nodes.find(n => n.id === navId) || null;
        renderCanvas();
        renderDetail();
        return;
      }

      // Edit node from detail
      if (t.id === 'mm-edit-node' && selectedNode) { openEditModal(selectedNode); return; }

      // Add connection from detail
      if (t.id === 'mm-add-conn' && selectedNode) { openAddConnModal(selectedNode); return; }

      // Delete node from detail
      if (t.id === 'mm-del-node' && selectedNode) {
        if (!confirm(`Delete "${selectedNode.label}" and all its connections? This cannot be undone.`)) return;
        const id = selectedNode.id;
        selectedNode = null;
        try {
          await fetch(`/api/mindmap-nodes/${id}`, { method: 'DELETE' });
          nodes = nodes.filter(n => n.id !== id);
          edges = edges.filter(e => e.from_id !== id && e.to_id !== id);
          renderAll();
        } catch {}
        return;
      }
    });

    // Search
    p.addEventListener('input', e => {
      if (e.target.id === 'mm-search') {
        searchTerm = e.target.value;
        selectedNode = null;
        renderAll();
      }
    });
  }

  // ── Modals ────────────────────────────────────────────────────────────────
  function openAddNodeModal() {
    const modal = buildModal('Add Node', `
      <label>Label *</label><input type="text" id="mm-m-label" autofocus>
      <label>Type *</label>
      <select id="mm-m-type">${NODE_TYPES.map(t=>`<option>${t}</option>`).join('')}</select>
      <label>Status</label>
      <select id="mm-m-status"><option>Active</option><option>Paused</option><option>Archived</option><option>Idea</option></select>
      <label>Description</label><textarea id="mm-m-desc" rows="2"></textarea>
      <label>Tags (comma separated)</label><input type="text" id="mm-m-tags">
      <label>Context (AI-readable)</label><textarea id="mm-m-ctx" rows="2"></textarea>
      <label>URL</label><input type="text" id="mm-m-url">
    `, async (overlay) => {
      const label     = document.getElementById('mm-m-label')?.value.trim();
      const node_type = document.getElementById('mm-m-type')?.value;
      if (!label || !node_type) { alert('Label and Type are required.'); return false; }
      const body = { label, node_type,
        status:      document.getElementById('mm-m-status')?.value || 'Active',
        description: document.getElementById('mm-m-desc')?.value.trim(),
        tags:        document.getElementById('mm-m-tags')?.value.trim(),
        context:     document.getElementById('mm-m-ctx')?.value.trim(),
        url:         document.getElementById('mm-m-url')?.value.trim()
      };
      const res  = await fetch('/api/mindmap-nodes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.record) {
        nodes.push(data.record);
        selectedNode = data.record;
        renderAll();
      }
      return true;
    });
    document.body.appendChild(modal);
  }

  function openEditModal(node) {
    const modal = buildModal('Edit Node', `
      <label>Label</label><input type="text" id="mm-m-label" value="${esc(node.label)}">
      <label>Type</label>
      <select id="mm-m-type">${NODE_TYPES.map(t=>`<option ${t===node.node_type?'selected':''}>${t}</option>`).join('')}</select>
      <label>Status</label>
      <select id="mm-m-status">${['Active','Paused','Archived','Idea'].map(s=>`<option ${s===node.status?'selected':''}>${s}</option>`).join('')}</select>
      <label>Description</label><textarea id="mm-m-desc" rows="2">${esc(node.description||'')}</textarea>
      <label>Tags</label><input type="text" id="mm-m-tags" value="${esc(node.tags||'')}">
      <label>Context</label><textarea id="mm-m-ctx" rows="2">${esc(node.context||'')}</textarea>
      <label>URL</label><input type="text" id="mm-m-url" value="${esc(node.url||'')}">
    `, async () => {
      const body = {
        label:       document.getElementById('mm-m-label')?.value.trim(),
        node_type:   document.getElementById('mm-m-type')?.value,
        status:      document.getElementById('mm-m-status')?.value,
        description: document.getElementById('mm-m-desc')?.value.trim(),
        tags:        document.getElementById('mm-m-tags')?.value.trim(),
        context:     document.getElementById('mm-m-ctx')?.value.trim(),
        url:         document.getElementById('mm-m-url')?.value.trim()
      };
      if (!body.label) { alert('Label is required.'); return false; }
      const res  = await fetch(`/api/mindmap-nodes/${node.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.record) {
        const idx = nodes.findIndex(n => n.id === node.id);
        if (idx >= 0) nodes[idx] = data.record;
        selectedNode = data.record;
        renderCanvas();
        renderDetail();
      }
      return true;
    });
    document.body.appendChild(modal);
  }

  function openAddConnModal(fromNode) {
    const others = nodes.filter(n => n.id !== fromNode.id);
    const EDGE_TYPES = ['uses','funds','spawned','inspired_by','requires','knows','failed_to','led_to','supports','enables'];
    const modal = buildModal('Add Connection', `
      <label>Connect to *</label>
      <select id="mm-m-conn-to">${others.map(n=>`<option value="${n.id}">${n.label} (${n.node_type})</option>`).join('')}</select>
      <label>Edge type *</label>
      <select id="mm-m-conn-type">${EDGE_TYPES.map(t=>`<option>${t}</option>`).join('')}</select>
      <label>Label</label><input type="text" id="mm-m-conn-label" placeholder="e.g. built with">
      <label>Strength (1=weak, 2=normal, 3=strong)</label>
      <select id="mm-m-conn-str"><option value="1">1 — weak</option><option value="2" selected>2 — normal</option><option value="3">3 — strong</option></select>
    `, async () => {
      const to_id     = document.getElementById('mm-m-conn-to')?.value;
      const edge_type = document.getElementById('mm-m-conn-type')?.value;
      if (!to_id || !edge_type) return false;
      const body = { from_id: fromNode.id, to_id, edge_type,
        label:    document.getElementById('mm-m-conn-label')?.value.trim(),
        strength: Number(document.getElementById('mm-m-conn-str')?.value) || 2
      };
      const res  = await fetch('/api/mindmap-edges', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.record) {
        edges.push(data.record);
        renderCanvas();
        renderDetail();
      }
      return true;
    });
    document.body.appendChild(modal);
  }

  function buildModal(title, bodyHtml, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'mm-modal-overlay';
    overlay.innerHTML = `<div class="mm-modal">
      <h3>${title}</h3>
      ${bodyHtml}
      <div class="mm-modal-btns">
        <button type="button" class="mm-btn mm-btn-primary" id="mm-modal-save">Save</button>
        <button type="button" class="mm-btn" id="mm-modal-cancel">Cancel</button>
      </div>
    </div>`;

    overlay.addEventListener('click', async e => {
      if (e.target === overlay || e.target.id === 'mm-modal-cancel') { overlay.remove(); return; }
      if (e.target.id === 'mm-modal-save') {
        e.target.disabled = true; e.target.textContent = 'Saving…';
        try {
          const ok = await onSave(overlay);
          if (ok !== false) overlay.remove();
          else { e.target.disabled = false; e.target.textContent = 'Save'; }
        } catch (err) {
          console.error(err);
          e.target.disabled = false; e.target.textContent = 'Save';
        }
      }
    });
    return overlay;
  }

  function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // ── Load + render ─────────────────────────────────────────────────────────
  async function loadAndRender() {
    const p = panel();
    if (!p) return;
    buildPanel();
    setStatus('Loading…');
    await loadData();
    if (nodes.length === 0) await seedData();
    initialized = true;
    renderAll();
  }

  function init() {
    ensureStyles();

    window.addEventListener('panelactivated', e => {
      if (e.detail !== 'mindmap') return;
      loadAndRender();
    });

    const p = panel();
    if (p && p.classList.contains('active')) loadAndRender();
  }

  init();
})();
