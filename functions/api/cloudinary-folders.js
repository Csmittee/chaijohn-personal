// functions/api/cloudinary-folders.js
// GET /api/cloudinary-folders              → list groups (subfolders of Personal/Collections)
// GET /api/cloudinary-folders?group=Vice   → list items (subfolders of Personal/Collections/Vice)
// GET /api/cloudinary-folders?item=path    → list images inside one item folder

import { jsonResponse, errorResponse } from '../_airtable.js';

const CLOUD_NAME = 'dfiomi0lb';
const BASE_PATH = 'Personal/Collections';

function getAuth(env) {
  return 'Basic ' + btoa(env.CLOUDINARY_API_KEY + ':' + env.CLOUDINARY_API_SECRET);
}

// List subfolders using Cloudinary Folders API (fast, no pagination needed)
async function listSubFolders(folderPath, auth) {
  const encoded = encodeURIComponent(folderPath);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/folders/${encoded}`,
    { headers: { 'Authorization': auth } }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Folder list failed (' + res.status + '): ' + err);
  }
  const data = await res.json();
  return (data.folders || []).map(function(f) {
    return { name: f.name, path: f.path };
  });
}

// Count images in a folder using search (just total_count, no resources needed)
async function countImages(folderPath, auth) {
  try {
    const body = {
      expression: 'public_id:' + folderPath + '/*',
      max_results: 1
    };
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/search`,
      {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return data.total_count || 0;
  } catch(e) { return 0; }
}

// Get all images inside one item folder (paginated, called only during import)
async function getItemImages(folderPath, auth) {
  const resources = [];
  let next_cursor = null;
  let page = 0;
  const MAX_PAGES = 20; // safety limit

  do {
    const body = {
      expression: 'public_id:' + folderPath + '/*',
      sort_by: [{ created_at: 'asc' }],
      max_results: 100,
      fields: ['public_id', 'secure_url', 'format', 'created_at']
    };
    if (next_cursor) body.next_cursor = next_cursor;

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/search`,
      {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) break;
    const data = await res.json();
    resources.push(...(data.resources || []));
    next_cursor = data.next_cursor || null;
    page++;

  } while (next_cursor && page < MAX_PAGES);

  return resources;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const group = url.searchParams.get('group');
  const item  = url.searchParams.get('item');
  const auth  = getAuth(env);

  try {
    if (item) {
      // Step 3 — get all images inside one item folder (called per item during import)
      const images = await getItemImages(item, auth);
      return jsonResponse({ images });

    } else if (group) {
      // Step 2 — list item subfolders inside a group using Folders API (fast, gets all 64)
      const groupPath = BASE_PATH + '/' + group;
      const subfolders = await listSubFolders(groupPath, auth);

      // Return items sorted by name — no image count needed here (saves time)
      const items = subfolders.map(function(f) {
        return { name: f.name, path: f.path, count: '?' };
      }).sort(function(a,b) { return a.name.localeCompare(b.name); });

      return jsonResponse({ items, total: items.length });

    } else {
      // Step 1 — list group subfolders inside Personal/Collections using Folders API
      const subfolders = await listSubFolders(BASE_PATH, auth);

      // For each group, count items (subfolders) — no image count to keep it fast
      const groups = await Promise.all(subfolders.map(async function(f) {
        try {
          const items = await listSubFolders(f.path, auth);
          return { name: f.name, itemCount: items.length };
        } catch(e) {
          return { name: f.name, itemCount: '?' };
        }
      }));

      return jsonResponse({ groups: groups.sort(function(a,b) { return a.name.localeCompare(b.name); }) });
    }

  } catch(err) {
    return errorResponse('cloudinary-folders: ' + err.message, 500);
  }
}
