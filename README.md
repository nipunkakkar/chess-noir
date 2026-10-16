# Chess Noir

A chess table for two with a focused charcoal interface, green-and-ivory or classic warm boards, original Staunton-style pieces, and animated moves.

**[Play Chess Noir](https://nipunkakkar.github.io/chess-noir/)** · [All the games](https://nipunkakkar.github.io/)

- Play on one device, or create a private online room and share the invitation link or 10-character code.
- Legal moves, castling, en passant, four promotion choices, check and checkmate.
- Automatic draws for stalemate, insufficient material, threefold repetition and the fifty-move rule. Players can also agree to a draw or resign.
- Untimed games, 10-minute rapid, 5+3 blitz, or 15+10 leisurely games. Clocks start after White’s first move.
- Move history, captured pieces, board flipping and PGN downloads.
- Green and classic orange-brown board themes, with your choice remembered on this device.
- Wooden move and capture sounds, plus distinct cues for check, castling, promotion and game end. Sound is on after your first interaction; use **Sound on/off** to mute. Your mute choice is remembered.
- Local takebacks and saved same-device games. Responsive layout, touch, keyboard controls and reduced-motion support.

## Private rooms

Choose **New game → Create room**. The host plays White; their friend opens the invitation or chooses **Join room** to play Black. The first guest occupies the second seat. The room is not listed publicly.

Keep the host’s tab open. The host validates moves and owns the clock; a disconnect pauses the game. Use **Reconnect** after connection loss. Guests can reload and rejoin their seat in the same tab. Reloading or closing the host’s tab ends the hosted session; create another room to play again. Online rematches use a fresh invitation, and online takebacks are disabled.

Rooms use the public [itty-sockets](https://github.com/kwhitley/itty-sockets) WebSocket relay (`itty.ws`). Room availability depends on that service. Room traffic includes player names and moves; use nicknames. Same-device games need no external service once the page has loaded.

## Development

Requires Node.js 22 or later. The runtime libraries and licenses are included under `vendor/`, so starting the site needs no dependency installation or build.

```sh
npm run dev
npm test
npm run check
```

Open http://127.0.0.1:5066/. The tests cover the game rules, time controls and room protocol.

## GitHub Pages

Publish the root of the `main` branch. All asset paths are relative and `.nojekyll` enables plain static serving. There are no API keys, accounts, build steps or paid hosting requirements.

Rules: [chess.js 1.4.0](https://github.com/jhlywa/chess.js), BSD-2-Clause. Relay client: itty-sockets 0.9.3, MIT. Their licenses are in `vendor/`. The interface and piece artwork are original.
