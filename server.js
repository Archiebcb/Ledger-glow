const express = require('express');
const axios = require('axios');
const CryptoJS = require('crypto-js');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = 3000;

app.use(express.static('public'));

// Cache for API responses
const cache = new Map();
const logoCacheFile = path.join(__dirname, 'public', 'logos.json');

async function loadLogoCache() {
  try {
    const data = await fs.readFile(logoCacheFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function saveLogoCache(logos) {
  await fs.writeFile(logoCacheFile, JSON.stringify(logos, null, 2));
}

function getMD5Value(issuer, currency) {
  const md5 = CryptoJS.MD5(`${issuer}_${currency}`).toString();
  console.log(`MD5 for ${issuer}_${currency}: ${md5}`);
  return md5;
}

async function getTokenLogo(md5) {
  const key = `logo_${md5}`;
  if (cache.has(key)) return cache.get(key);

  const logos = await loadLogoCache();
  if (logos[md5]) {
    console.log(`Cached logo for ${md5}: ${logos[md5].slice(0, 30)}...`);
    cache.set(key, { image: logos[md5] });
    return { image: logos[md5] };
  }

  try {
    const startTime = Date.now();
    const response = await axios.get(`https://s1.xrpl.to/token/${md5}`, {
      timeout: 2000,
      responseType: 'arraybuffer',
    });
    const duration = Date.now() - startTime;
    console.log(`Logo response for ${md5} (s1.xrpl.to): Content-Length=${response.headers['content-length'] || 'unknown'}, Time=${duration}ms`);
    const base64 = Buffer.from(response.data).toString('base64');
    const dataUrl = `data:image/webp;base64,${base64}`;
    logos[md5] = dataUrl;
    await saveLogoCache(logos);
    cache.set(key, { image: dataUrl });
    return { image: dataUrl };
  } catch (error) {
    console.error(`Error fetching logo ${md5} (s1.xrpl.to):`, error.response?.status || error.message);
    return { image: '' };
  }
}

app.get('/api/tokens', async (req, res) => {
  try {
    const start = parseInt(req.query.start) || 0;
    const limit = parseInt(req.query.limit) || 100;
    console.log(`Fetching tokens: start=${start}, limit=${limit}`);
    const response = await axios.get(
      `https://api.xrpl.to/api/tokens?start=${start}&limit=${limit}&sortBy=vol24hxrp&sortType=desc&filter=`
    );
    let tokens = response.data.tokens || response.data;

    console.log('API status:', response.status);
    console.log('Tokens type:', Array.isArray(tokens) ? 'Array' : typeof tokens);
    console.log('Tokens count:', Array.isArray(tokens) ? tokens.length : 'N/A');
    console.log('Total available tokens:', response.data.total || 'Unknown');

    if (!Array.isArray(tokens)) {
      throw new Error(`Invalid API response: not an array, type=${typeof tokens}`);
    }

    const tokenData = [];
    for (const token of tokens) {
      const md5 = token.md5 || getMD5Value(token.issuer, token.currency);
      const logoData = await getTokenLogo(md5);
      const logoUrl = logoData.image || '';
      console.log(`Final logo URL for ${token.currency}: ${logoUrl ? 'data:image/webp' : 'none'}`);
      tokenData.push({
        name: token.currency || 'Unknown',
        volume: parseFloat(token.vol24hxrp || 0),
        marketCap: parseFloat(token.marketcap || 0),
        holders: parseInt(token.trustlines || 0),
        issuer: token.issuer || '',
        md5: md5,
        logo: logoUrl,
      });
    }

    console.log('Processed tokens count:', tokenData.length);
    res.json(tokenData);
  } catch (error) {
    console.error('Error:', error.message);
    console.log('Falling back to mock data');
    res.json([
      {
        name: 'RLUSD',
        volume: 1000000,
        marketCap: 50000000,
        holders: 5000,
        issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq',
        md5: '0413ca7cfc258dfaf698c02fe304e607',
        logo: '',
      },
      {
        name: 'SGB',
        volume: 500000,
        marketCap: 20000000,
        holders: 3000,
        issuer: 'rHgbFyS72N3r6hGE1r4gdkRZoSwZ49MZuf',
        md5: 'mock2',
        logo: '',
      },
    ]);
  }
});

app.get('/api/description/:issuer/:currency', async (req, res) => {
  try {
    const { issuer, currency } = req.params;
    const key = `desc_${issuer}_${currency}`;
    if (cache.has(key)) return res.json(cache.get(key));
    const response = await axios.get(`https://api.xrpl.to/api/token/${issuer}_${currency}?desc=yes`);
    console.log(`Description for ${issuer}_${currency}:`, JSON.stringify(response.data, null, 2));
    const data = {
      description: response.data?.token?.description || 'N/A',
      totalSupply: response.data?.token?.amount ? parseFloat(response.data.token.amount) : 0,
      circulatingSupply: response.data?.token?.supply ? parseFloat(response.data.token.supply) : 0,
      price: response.data?.token?.usd ? parseFloat(response.data.token.usd) : 0,
    };
    cache.set(key, data);
    res.json(data);
  } catch (error) {
    console.error(`Error fetching description ${issuer}_${currency}:`, error.response?.status || error.message);
    res.json({ description: 'N/A', totalSupply: 0, circulatingSupply: 0, price: 0 });
  }
});

app.get('/api/richlist/:md5', async (req, res) => {
  try {
    const { md5 } = req.params;
    const key = `richlist_${md5}`;
    if (cache.has(key)) return res.json(cache.get(key));
    const response = await axios.get(`https://api.xrpl.to/api/richlist/${md5}?start=0&limit=3`);
    console.log(`Richlist for ${md5}:`, JSON.stringify(response.data, null, 2));
    const data = { topHolders: response.data?.richList || [] };
    cache.set(key, data);
    res.json(data);
  } catch (error) {
    console.error(`Error fetching richlist ${md5}:`, error.response?.status || error.message);
    res.json({ topHolders: [] });
  }
});

app.get('/api/offers/:account', async (req, res) => {
  try {
    const { account } = req.params;
    const key = `offers_${account}`;
    if (cache.has(key)) return res.json(cache.get(key));
    const response = await axios.get(`https://api.xrpl.to/api/account/offers/${account}`);
    console.log(`Offers for ${account}:`, JSON.stringify(response.data, null, 2));
    const data = { orderBook: response.data?.offers || [] };
    cache.set(key, data);
    res.json(data);
  } catch (error) {
    console.error(`Error fetching offers ${account}:`, error.response?.status || error.message);
    res.json({ orderBook: [] });
  }
});

app.listen(port, () => {
  console.log(`LedgerGlow server running at http://localhost:${port}`);
});