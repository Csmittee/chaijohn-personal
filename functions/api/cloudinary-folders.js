// functions/api/cloudinary-folders.js
// GET /api/cloudinary-folders          → list all folders
// GET /api/cloudinary-folders?folder=X → list assets in folder X

import { jsonResponse, errorResponse } from '../_airtable.js';

const CLOUD_NAME = 'dfiomi0lb';

async function cloudinaryAuth(apiKey, apiSecret) {
  const credentials = btoa(apiKey + ':' + apiSecret);
  return 'Basic ' + credentials;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const folder = url.searchParams.get('folder');

  const auth = await cloudinaryAuth(env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET);

  if (folder) {
    // Return all image assets in this folder
    return await getAssetsInFolder(folder, auth);
  } else {
    // Return all subfolders under Personal/Collections
    return await getAllFolders(auth);
  }
}

async function getAllFolders(auth) {
  try {
    // Get all subfolders recursively under Personal/Collections
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/folders/Personal/Collections`,
      { headers: { 'Authorization': auth } }
    );

    if (!res.ok) {
      const errText = await res.text();
      return errorResponse('Cloudinary folder list failed: ' + errText, res.status);
    }

    const data = await res.json();
    const folders = [];

    // Flatten folder tree into list with path + name + parent
    function flatten(items, parentName) {
      (items || []).forEach(function (f) {
        folders.push({
          name: f.name,
          path: f.path,
          parent: parentName || ''
        });
        if (f.sub_folders && f.sub_folders.length > 0) {
          flatten(f.sub_folders, f.name);
        }
      });
    }

    flatten(data.sub_folders, 'Collections');

    return jsonResponse({ folders });
  } catch (err) {
    return errorResponse('getAllFolders error: ' + err.message, 500);
  }
}

async function getAssetsInFolder(folderPath, auth) {
  try {
    // Use search API to get all resources in folder
    const searchBody = {
      expression: 'folder="' + folderPath + '"',
      sort_by: [{ created_at: 'asc' }],
      max_results: 100,
      with_field: ['context', 'tags']
    };

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/search`,
      {
        method: 'POST',
        headers: {
          'Authorization': auth,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchBody)
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return errorResponse('Cloudinary search failed: ' + errText, res.status);
    }

    const data = await res.json();
    const resources = (data.resources || []).map(function (r) {
      return {
        public_id: r.public_id,
        secure_url: r.secure_url,
        format: r.format,
        bytes: r.bytes,
        created_at: r.created_at,
        width: r.width,
        height: r.height
      };
    });

    return jsonResponse({ resources });
  } catch (err) {
    return errorResponse('getAssetsInFolder error: ' + err.message, 500);
  }
}
