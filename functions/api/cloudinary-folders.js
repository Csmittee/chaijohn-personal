// functions/api/cloudinary-folders.js
// Uses asset_folder field for image search (dynamic folder mode)
// GET /api/cloudinary-folders              → list groups
// GET /api/cloudinary-folders?group=Vice   → list items in group  
// GET /api/cloudinary-folders?item=path    → list images in item folder

import { jsonResponse, errorResponse } from '../_airtable.js';

const CLOUD_NAME = 'dfiomi0lb';
const BASE_PATH = 'Personal/Collections';

function getAuth(env) {
  return 'Basic ' + btoa(env.CLOUDINARY_API_KEY + ':' + env.CLOUDINARY_API_SECRET);
}

// List subfolders using Folders API
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

// Search images by asset_folder (dynamic folder mode — drag-drop uploads)
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
      {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error('Search failed: ' + err);
    }

    const data = await res.json();
    resources.push(...(data.resources || []));
    next_cursor = data.next_cursor || null;
    page++;

  } while (next_cursor && page < 20);

  return resources;
}

// Search all items under a group using asset_folder prefix
async function getItemsInGroup(groupPath, auth) {
  // First try Folders API for subfolder names
  const subfolders = await listSubFolders(groupPath, auth);
  return subfolders;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const group = url.searchParams.get('group');
  const item  = url.searchParams.get('item');
  const auth  = getAuth(env);
// TEMP TEST — remove after confirming
if (url.searchParams.get('test_collection')) {
  const name = url.searchParams.get('test_collection');
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/collections/${encodeURIComponent(name)}/resources?max_results=10`,
    { headers: { 'Authorization': auth } }
  );
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}



  
  try {
    if (item) {
      // Get images using asset_folder search (handles drag-drop uploads correctly)
      const images = await getImagesByAssetFolder(item, auth);
      return jsonResponse({
        images: images.map(function(r) {
          return {
            public_id: r.public_id,
            secure_url: r.secure_url,
            format: r.format,
            created_at: r.created_at,
            display_name: r.display_name
          };
        }),
        total: images.length,
        folder_searched: item
      });

    } else if (group) {
      // List item subfolders using Folders API
      const groupPath = BASE_PATH + '/' + group;
      const subfolders = await listSubFolders(groupPath, auth);
      const items = subfolders.map(function(f) {
        return { name: f.name, path: f.path, count: '?' };
      }).sort(function(a,b) { return a.name.localeCompare(b.name); });
      return jsonResponse({ items, total: items.length });

    } else {
      // List groups using Folders API
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
