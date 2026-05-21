import { getRecord, updateRecord, createRecord, jsonResponse, errorResponse } from '../../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';
const TABLE = 'Debts';
const TX_TABLE = 'Transactions';

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const recordId = params.id;

  if (!recordId) return errorResponse('Record ID is required');

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { payment_amount, payment_date } = body;

  // Special case: payment processing
  if (payment_amount !== undefined && payment_date) {
    let debtRecord;
    try {
      debtRecord = await getRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, recordId);
    } catch (err) {
      return errorResponse('Failed to get debt record: ' + err.message, 500);
    }

    const creditorName = debtRecord.fields.creditor_name || 'Unknown';
    const currentBalance = Number(debtRecord.fields.current_balance || 0);
    const newBalance = Math.max(0, currentBalance - Number(payment_amount));

    const debtFields = {
      current_balance: newBalance,
      last_payment_date: payment_date
    };

    // Also apply any other fields from body (exclude payment-specific keys)
    const skip = ['payment_amount', 'payment_date', 'note'];
    for (const key of Object.keys(body)) {
      if (!skip.includes(key) && body[key] !== undefined) {
        debtFields[key] = body[key];
      }
    }

    try {
      const [updatedDebt, txRecord] = await Promise.all([
        updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, recordId, debtFields),
        createRecord(env.AIRTABLE_API_KEY, BASE_ID, TX_TABLE, {
          type: 'Expense',
          amount: Number(payment_amount),
          date: payment_date,
          description: 'Debt payment - ' + creditorName,
          entity: creditorName,
          note: body.note || '',
          source: 'Manual',
          fixed_variable: 'Fixed'
        })
      ]);
      return jsonResponse({ record: updatedDebt, transaction: txRecord });
    } catch (err) {
      return errorResponse(err.message, 500);
    }
  }

  // Regular update
  const fields = {};
  const allowed = ['creditor_name', 'creditor_type', 'original_amount', 'current_balance',
    'interest_rate', 'monthly_payment', 'due_date', 'last_payment_date', 'notes', 'active'];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (['original_amount', 'current_balance', 'interest_rate', 'monthly_payment'].includes(key)) {
        fields[key] = Number(body[key]);
      } else {
        fields[key] = body[key];
      }
    }
  }

  if (Object.keys(fields).length === 0) {
    return errorResponse('No fields to update');
  }

  try {
    const record = await updateRecord(env.AIRTABLE_API_KEY, BASE_ID, TABLE, recordId, fields);
    return jsonResponse({ record });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
