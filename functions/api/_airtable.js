const AIRTABLE_BASE = 'https://api.airtable.com/v0';

export async function listRecords(apiKey, baseId, tableName, params = {}) {
  const query = new URLSearchParams();
  if (params.filterByFormula) query.set('filterByFormula', params.filterByFormula);
  if (params.sort) {
    params.sort.forEach((s, i) => {
      query.set(`sort[${i}][field]`, s.field);
      query.set(`sort[${i}][direction]`, s.direction || 'desc');
    });
  }
  if (params.maxRecords) query.set('maxRecords', params.maxRecords);
  if (params.pageSize) query.set('pageSize', params.pageSize);
  if (params.offset) query.set('offset', params.offset);
  if (params.fields) params.fields.forEach((f, i) => query.set(`fields[${i}]`, f));

  const url = `${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}?${query}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`Airtable list error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function createRecord(apiKey, baseId, tableName, fields, { typecast = false } = {}) {
  const body = { records: [{ fields }] };
  if (typecast) body.typecast = true;
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Airtable create error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.records[0];
}

export async function updateRecord(apiKey, baseId, tableName, recordId, fields) {
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}/${recordId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(`Airtable update error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function deleteRecord(apiKey, baseId, tableName, recordId) {
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}/${recordId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`Airtable delete error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getRecord(apiKey, baseId, tableName, recordId) {
  const res = await fetch(`${AIRTABLE_BASE}/${baseId}/${encodeURIComponent(tableName)}/${recordId}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`Airtable get error ${res.status}: ${await res.text()}`);
  return res.json();
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function errorResponse(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
