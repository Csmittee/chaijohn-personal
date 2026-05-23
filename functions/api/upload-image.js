import { jsonResponse, errorResponse } from '../_airtable.js';

const CLOUDINARY_CLOUD_NAME = 'dfiomi0lb';

async function cloudinarySignature(paramsToSign, apiSecret) {
  // Sort params, concat as key=value&key=value + apiSecret
  const str = Object.keys(paramsToSign).sort()
    .map(k => k + '=' + paramsToSign[k])
    .join('&') + apiSecret;
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost(context) {
  const { env, request } = context;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('Invalid form data — expected multipart/form-data');
  }

  const file = formData.get('file');
  if (!file) return errorResponse('file is required');

  const folder = formData.get('folder') || 'general';
  const timestamp = Math.floor(Date.now() / 1000);
  // Always convert to JPEG 1000×1000 max — handles HEIC, WEBP, PNG, anything
  const eager = 'w_1000,h_1000,c_limit,f_jpg,q_auto';

  let sig;
  try {
    sig = await cloudinarySignature(
      { eager, folder, timestamp },
      env.CLOUDINARY_API_SECRET
    );
  } catch (err) {
    return errorResponse('Failed to generate upload signature: ' + err.message, 500);
  }

  // Build Cloudinary upload FormData
  const uploadForm = new FormData();
  uploadForm.append('file', file);
  uploadForm.append('api_key', env.CLOUDINARY_API_KEY);
  uploadForm.append('timestamp', timestamp.toString());
  uploadForm.append('folder', folder);
  uploadForm.append('eager', eager);
  uploadForm.append('signature', sig);

  let uploadRes;
  try {
    uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: uploadForm }
    );
  } catch (err) {
    return errorResponse('Upload request failed: ' + err.message, 500);
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    return errorResponse(`Cloudinary upload failed: ${errText}`, uploadRes.status);
  }

  const result = await uploadRes.json();
  // Use the eager-transformed JPEG URL so HEIC/WEBP/PNG are all normalised to JPEG
  const url = result.eager?.[0]?.secure_url ?? result.secure_url;
  return jsonResponse({ url, public_id: result.public_id });
}
