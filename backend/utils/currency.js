const axios = require('axios');

// ─────────────────────────────────────────────
// Cache exchange rate for 6 hours
// Avoids hitting the API on every request
// ─────────────────────────────────────────────
let cachedRate = null;
let rateExpiry  = null;

const getUSDtoINR = async () => {
    try {
        // Return cached rate if still fresh
        if (cachedRate && rateExpiry && Date.now() < rateExpiry) {
            return cachedRate;
        }

        // Fetch live rate from free API — no key needed
        const response = await axios.get(
            'https://api.exchangerate-api.com/v4/latest/USD'
        );

        cachedRate = response.data.rates.INR;

        // Cache for 6 hours
        rateExpiry = Date.now() + (6 * 60 * 60 * 1000);

        console.log(`Currency: USD/INR rate updated → ₹${cachedRate}`);
        return cachedRate;

    } catch (error) {
        console.error('Currency fetch error:', error.message);
        // Fallback to approximate rate if API fails
        return 84.30;
    }
};

// ─────────────────────────────────────────────
// Convert USD to INR and format in Indian system
// Automatically shows Cr/L for large numbers
// ─────────────────────────────────────────────
const usdToInr = async (usdAmount) => {
    if (!usdAmount || usdAmount === 0) return null;

    const rate = await getUSDtoINR();
    const inr  = usdAmount * rate;

    return formatIndian(inr);
};

// ─────────────────────────────────────────────
// Format number in Indian system
// Shows Cr for crores, L for lakhs
// ─────────────────────────────────────────────
const formatIndian = (amount) => {
    if (!amount) return 'N/A';
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000)   return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
};

module.exports = { usdToInr, formatIndian, getUSDtoINR };