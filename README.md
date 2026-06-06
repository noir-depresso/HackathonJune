# Star Trader

Star Trader is a compact space trading game about route planning, faction relationships, scarce supplies, random events, and bargaining with ship-based merchant factions.

## Run The Game

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Bargaining AI Endpoint

The bargaining screen can call an optional local AI endpoint. Put endpoint configuration in a local `.env` file:

```bash
VITE_BARGAINING_AI_ENDPOINT=/api/bargaining-ai
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_MODEL=gpt-4.1-mini
```

Do not commit `.env`. Use `.env.example` as the template. The Vite dev server exposes `/api/bargaining-ai` locally and uses `OPENAI_API_KEY` server-side, so the browser only sees `VITE_BARGAINING_AI_ENDPOINT`.

## How To Play

The goal is to survive as a merchant ship while improving wealth and influence.

- Each turn grants credits, but food, water, and fuel are consumed over time.
- If food, water, or fuel falls below its warning line, the game ends.
- Buy prices are always higher than sell prices at the same vendor.
- Profit comes from route planning, cargo limits, special offers, stocks, faction bonuses, and bargaining.
- Trades, gifts, pacts, alliances, random events, and completed bargains can change faction relationships.
- Stocks are linked to factions and goods. Prices move each day from drift, volatility, relationships, events, trades, and bargaining.

## Interface

- `STATUS` shows credits, income, location, active vendor, relationship, and cargo usage.
- `INVENTORY` shows essential supplies and trade cargo.
- `NETWORK / MARKET` shows local vendors and their prices.
- `NETWORK / LEDGER` summarizes faction relationships, allies, rivals, and hostiles.
- `NETWORK / BARGAIN` opens structured and natural-language faction negotiation.
- `NETWORK / STOCKS` shows faction-linked stock prices, portfolio value, leverage, and buy/sell controls.
- `DIPLOMACY` shows the active vendor faction, relationship tier, pact status, and nearby political effects.

## Useful Commands

You can use the buttons or type commands manually.

```text
status
market
ledger
bargain
tab bargain
stocks
stock buy vega_credit 1
stock sell vega_credit 1
leverage 2
buy ore 1
sell ore 1
vendor vega-vanto
gift 100
pact
alliance
travel sirius
end
clear
```

## Factions

All faction-aware systems use the same local faction IDs:

```text
vega_exchange
sirius_guild
nova_relief
free_caravans
dust_runners
```

The canonical relationship state is `state.diplomacy[factionId].relationship`, from `-100` to `100`. Bargaining keeps a separate `trust` value only as AI negotiation memory; it does not replace the main relationship system.

## Bargaining

The `BARGAIN` tab supports both the structured form and natural-language messages. A concrete accepted natural-language deal resolves immediately; counteroffers can be accepted with `Accept Counter`.

Example:

```text
I offer Nova 500 credits for 10 fuel as humanitarian support.
```

## Stocks

Available stock IDs:

```text
vega_credit
sirius_ore
nova_life
caravan_lux
dust_salvage
```
