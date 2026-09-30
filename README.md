# GameScope — Live Price + Reviews Edition

## What this version adds

- Live Steam price refresh using Steam's public store app-details endpoint.
- A normalized external price-feed adapter for Xbox, Nintendo, PlayStation and Oculus/Meta.
- Clear `LIVE` vs `FALLBACK` labels so stale/demo prices are never presented as current.
- Daily-refresh-ready architecture: point `PRICE_FEED_URL` at your own scheduled JSON feed.
- Shared user reviews and 1–5 star ratings through the included Node API.
- Search, platform, country, sale and sorting filters.
- Vertical console-store-style cards.

## Run locally

Requires Node.js 18+.

```bash
npm start
```

Then open:

http://localhost:3000

## Live console prices

There is not one universal public official API that provides all five stores. The server therefore supports a normalized feed you control.

Set:

```bash
PRICE_FEED_URL=https://your-domain.example/prices.json
```

The endpoint should return:

```json
{
  "games": [
    {
      "id": "xbox-example-123",
      "title": "Example Game",
      "platform": "Xbox",
      "country": "US",
      "price": 19.99,
      "regularPrice": 39.99,
      "discount": 50,
      "currency": "USD",
      "image": "https://...",
      "url": "https://...",
      "source": "live-feed"
    }
  ]
}
```

Your scheduled job can regenerate that JSON daily or more often from whatever store-approved feeds/APIs you have permission to use.

## Reviews

Reviews are stored in `data/reviews.json`. This is suitable for a simple Node deployment with persistent storage. A serverless/free host that does not persist local files should use a database adapter instead.

## Important

Do not scrape a store in a way that violates that store's terms. For production use, replace the normalized feed with approved APIs/feeds or direct store partnerships where required.


## GameScope accounts

The site now supports:
- account creation and login
- password hashing with Node's built-in `scrypt`
- 30-day HTTP-only sessions
- reviews tied to the logged-in GameScope username
- every review shows the platform/version being reviewed (for example, `Xbox`)
- guests can read reviews but must log in to post

For a production deployment, use HTTPS and move users/sessions/reviews to a proper database rather than local JSON files.


## Render deployment

See `DEPLOY_TO_RENDER.md` for the free Render setup. `render.yaml` contains the basic web-service configuration.
