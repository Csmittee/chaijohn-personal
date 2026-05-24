import { getRecord, updateRecord, createRecord, listRecords, jsonResponse, errorResponse } from '../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Liabilities';
const PAYMENTS_TABLE = 'Liability_Payments';
const TX_TABLE = 'Transactions';
const CAT_TABLE = 'Categories';

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = params.id;
  if (!id) return errorResponse('Liability ID required');

  try {
    const record = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id);
    return jsonResponse({ record });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const id = params.id;
  if (!id) return errorResponse('Liability ID required');

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  // Payment flow: payment_amount triggers interest calculation
  if (body.payment_amount !== undefined) {
    const paymentAmount = Number(body.payment_amount);
    const paymentDate = body.date || new Date().toISOString().split('T')[0];

    let liability;
    try {
      liability = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id);
    } catch (err) {
      return errorResponse('Failed to get liability: ' + err.message, 500);
    }

    const f = liability.fields;
    const balance = Number(f.current_balance || 0);
    const rate = Number(f.interest_rate || 0);
    const monthlyRate = rate / 100 / 12;
    const interest = Math.round(balance * monthlyRate * 100) / 100;
    const principal = Math.max(0, Math.round((paymentAmount - interest) * 100) / 100);
    const newBalance = Math.max(0, Math.round((balance - principal) * 100) / 100);

    let payment;
    try {
      payment = await createRecord(env.AIRTABLE_API_KEY, BASE_ID, PAYMENTS_TABLE, {
        liability_id: [id],
        date: paymentDate,
        total_payment: paymentAmount,
        principal,
        interest,
        notes: body.note || ''
      });
    } catch (err) {
      return errorResponse('Failed to create payment record: ' + err.message, 500);
    }

    // E3: loan payment = cash OUT — create Expense transaction with entity + category (non-fatal)
    try {
      const catRes = await listRecords(env.AIRTABLE_API_KEY, BASE_ID, CAT_TABLE, {
        filterByFormula: `AND({active}=TRUE(),{type}='Loan')`,
        maxRecords: 1
      });
      const loanCatId = catRes.records?.[0]?.id || null;
      const txFields = {
        date: paymentDate,
        amount: paymentAmount,
        type: 'Expense',
        entity: f.name || '',
        description: `Loan payment — ${f.name || id}`,
        source: 'LiabilityPayment',
        note: body.note || ''
      };
      if (loanCatId) txFields.category_id = [loanCatId];
      await createRecord(env.AIRTABLE_API_KEY, BASE_ID, TX_TABLE, txFields);
    } catch { /* non-fatal */ }

    try {
      await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id, { current_balance: newBalance });
    } catch (err) {
      return errorResponse('Payment logged but failed to update balance: ' + err.message, 500);
    }

    return jsonResponse({ payment, new_balance: newBalance, interest, principal });
  }

  // Regular field update
  const fields = {};
  const allowed = ['name', 'creditor_type', 'loan_size', 'current_balance',
    'interest_rate', 'monthly_payment', 'start_date', 'active', 'notes'];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      const numFields = ['loan_size', 'current_balance', 'interest_rate', 'monthly_payment'];
      fields[key] = numFields.includes(key) ? Number(body[key]) : body[key];
    }
  }

  if (Object.keys(fields).length === 0) return errorResponse('No fields to update');

  try {
    const record = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, id, fields);
    return jsonResponse({ record });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
