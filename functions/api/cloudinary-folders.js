// functions/api/cloudinary-folders.js
// Supports collection-based search for index images
// GET /api/cloudinary-folders                    → list groups
// GET /api/cloudinary-folders?group=Vice         → list items
// GET /api/cloudinary-folders?item=path          → list images in item
// GET /api/cloudinary-folders?collection=name    → get all images in a Cloudinary collection

import { jsonResponse, errorResponse } from '../_airtable.js';

const CLOUD_NAME = 'dfiomi0lb';
const BASE_PATH = 'Personal/Collections';

function getAuth(env) {
  return 'Basic ' + btoa(env.CLOUDINARY_API_KEY + ':' + env.CLOUDINARY_API_SECRET);
}

async function listSubFolders(folderPath, auth) {
  const encoded = folderPath.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/folders/${encoded}`,
    { headers: { 'Authorization': auth } }
  );
  if (!res.ok) throw new Error('Folder list failed (' + res.status + ')');
  const data = await res.json();
  return (data.folders || []).map(function(f) {
    return { name: f.name, path: f.path };
  });
}

async function getImagesByAssetFolder(folderPath, auth) {
  const resources = [];
  let next_cursor = null;
  let page = 0;
  do {
    const body = {
      expression: 'asset_folder="' + folderPath + '"',
      sort_by: [{ created_at: 'asc' }],
      max_results: 100,
      fields: ['public_id', 'secure_url', 'format', 'created_at', 'asset_folder', 'display_name']
    };
    if (next_cursor) body.next_cursor = next_cursor;
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/search`,
      { method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) throw new Error('Search failed: ' + await res.text());
    const data = await res.json();
    resources.push(...(data.resources || []));
    next_cursor = data.next_cursor || null;
    page++;
  } while (next_cursor && page < 20);
  return resources;
}

async function getImagesByCollection(collectionName, auth) {
  // Search using collection tag expression
  const body = {
    expression: 'tags="' + collectionName + '"',
    sort_by: [{ asset_folder: 'asc' }],
    max_results: 500,
    fields: ['public_id', 'secure_url', 'format', 'created_at', 'asset_folder', 'display_name', 'tags']
  };
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/search`,
    { method: 'POST', headers: { 'Authorization': auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error('Collection search failed: ' + await res.text());
  const data = await res.json();
  return data.resources || [];
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const group      = url.searchParams.get('group');
  const item       = url.searchParams.get('item');
  const collection = url.searchParams.get('collection');
  const auth       = getAuth(env);

  try {
    if (collection) {
      // Get all images tagged with this collection name
      // Parse asset_folder to extract category and item name
      const images = await getImagesByCollection(collection, auth);

      // Group by asset_folder → one record per folder
      const itemMap = {};
      images.forEach(function(r) {
        const folder = r.asset_folder || '';
        const parts = folder.split('/');
        // Expected: Personal/Collections/Vice/Oriental JapTW
        const category = parts[2] || 'Other';
        const itemName = parts[3] || r.display_name || r.public_id;

        if (!itemMap[folder]) {
          itemMap[folder] = {
            name: itemName,
            category: category,
            folder: folder,
            image: r.secure_url,
            format: r.format
          };
        }
      });

      const items = Object.values(itemMap).sort(function(a,b) {
        return a.name.localeCompare(b.name);
      });

      return jsonResponse({
        items,
        total: items.length,
        raw_count: images.length
      });

    } else if (item) {
      const images = await getImagesByAssetFolder(item, auth);
      return jsonResponse({
        images: images.map(function(r) {
          return { public_id: r.public_id, secure_url: r.secure_url, format: r.format, created_at: r.created_at };
        }),
        total: images.length
      });

    } else if (group) {
      const groupPath = BASE_PATH + '/' + group;
      const subfolders = await listSubFolders(groupPath, auth);
      const items = subfolders.map(function(f) {
        return { name: f.name, path: f.path, count: '?' };
      }).sort(function(a,b) { return a.name.localeCompare(b.name); });
      return jsonResponse({ items, total: items.length });

    } else {
      const subfolders = await listSubFolders(BASE_PATH, auth);
      const groups = await Promise.all(subfolders.map(async function(f) {
        try {
          const items = await listSubFolders(f.path, auth);
          return { name: f.name, itemCount: items.length };
        } catch(e) { return { name: f.name, itemCount: '?' }; }
      }));
      return jsonResponse({ groups: groups.sort(function(a,b) { return a.name.localeCompare(b.name); }) });
    }

  } catch(err) {
    return errorResponse('cloudinary-folders: ' + err.message, 500);
  }
}
