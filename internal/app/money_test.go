package app

import "testing"

func TestIndianMoney(t *testing.T) {
	cases := map[string]string{
		Rupees(1234567):                        "₹12,34,567",
		Rupees(-4847):                          "(₹4,847)",
		Rupees(999):                            "₹999",
		Short(480000):                          "₹4.80\u202fL",
		Short(-30000000):                       "(₹3.00\u202fCr)",
		Signed(4847):                           "+₹4,847",
		Pct(-0.371):                            "(37.1%)",
		Pct(0.02):                              "+2.0%",
		NameCase("NIPPON INDIA ETF GOLD BEES"): "Nippon India ETF Gold Bees",
	}
	for got, want := range cases {
		if got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
}
