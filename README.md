# Star Trader

Star Trader is a small space trading game about route planning, faction reputation, market timing, and persuasive bargaining. You buy and sell cargo, keep essential supplies alive, and negotiate with faction personalities that evaluate both the numbers and the tone of your proposal.

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

## API Key

Put the real API key in a local `.env` file at the project root:

```bash
OPENAI_API_KEY=sk-your-key-here
VITE_BARGAINING_AI_ENDPOINT=/api/bargaining-ai
```

Do not commit `.env`. Use `.env.example` as the template. The browser code calls `VITE_BARGAINING_AI_ENDPOINT`; the actual `OPENAI_API_KEY` should be used by a backend or serverless endpoint, not exposed directly in frontend code.

## How To Play

The goal is to survive as a merchant ship while growing wealth and influence.

- Credits buy supplies, cargo, gifts, trade pacts, and alliances.
- Food, water, and fuel are consumed over time. Keep them above warning lines.
- Fuel is also spent when traveling between ports.
- Cargo has limited capacity, so every purchase has an opportunity cost.
- Buy prices are higher than sell prices at the same vendor. Profit comes from route planning, faction bonuses, special offers, and negotiation.

## Interface

- `COMMS` shows story text, chat, events, and negotiation responses.
- `ACCOUNT` records every mechanical change, including credits, supplies, cargo, reputation, travel fuel, alliances, and completed bargains.
- `STOCKS` shows market prices, daily gains/losses, portfolio value, leverage, and line graphs.
- `MARKET` shows local vendors, prices, stock, and the active counterparty.
- `LEDGER` summarizes faction relationships and political effects.
- `BARGAIN` opens faction negotiation.
- The `i` button in the header opens the in-game information screen.

## Useful Commands

You can use the buttons or type commands manually.

```text
status
market
ledger
bargain
stocks
buy ore 1
sell ore 1
stock buy vega_credit 1
stock sell vega_credit 1
leverage 2
vendor vega-vanto
gift 100
travel sirius
end
clear
```

## Bargaining

Bargaining supports natural language offers and faction-flavored chat.

Example:

```text
I offer Nova 500 credits for 10 fuel as humanitarian support.
```

Deals can be credit for item, item for credit, item for item, or mixed bundles. The game checks the real inventories and calculated values before applying the result. Impossible claims or false leverage can damage reputation and trust. Accepted natural-language deals apply immediately; counteroffers wait for `Accept Counter`.

Faction responses are shaped by personality, ideology, political stance, reputation, trust, tone, and whether the deal helps or harms their civilization.

## Stock Market

The stock market uses actual game variables and numbers, not only AI narration. Each stock has a different base price, sector, drift, volatility, and price history.

- Prices update each day.
- Movement is affected by random volatility, faction reputation, random events, travel, normal trade, gifts, alliances, and completed bargaining deals.
- Buying stocks spends credits immediately.
- Selling stocks returns credits based on the current price, average entry price, and leverage.
- Leverage can be set to `1`, `2`, or `3`. Higher leverage lowers the entry cost, but magnifies gains and losses when selling.

Available stock ids:

```text
vega_credit
sirius_ore
nova_life
caravan_lux
dust_salvage
```
