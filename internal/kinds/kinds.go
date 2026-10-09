package kinds

type Field struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	Type     string   `json:"type"`
	Required bool     `json:"required,omitempty"`
	Choices  []string `json:"choices,omitempty"`
	Example  string   `json:"example,omitempty"`
}

type Kind struct {
	Key        string  `json:"key"`
	Name       string  `json:"name"`
	Icon       string  `json:"icon"`
	Hint       string  `json:"hint"`
	Valuation  string  `json:"valuation"`
	Holdings   bool    `json:"holdings"`
	ValueField string  `json:"valueField,omitempty"`
	CostField  string  `json:"costField,omitempty"`
	DateField  string  `json:"dateField,omitempty"`
	Fields     []Field `json:"fields"`
	Template   string  `json:"template,omitempty"`
}

const (
	Market    = "market"
	NAV       = "nav"
	Gold      = "gold"
	Deposit   = "deposit"
	Balance   = "balance"
	Liability = "liability"
	Manual    = "manual"
	Rate      = "rate"
	None      = "none"
	// Cover is insurance: what a policy pays out protects net worth, so it is never part of it.
	Cover = "cover"
)

var FieldTypes = []string{"text", "number", "money", "date", "percent", "choice"}

func tradeFields(symbol, isin, quantity, price string) []Field {
	return []Field{
		{Key: "date", Label: "Date", Type: "date", Required: true, Example: "2024-04-15"},
		{Key: "symbol", Label: "Symbol", Type: "text", Example: symbol},
		{Key: "isin", Label: "ISIN", Type: "text", Example: isin},
		{Key: "action", Label: "Action", Type: "choice", Required: true, Choices: []string{"Buy", "Sell"}},
		{Key: "quantity", Label: "Quantity", Type: "number", Required: true, Example: quantity},
		{Key: "price", Label: "Price", Type: "money", Required: true, Example: price},
		{Key: "charges", Label: "Charges", Type: "money", Example: "20"},
	}
}

