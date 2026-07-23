// netlify/functions/create-checkout-session.js
//
// Reçoit le panier envoyé par le site (liste d'id + quantité), retrouve le
// vrai prix de chaque produit côté serveur (jamais confiance au prix envoyé
// par le navigateur), puis crée une session Stripe Checkout et retourne son
// URL pour rediriger le client vers la page de paiement hébergée par Stripe.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Source de vérité des produits et prix (en cents CAD).
// À tenir synchronisé avec le catalogue affiché sur le site.
const CATALOG = {
  p1: { name: "Savon Gaulthérie & Menthol", price: 1450 },
  p2: { name: "Savon Arnica & Lavande", price: 1300 },
  p3: { name: "Savon Eucalyptus & Romarin", price: 1350 },
  p4: { name: "Baume Chaud Gingembre & Poivre", price: 1800 },
  p5: { name: "Baume Froid Menthol & Camphre", price: 1800 },
  p6: { name: "Savon Sel d'Épsom & Genévrier", price: 1500 },
  p7: { name: "Huile de massage Arnica", price: 2200 },
  p8: { name: "Savon Curcuma & Bois de Santal", price: 1400 },
  p9: { name: "Baume Nuque & Épaules", price: 1750 }
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Méthode non autorisée.' }) };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Clé Stripe manquante côté serveur (variable STRIPE_SECRET_KEY)." }) };
  }

  let items;
  try {
    ({ items } = JSON.parse(event.body || '{}'));
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Corps de requête invalide.' }) };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Le panier est vide.' }) };
  }

  try {
    const line_items = items.map(({ id, qty }) => {
      const product = CATALOG[id];
      const quantity = Number(qty) || 0;
      if (!product || quantity < 1) {
        throw new Error(`Article invalide dans le panier : ${id}`);
      }
      return {
        price_data: {
          currency: 'cad',
          product_data: { name: product.name },
          unit_amount: product.price
        },
        quantity
      };
    });

    const origin = event.headers.origin || `https://${event.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      shipping_address_collection: { allowed_countries: ['CA'] },
      success_url: `${origin}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/index.html#boutique`
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (err) {
    console.error('Erreur création session Stripe :', err.message);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
