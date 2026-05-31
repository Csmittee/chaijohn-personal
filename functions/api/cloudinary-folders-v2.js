// functions/api/cloudinary-folders.js
// GET /api/cloudinary-folders?group=Vice  → list items in group
// GET /api/cloudinary-folders?item=Personal/Collections/Vice/634 → list images in item
// GET /api/cloudinary-folders             → list groups only

import { jsonResponse, errorResponse } from '../_airtable.js';

const CLOUD_NAME = 'dfiomi0lb';
const BASE_PATH = 'Personal/Collections';

function getAuth(env) {
  return 'Basic ' + btoa(env.CLOUDINARY_API_KEY + ':' + env.CLOUDINARY_API_SECRET);
}

async function searchAll(expression, auth) {
  // Paginate through all results
  const resources = [];
  let next_cursor = null;

  do {
    const body = {
      expression,
      sort_by: [{ created_at: 'asc' }],
      max_results: 500,
      fields: ['public_id', 'secure_url', 'format', 'bytes', 'created_at', 'width', 'height']
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

    if (!res.ok) {
      const err = await res.text();
      throw new Error('Cloudinary search failed: ' + err);
    }

    const data = await res.json();
    resources.push(...(data.resources || []));
    next_cursor = data.next_cursor || null;

  } while (next_cursor);

  return resources;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const group = url.searchParams.get('group');   // e.g. "Vice"
  const item  = url.searchParams.get('item');    // e.g. "Personal/Collections/Vice/634"
  const auth  = getAuth(env);

  try {
    if (item) {
      // Step 3: list images inside one item folder
      const resources = await searchAll('public_id:' + item + '/*', auth);
      return jsonResponse({ images: resources });

    } else if (group) {
      // Step 2: list items inside one group folder
      const prefix = BASE_PATH + '/' + group;
      const resources = await searchAll('public_id:' + prefix + '/*', auth);

      // Group by parts[3] (item folder name)
      const itemMap = {};
      resources.forEach(function(r) {
        const parts = r.public_id.split('/');
        if (parts.length < 4) return; // skip loose files
        const itemName = parts[3];
        const itemPath = parts.slice(0, 4).join('/');
        if (!itemMap[itemName]) {
          itemMap[itemName] = { name: itemName, path: itemPath, count: 0 };
        }
        itemMap[itemName].count++;
      });

      const items = Object.values(itemMap).sort((a, b) => a.name.localeCompare(b.name));
      return jsonResponse({ items, total: resources.length });

    } else {
      // Step 1: list groups (subfolders of Personal/Collections)
      const resources = await searchAll('public_id:' + BASE_PATH + '/*', auth);

      const groupMap = {};
      resources.forEach(function(r) {
        const parts = r.public_id.split('/');
        if (parts.length < 3) return;
        const groupName = parts[2];
        if (!groupMap[groupName]) {
          groupMap[groupName] = { name: groupName, itemCount: 0, imageCount: 0, items: new Set() };
        }
        groupMap[groupName].imageCount++;
        if (parts[3]) groupMap[groupName].items.add(parts[3]);
      });

      const groups = Object.values(groupMap).map(g => ({
        name: g.name,
        itemCount: g.items.size,
        imageCount: g.imageCount
      })).sort((a, b) => a.name.localeCompare(b.name));

      return jsonResponse({ groups });
    }

  } catch (err) {
    return errorResponse('cloudinary-folders error: ' + err.message, 500);
  }
}
