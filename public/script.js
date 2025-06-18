let start = 0;
const limit = 100;
let loading = false;
let allTokens = [];

async function fetchTokens(start, limit) {
  try {
    console.log(`Fetching frontend: start=${start}, limit=${limit}`);
    const response = await fetch(`/api/tokens?start=${start}&limit=${limit}`);
    const data = await response.json();
    if (!Array.isArray(data)) {
      console.error('Invalid data:', data);
      return [];
    }
    console.log('Fetched tokens:', data.length);
    return data;
  } catch (error) {
    console.error('Error fetching tokens:', error);
    return [];
  }
}

async function fetchDescription(issuer, currency) {
  try {
    console.log(`Fetching description for ${issuer}_${currency}`);
    const response = await fetch(`/api/description/${issuer}/${currency}`);
    const data = await response.json();
    console.log(`Description result:`, data);
    return data;
  } catch (error) {
    console.error(`Error fetching description:`, error);
    return { description: 'N/A', totalSupply: 0, circulatingSupply: 0, price: 0 };
  }
}

async function fetchRichList(md5) {
  try {
    console.log(`Fetching richlist for ${md5}`);
    const response = await fetch(`/api/richlist/${md5}`);
    const data = await response.json();
    console.log(`Richlist result:`, data);
    return data;
  } catch (error) {
    console.error(`Error fetching richlist:`, error);
    return { topHolders: [] };
  }
}

async function fetchOffers(account) {
  try {
    console.log(`Fetching offers for ${account}`);
    const response = await fetch(`/api/offers/${account}`);
    const data = await response.json();
    console.log(`Offers result:`, data);
    return data;
  } catch (error) {
    console.error(`Error fetching offers:`, error);
    return { orderBook: [] };
  }
}

function calculateColor(score, maxScore) {
  const t = Math.min(score / maxScore, 1);
  const r = Math.round(255 * t);
  const g = Math.round(255 * (1 - t));
  const b = 0;
  return `rgb(${r}, ${g}, ${b})`;
}

async function renderTokens() {
  if (loading) return;
  loading = true;
  document.getElementById('loading').style.display = 'block';

  const tokens = await fetchTokens(start, limit);
  allTokens = [...allTokens, ...tokens];
  start += limit;

  console.log('Total tokens rendered:', allTokens.length);

  const maxVolume = Math.max(...allTokens.map(t => t.volume), 1);
  const maxMarketCap = Math.max(...allTokens.map(t => t.marketCap), 1);
  const maxHolders = Math.max(...allTokens.map(t => t.holders), 1);
  const maxScore = Math.max(
    ...allTokens.map(t => (t.volume / maxVolume + t.marketCap / maxMarketCap + t.holders / maxHolders) / 3),
    1
  );

  const tokenGrid = document.getElementById('token-grid');
  tokens.forEach(token => {
    const score = (token.volume / maxVolume + token.marketCap / maxMarketCap + token.holders / maxHolders) / 3;
    const color = calculateColor(score, maxScore);

    const card = document.createElement('div');
    card.className = 'col';
    card.innerHTML = `
      <div class="token-card" style="background-color: ${color};" data-issuer="${token.issuer}" data-currency="${token.name}" data-md5="${token.md5}">
        <div class="card-inner">
          <div class="card-front">
            <h5 class="card-title">
              <div class="logo-box">
                ${token.logo ? `
                  <img src="${token.logo}" class="token-logo" alt="${token.name} logo"
                    onerror="this.parentNode.innerHTML='<span class=\\'placeholder\\'>📄</span>';console.log('Logo failed for ${token.name}')">
                ` : `<span class="placeholder">📄</span>`}
              </div>
              ${token.name}
            </h5>
            <p class="card-text">Volume: ${token.volume.toLocaleString()}</p>
            <p class="card-text">Market Cap: ${token.marketCap.toLocaleString()}</p>
            <p class="card-text">Holders: ${token.holders.toLocaleString()}</p>
            <button class="flip-btn btn btn-sm btn-outline-light" onclick="flipCard(this)">More Info</button>
          </div>
          <div class="card-back">
            <h5 class="card-title">${token.name}</h5>
            <p class="card-text">Issuer: ${token.issuer || 'N/A'}</p>
            <p class="card-text">Price: <span class="price">Loading...</span></p>
            <p class="card-text">Total Supply: <span class="total-supply">Loading...</span></p>
            <p class="card-text">Circulating Supply: <span class="circulating-supply">Loading...</span></p>
            <p class="card-text">Description: <span class="description">Loading...</span></p>
            <p class="card-text">Top Holders: <span class="holders">Loading...</span></p>
            <p class="card-text">Order Book: <span class="order-book">Loading...</span></p>
            <button class="flip-btn btn btn-sm btn-outline-dark" onclick="flipCard(this)">Back</button>
          </div>
        </div>
      </div>
    `;
    tokenGrid.appendChild(card);
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    setTimeout(() => {
      card.style.transition = 'opacity 0.7s, transform 0.7s';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 100);
  });

  loading = false;
  document.getElementById('loading').style.display = 'none';
}

async function flipCard(button) {
  try {
    const card = button.closest('.token-card');
    console.log('Flip triggered, current state:', card.classList.contains('flipped') ? 'back' : 'front');
    card.classList.toggle('flipped');

    if (card.classList.contains('flipped')) {
      const issuer = card.dataset.issuer;
      const currency = card.dataset.currency;
      const md5 = card.dataset.md5;

      const priceSpan = card.querySelector('.price');
      const totalSupplySpan = card.querySelector('.total-supply');
      const circulatingSupplySpan = card.querySelector('.circulating-supply');
      const descriptionSpan = card.querySelector('.description');
      const holdersSpan = card.querySelector('.holders');
      const orderBookSpan = card.querySelector('.order-book');

      priceSpan.textContent = 'Fetching...';
      totalSupplySpan.textContent = 'Fetching...';
      circulatingSupplySpan.textContent = 'Fetching...';
      descriptionSpan.textContent = 'Fetching...';
      holdersSpan.textContent = 'Fetching...';
      orderBookSpan.textContent = 'Fetching...';

      const description = await fetchDescription(issuer, currency);
      const richList = await fetchRichList(md5);
      const offers = await fetchOffers(issuer);

      priceSpan.textContent = description.price ? `$${description.price.toFixed(6)}` : 'N/A';
      totalSupplySpan.textContent = description.totalSupply ? description.totalSupply.toLocaleString() : 'N/A';
      circulatingSupplySpan.textContent = description.circulatingSupply ? description.circulatingSupply.toLocaleString() : 'N/A';
      descriptionSpan.textContent = description.description || 'N/A';
      holdersSpan.textContent = richList.topHolders.length
        ? richList.topHolders.map(h => h.account.slice(0, 6) + '...').join(', ')
        : 'N/A';
      orderBookSpan.textContent = offers.orderBook.length
        ? `Bids/Asks: ${offers.orderBook.length}`
        : 'N/A';
    }
  } catch (error) {
    console.error('Error in flipCard:', error);
  }
}

window.addEventListener('scroll', () => {
  if (
    window.innerHeight + window.scrollY >= document.body.offsetHeight - 100 &&
    !loading
  ) {
    console.log('Triggering infinite scroll');
    renderTokens();
  }
});

renderTokens();