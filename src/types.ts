export type Profile = { id: string; name: string; type: string; description?: string; baseCurrencyCode: string; icon: string };
export type Account = { id: string; name: string; type: string; institution?: string; currencyCode: string; balance: string; monthlyInflow: string; monthlyOutflow: string; lastActivity?: string; includeInAvailableCash: boolean };
export type Category = { id: string; name: string; type: 'INCOME' | 'EXPENSE' | 'ASSET' | 'DEBT' };
export type Transaction = { id: string; type: string; status: string; amount: string; feeAmount: string; transactionDate: string; description?: string; counterparty?: string; reference?: string; fromAccount?: Account; toAccount?: Account; category?: Category; attachments: { id: string; fileName: string }[] };
export type Metrics = { available: string; moneyIn: string; moneyOut: string; netCashFlow: string; owedToProfile: string; owedByProfile: string; netWorth: string };
export type DashboardData = { profile: Profile; metrics: Metrics; accounts: Account[]; recentTransactions: Transaction[]; upcoming: { id: string; payee: string; amount: string; dueDate: string; status: string }[] };

