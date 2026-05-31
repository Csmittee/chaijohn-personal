// functions/api/cloudinary-folders.js
// GET /api/cloudinary-folders              → list groups
// GET /api/cloudinary-folders?group=Vice   → list items in group
// GET /api/cloudinary-folders?item=path    → list images in item (uses prefix API, handles spaces)

import { jsonResponse, errorResponse } from '../_airtable.js';

const CLOUD_NAME = 'dfiomi0lb';
const BASE_PATH = 'Personal/Collections';

function getAuth(env) {
  return 'Basic ' + btoa(env.CLOUDINARY_API_KEY + ':' + env.CLOUDINARY_API_SECRET);
}

// List subfolders using Folders API (fast, no pagination)
async function listSubFolders(folderPath, auth) {
  const encoded = folderPath.split('/').map(encodeURIComponent).join('/');
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

// Get images in item folder using Resources API with PREFIX (handles spaces correctly)
async function getItemImages(folderPath, auth) {
  const resources = [];
  let next_cursor = null;
  let page = 0;
  const MAX_PAGES = 20;

  do {
    // Use prefix-based Resources API — correctly handles spaces in folder names
    const params = new URLSearchParams({
      type: 'upload',
      prefix: folderPath + '/',
      max_results: '100',
      resource_type: 'image'
    });
    if (next_cursor) params.set('next_cursor', next_cursor);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image?` + params.toString(),
      { headers: { 'Authorization': auth } }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error('Resources API failed: ' + err);
    }

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
      // Step 3 — get images for one item using prefix API (handles spaces)
      const images = await getItemImages(item, auth);
      const filtered = images.map(function(r) {
        return {
          public_id: r.public_id,
          secure_url: r.secure_url,
          format: r.format,
          created_at: r.created_at
        };
      });
      return jsonResponse({ images: filtered });

    } else if (group) {
      // Step 2 — list item subfolders using Folders API
      const groupPath = BASE_PATH + '/' + group;
      const subfolders = await listSubFolders(groupPath, auth);
      const items = subfolders.map(function(f) {
        return { name: f.name, path: f.path, count: '?' };
      }).sort(function(a,b) { return a.name.localeCompare(b.name); });
      return jsonResponse({ items, total: items.length });

    } else {
      // Step 1 — list groups using Folders API
      const subfolders = await listSubFolders(BASE_PATH, auth);
      const groups = await Promise.all(subfolders.map(async function(f) {
        try {
          const items = await listSubFolders(f.path, auth);
          return { name: f.name, itemCount: items.length };
        } catch(e) {
          return { name: f.name, itemCount: '?' };
        }
      }));
      return jsonResponse({
        groups: groups.sort(function(a,b) { return a.name.localeCompare(b.name); })
      });
    }

  } catch(err) {
    return errorResponse('cloudinary-folders: ' + err.message, 500);
  }
}
