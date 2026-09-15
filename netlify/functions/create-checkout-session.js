// netlify/functions/create-checkout-session.js
//
// Reçoit le panier envoyé par le site (liste d'id + quantité), vérifie que
// chaque produit existe (jamais confiance au prix envoyé par le navigateur),
// calcule le total avec la tarification par catégorie (savons : 7$/2 pour 11$,
// baumes/huile/sel d'Épsom : prix fixe), puis crée une session Stripe Checkout
// avec une seule ligne représentant la commande complète.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PAIR_PRICE_CENTS = 1100; // 2 savons pour 11,00 $
const UNIT_PRICE_CENTS = 700;  // 1 savon seul à 7,00 $

// Source de vérité des produits, prix (en cents) et admissibilité au rabais duo.
// À tenir synchronisé avec le catalogue affiché sur le site.
const CATALOG = {
  p1: { name: "Savon Eucalyptus & Marjolaine", price: 700, bundle: true },
  p2: { name: "Savon Arnica & Lavande", price: 700, bundle: true },
  p3: { name: "Savon Eucalyptus & Romarin", price: 700, bundle: true },
  p4: { name: "Baume Articulation Confort & Mobilité", price: 1400, bundle: false },
  p5: { name: "Baume Froid Menthol & Camphre", price: 1400, bundle: false },
  p6: { name: "Savon Sel d'Épsom & Genévrier", price: 1200, bundle: false },
  p7: { name: "Huile de massage Lavande", price: 1400, bundle: false },
  p8: { name: "Savon Lavande", price: 700, bundle: true },
  p9: { name: "Baume Nuque & Épaules", price: 1400, bundle: false },
  p10: { name: "Savon Gingembre & Poivre Noir", price: 700, bundle: true },
  p11: { name: "Savon Camphre & Pin Sylvestre", price: 700, bundle: true },
  p12: { name: "Savon Menthe & Camphre", price: 700, bundle: true },
  p13: { name: "Savon Menthe Poivrée & Eucalyptus", price: 700, bundle: true },
  p14: { name: "Baume Arnica & Harpagophytum", price: 1400, bundle: false },
  p15: { name: "Baume Chauffant Camphre & Eucalyptus", price: 1400, bundle: false }
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
    let bundleCount = 0;
    let flatCents = 0;
    let totalQty = 0;
    const descriptionParts = items.map(({ id, qty }) => {
      const product = CATALOG[id];
      const quantity = Number(qty) || 0;
      if (!product || quantity < 1) {
        throw new Error(`Article invalide dans le panier : ${id}`);
      }
      totalQty += quantity;
      if (product.bundle) {
        bundleCount += quantity;
      } else {
        flatCents += product.price * quantity;
      }
      return `${product.name} ×${quantity}`;
    });

    const bundlePairs = Math.floor(bundleCount / 2);
    const bundleRemainder = bundleCount % 2;
    const bundleCents = bundlePairs * PAIR_PRICE_CENTS + bundleRemainder * UNIT_PRICE_CENTS;
    const totalCents = bundleCents + flatCents;

    const origin = event.headers.origin || `https://${event.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'cad',
          product_data: {
            name: `Commande Répit Musculaire — ${totalQty} article${totalQty > 1 ? 's' : ''}`,
            description: descriptionParts.join(', ').slice(0, 500)
          },
          unit_amount: totalCents
        },
        quantity: 1
      }],
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
