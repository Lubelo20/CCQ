# CCQ Fundraising Golf Day — Golfers' Guide

Static golfers' guide for the CCQ Fundraising Golf Day (3rd Edition), hosted by the Congregational Church of Queensburgh: Friday 23 October 2026, Amanzimtoti Golf Course, 11h00 tee-off. The website lives in `dist/` and requires no packages, database, API keys or backend. Copied from the Icebolethu golf day guide and rebranded; the Icebolethu project is untouched.

## Check locally

Run `node scripts/check.mjs` from this directory. To preview over HTTP, run `python3 -m http.server 8765 --directory dist` and visit `http://localhost:8765`.

## Deploy

Push this directory to its own GitHub repository and import it into Vercel as a new project (framework Other). `vercel.json` runs the checks and serves `dist/`. The link-preview image and the draw link assume the URLs `ccq-golf-day.vercel.app` (guide) and `ccq-golf-draw.vercel.app` (draw); update `dist/index.html` if the projects get different names.

## Content

All event details come from the client's flyer (21 October 2026): date, venue, 11h00 tee-off, Betterball format, R2 000 per four-ball, benefits (green fees, halfway house, prize-giving, dinner), Standard Bank details and RSVP to Queen Mtshali on 065 169 9788. The CCQ logo (`dist/assets/ccq-logo-light.png`) was cut from the flyer; replace it with an original file when the client supplies one. Countdown dates are in `dist/countdown.js`.

The dress code (white golf T-shirt, black pants) was confirmed by the client on 21 October 2026. The guide is published on the draw site at `/info/`: after editing `dist/`, run `npm run sync:guide` in `../draw`.

Hole sponsors (client, 21 October 2026): hole 1 Mnandi Meats and LCM Ludidi Properties, hole 12 Isiqu Accountants (Hole in One; logo from isiquaccountants.co.za, recoloured teal), hole 18 Ndabe Funeral. Logos are in `dist/assets/sponsors/`.

On-course competitions (client, 21 October 2026): nearest to the pin hole 7 men, hole 9 ladies; longest drive hole 3 men, hole 10 ladies.

Not yet supplied, so not on the page: registration time, schedule after tee-off, venue address and an email contact.

Brand colours: deep green `#0f2a1d`, gold `#b8902f`.
