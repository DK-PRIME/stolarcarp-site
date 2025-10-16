
export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    // Безпечне парсення тіла
    let amount = 0, currency = 'UAH', meta = {};
    try {
      const data = JSON.parse(event.body || '{}');
      amount = data.amount || 0;
      currency = data.currency || 'UAH';
      meta = data.meta || {};
    } catch (e) {
      console.error('JSON parse error:', e);
    }

    // Створюємо тестову "сесію"
    const sessionId = 'test_' + Math.random().toString(36).slice(2);
    const checkoutUrl = `/register.html?return=1&sessionId=${encodeURIComponent(sessionId)}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutUrl,
        sessionId,
        amount,
        currency,
        meta
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error', message: error.message })
    };
  }
}
