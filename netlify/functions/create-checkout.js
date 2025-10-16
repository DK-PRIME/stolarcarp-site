
// netlify/functions/create-checkout.js
import crypto from 'crypto'
import { Blobs } from '@netlify/blobs'

export default async (req, context) => {
  if (req.method !== 'POST')
    return new Response('Method Not Allowed', { status: 405 })

  const { provider, amount, currency, meta } = await req.json()

  // Створюємо унікальну сесію
  const sessionId = crypto.randomUUID()
  const store = new Blobs({ siteID: context.site.id })
  await store.set(`payments/${sessionId}.json`, JSON.stringify({
    provider, amount, currency, meta, paid: false, createdAt: Date.now()
  }))

  let checkoutUrl

  if (provider === 'monobank') {
    // Підключення Monobank checkout
    const merchantId = process.env.MONOBANK_MERCHANT_ID
    const success = new URL('/register.html', req.url)
    success.searchParams.set('return', '1')
    success.searchParams.set('sessionId', sessionId)

    checkoutUrl = `https://pay.monobank.ua/checkout?merchant=${encodeURIComponent(
      merchantId
    )}&amount=${amount}&ccy=${currency}&reference=${sessionId}&redirectUrl=${encodeURIComponent(
      success.toString()
    )}`
  } else {
    return new Response(
      JSON.stringify({ error: 'Unknown provider' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  return new Response(JSON.stringify({ checkoutUrl, sessionId }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
