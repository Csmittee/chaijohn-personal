import { listRecords, jsonResponse, errorResponse } from '../../../_airtable.js';

const BASE_ID = 'apphBGWfSPL45oSFd';

export async function onRequestGet(context) {
  const { env } = context;

  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0];

  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString().split('T')[0];

  try {
    const [txData, debtData, assetData, thisMonthIncome, thisMonthExpense] = await Promise.all([
      // Last 3 months transactions
      listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Transactions', {
        filterByFormula: `NOT(IS_BEFORE({date}, '${threeMonthsAgoStr}'))`,
        sort: [{ field: 'date', direction: 'desc' }],
        maxRecords: 1000
      }),
      // Active debts
      listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Debts', {
        filterByFormula: `{active}=TRUE()`,
        maxRecords: 500
      }),
      // Non-sold assets
      listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Assets', {
        filterByFormula: `NOT({status}='Sold')`,
        maxRecords: 500
      }),
      // This month income
      listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Transactions', {
        filterByFormula: `AND({type}='Income', NOT(IS_BEFORE({date}, '${firstOfMonth}')))`,
        maxRecords: 500
      }),
      // This month expense
      listRecords(env.AIRTABLE_API_KEY, BASE_ID, 'Transactions', {
        filterByFormula: `AND({type}='Expense', NOT(IS_BEFORE({date}, '${firstOfMonth}')))`,
        maxRecords: 500
      })
    ]);

    const transactions = txData.records || [];
    const debts = debtData.records || [];
    const assets = assetData.records || [];

    // Compute totals for last 3 months
    let incomeTotal = 0;
    let expenseTotal = 0;
    const categorySpend = {};

    for (const tx of transactions) {
      const f = tx.fields;
      const amount = Number(f.amount || 0);
      if (f.type === 'Income') {
        incomeTotal += amount;
      } else if (f.type === 'Expense') {
        expenseTotal += amount;
        // Group by category_id (first linked record ID or 'Uncategorized')
        const catId = Array.isArray(f.category_id) && f.category_id.length > 0
          ? f.category_id[0]
          : (f.category_name || 'Uncategorized');
        categorySpend[catId] = (categorySpend[catId] || 0) + amount;
      }
    }

    // Top 5 categories by spend
    const topCategories = Object.entries(categorySpend)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));

    // Debt totals
    const totalDebtBalance = debts.reduce((sum, d) => sum + Number(d.fields.current_balance || 0), 0);

    // Asset totals
    const totalAssetValue = assets.reduce((sum, a) => sum + Number(a.fields.estimated_value || 0), 0);
    const assetsForSale = assets.filter(a => a.fields.status === 'For Sale');
    const assetsForSaleValue = assetsForSale.reduce((sum, a) => sum + Number(a.fields.estimated_value || 0), 0);

    // Net worth
    const netWorth = totalAssetValue - totalDebtBalance;

    // This month
    const thisMonthIncomeTotal = (thisMonthIncome.records || []).reduce(
      (sum, tx) => sum + Number(tx.fields.amount || 0), 0
    );
    const thisMonthExpenseTotal = (thisMonthExpense.records || []).reduce(
      (sum, tx) => sum + Number(tx.fields.amount || 0), 0
    );

    const contextData = {
      period: 'Last 3 months',
      income_total: incomeTotal,
      expense_total: expenseTotal,
      net: incomeTotal - expenseTotal,
      top_categories: topCategories,
      active_debts_count: debts.length,
      total_debt_balance: totalDebtBalance,
      total_asset_value: totalAssetValue,
      net_worth: netWorth,
      assets_for_sale_count: assetsForSale.length,
      assets_for_sale_value: assetsForSaleValue,
      this_month_income: thisMonthIncomeTotal,
      this_month_expense: thisMonthExpenseTotal
    };

    return jsonResponse(contextData);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
