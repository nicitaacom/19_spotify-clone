# Embed

## Pill

`/embed` shows one song in `components/MusicRecommendation.tsx`, mounted by `app/embed/EmbedClient.tsx`.

The name is `author — title`, or the title alone when the author is empty. It stays on one line. A longer name ends with an ellipsis. The full name is the link title.

The pill is black with a white 2px border. The page leaves padding above it so that top border and the close ear stay inside the frame. `libs/embedFrame.ts` sets the frame to 420 by 160.

The checkbox under the name is Never show again.