var All = []Kind{
	{Key: "stocks", Name: "Stocks", Icon: "candlestick_chart", Hint: "Shares on NSE or BSE, from any broker", Valuation: Market, Holdings: true, Fields: tradeFields("INFY", "INE009A01021", "10", "1450"), Template: "e.g. Zerodha tradebook"},
	{Key: "funds", Name: "Mutual Funds", Icon: "pie_chart", Hint: "Matched to AMFI by ISIN, priced daily", Valuation: NAV, Holdings: true, Template: "e.g. Groww order history", Fields: []Field{
		{Key: "date", Label: "Date", Type: "date", Required: true, Example: "2024-04-15"},
		{Key: "scheme", Label: "Scheme", Type: "text", Required: true, Example: "Parag Parikh Flexi Cap Fund - Direct Growth"},
		{Key: "isin", Label: "ISIN", Type: "text", Example: "INF879O01027"},
		{Key: "folio", Label: "Folio", Type: "text", Example: "12345678/90"},
		{Key: "action", Label: "Action", Type: "choice", Required: true, Choices: []string{"Purchase", "Redemption", "Switch in", "Switch out", "Dividend reinvest", "Dividend payout", "Other"}},
		{Key: "amount", Label: "Amount", Type: "money", Example: "10000"},
		{Key: "units", Label: "Units", Type: "number", Example: "142.857"},
		{Key: "nav", Label: "NAV", Type: "number", Example: "70.00"},
	}},
	{Key: "bonds", Name: "Bonds", Icon: "receipt_long", Hint: "Government and corporate bonds, SGBs included", Valuation: Market, Holdings: true, Fields: tradeFields("SGBAUG28V", "IN0020200153", "5", "5334"), Template: "e.g. RBI Retail Direct holdings"},
	{Key: "crypto", Name: "Crypto", Icon: "currency_bitcoin", Hint: "Coins from any exchange or wallet, priced daily in rupees", Valuation: Market, Holdings: true, Template: "e.g. CoinDCX or WazirX trade history", Fields: []Field{
		{Key: "date", Label: "Date", Type: "date", Required: true, Example: "2024-04-15"},
		{Key: "symbol", Label: "Coin", Type: "text", Required: true, Example: "BTC"},
		{Key: "action", Label: "Action", Type: "choice", Required: true, Choices: []string{"Buy", "Sell"}},
		{Key: "quantity", Label: "Quantity", Type: "number", Required: true, Example: "0.015"},
		{Key: "price", Label: "Price per coin", Type: "money", Required: true, Example: "5200000"},
		{Key: "charges", Label: "Fees", Type: "money", Example: "150"},
	}},
	{Key: "gold", Name: "Bullion", Icon: "diamond", Hint: "Gold and silver coins, bars and digital gold", Valuation: Gold, CostField: "cost", DateField: "bought_on", Template: "e.g. Gold coins list", Fields: []Field{
		{Key: "item", Label: "Item", Type: "text", Required: true, Example: "Tanishq 10g coin"},
		{Key: "metal", Label: "Metal", Type: "choice", Choices: []string{"Gold 24K", "Gold 22K", "Gold 18K", "Silver"}},
		{Key: "grams", Label: "Grams", Type: "number", Required: true, Example: "10"},
		{Key: "bought_on", Label: "Bought on", Type: "date", Example: "2022-11-04"},
		{Key: "cost", Label: "Cost", Type: "money", Example: "52000"},
	}},
	{Key: "deposits", Name: "Deposits", Icon: "account_balance", Hint: "Fixed and recurring, valued from the rate and dates", Valuation: Deposit, Template: "e.g. Bank deposit summary", Fields: []Field{
		{Key: "bank", Label: "Bank", Type: "text", Required: true, Example: "SBI"},
		{Key: "account", Label: "Account", Type: "text", Example: "FD 0042"},
		{Key: "type", Label: "Type", Type: "choice", Choices: []string{"Fixed", "Recurring"}},
		{Key: "amount", Label: "Amount or monthly instalment", Type: "money", Required: true, Example: "200000"},
		{Key: "rate", Label: "Rate", Type: "percent", Required: true, Example: "7.1"},
		{Key: "start", Label: "Start", Type: "date", Required: true, Example: "2025-01-10"},
		{Key: "maturity", Label: "Maturity", Type: "date", Required: true, Example: "2027-01-10"},
		{Key: "compounding", Label: "Compounding", Type: "choice", Choices: []string{"Quarterly", "Monthly", "Yearly", "Simple"}},
		{Key: "on_maturity", Label: "On maturity", Type: "choice", Choices: []string{CreditToAccount, Reinvest, ReinvestPrincipal}},
	}},
	{Key: "savings", Name: "Savings", Icon: "savings", Hint: "Bank balances and cash, earning interest from the day you give", Valuation: Balance, ValueField: "balance", DateField: "as_of", Template: "e.g. Month-end balances", Fields: SavingsFields},
	{Key: "loans", Name: "Loans", Icon: "request_quote", Hint: "Home, car or personal, counted against you", Valuation: Liability, ValueField: "outstanding", Template: "e.g. Loan statements", Fields: []Field{
		{Key: "lender", Label: "Lender", Type: "text", Required: true, Example: "HDFC home loan"},
		{Key: "outstanding", Label: "Outstanding", Type: "money", Required: true, Example: "3000000"},
		{Key: "rate", Label: "Rate", Type: "percent", Example: "8.5"},
		{Key: "emi", Label: "EMI", Type: "money", Example: "32000"},
	}},
	{Key: "property", Name: "Property", Icon: "home", Hint: "Valued by your own estimate", Valuation: Manual, ValueField: "value", CostField: "cost", DateField: "bought_on", Template: "e.g. Property list", Fields: []Field{
		{Key: "property", Label: "Property", Type: "text", Required: true, Example: "2BHK, Baner"},
		{Key: "city", Label: "City", Type: "text", Example: "Pune"},
		{Key: "bought_on", Label: "Bought on", Type: "date", Example: "2019-06-01"},
		{Key: "cost", Label: "Cost", Type: "money", Example: "6500000"},
		{Key: "value", Label: "Current estimate", Type: "money", Required: true, Example: "9000000"},
		{Key: "rent", Label: "Monthly rent", Type: "money", Example: "25000"},
	}},
	{Key: "insurance", Name: "Insurance", Icon: "shield", Hint: "Term, health and other cover. Shown, never counted", Valuation: Cover, Template: "e.g. Policy list", Fields: []Field{
		{Key: "policy", Label: "Policy", Type: "text", Required: true, Example: "HDFC Click 2 Protect"},
		{Key: "type", Label: "Type", Type: "choice", Required: true, Choices: PolicyTypes},
		{Key: "insurer", Label: "Insurer", Type: "text", Example: "HDFC Life"},
		{Key: "cover", Label: "Cover", Type: "money", Required: true, Example: "15000000"},
		{Key: "premium", Label: "Premium", Type: "money", Example: "18200"},
		{Key: "pays", Label: "Pays", Type: "choice", Choices: []string{"Monthly", "Quarterly", "Half-yearly", "Yearly", "Once"}},
		{Key: "renews_on", Label: "Renews on", Type: "date", Example: "2027-03-03"},
		{Key: "ends_on", Label: "Ends on", Type: "date", Example: "2051-03-03"},
		{Key: "covers", Label: "Covers", Type: "text", Example: "You, Aditi"},
		{Key: "nominee", Label: "Nominee", Type: "text", Example: "Aditi"},
	}},
	{Key: "custom", Name: "Something else", Icon: "add_circle", Hint: "Define a section of your own", Valuation: Manual},
}

func Get(key string) (Kind, bool) {
	for _, k := range All {
		if k.Key == key {
			return k, true
		}
	}
	return Kind{}, false
}

const (
	CreditToAccount   = "Credit to account"
	Reinvest          = "Reinvest"
	ReinvestPrincipal = "Reinvest principal, credit interest"
)

// SavingsFields are the fields of a savings account; interest is credited quarterly, the way Indian banks pay savings interest.
var SavingsFields = []Field{
	{Key: "account", Label: "Account", Type: "text", Required: true, Example: "HDFC savings"},
	{Key: "balance", Label: "Balance", Type: "money", Required: true, Example: "125000"},
	{Key: "as_of", Label: "Balance on", Type: "date", Example: "2026-09-30"},
	{Key: "rate", Label: "Interest rate", Type: "percent", Example: "3"},
}

var PolicyTypes = []string{"Term life", "Health", "Life with savings", "Vehicle", "Home", "Other"}

var CustomValuations = []string{Manual, Rate, None}

// Expenses and Cards are not sections: templates for expense and card imports are saved under these kinds.
const (
	Expenses = "expenses"
	Cards    = "cards"
)

// CardFields are labelled to match the export's headers, so a credit-cards.csv from Ebenezer comes back with nothing to match.
var CardFields = []Field{
	{Key: "bank", Label: "Bank", Type: "text", Required: true, Example: "HDFC Bank"},
	{Key: "name", Label: "Card", Type: "text", Required: true, Example: "Regalia Gold"},
	{Key: "nickname", Label: "Nickname", Type: "text", Example: "Travel card"},
	{Key: "kind", Label: "Kind", Type: "choice", Choices: []string{"credit", "charge"}, Example: "credit"},
	{Key: "network", Label: "Network", Type: "choice", Choices: []string{"visa", "mastercard", "amex", "rupay", "diners", "other"}, Example: "visa"},
	{Key: "limit", Label: "Limit", Type: "money", Example: "300000"},
	{Key: "statement_day", Label: "Statement day", Type: "number", Required: true, Example: "17"},
	{Key: "due_days", Label: "Due days after", Type: "number", Example: "20"},
	{Key: "interest", Label: "Interest a month", Type: "percent", Example: "3.75"},
	{Key: "annual_fee", Label: "Annual fee", Type: "money", Example: "2500"},
	{Key: "statement_on", Label: "Last statement on", Type: "date", Example: "2026-09-17"},
	{Key: "statement_balance", Label: "Last statement balance", Type: "money", Example: "22410"},
	{Key: "paid", Label: "Paid towards it", Type: "money", Example: "0"},
	{Key: "spent_before", Label: "Spent since that statement", Type: "money", Example: "0"},
	{Key: "color", Label: "Colour", Type: "text", Example: "#1d2b4f"},
}

// ExpenseFields take Paid from as a card, an account or "Cash" by name; the import matches whatever the file says to one of them.
var ExpenseFields = []Field{
	{Key: "date", Label: "Date", Type: "date", Required: true, Example: "2026-10-09"},
	{Key: "item", Label: "What", Type: "text", Required: true, Example: "Swiggy"},
	{Key: "amount", Label: "Amount", Type: "money", Required: true, Example: "486"},
	{Key: "category", Label: "Category", Type: "text", Example: "Food delivery"},
	{Key: "paid_with", Label: "Paid from", Type: "text", Example: "Regalia"},
	{Key: "note", Label: "Note", Type: "text"},
}
