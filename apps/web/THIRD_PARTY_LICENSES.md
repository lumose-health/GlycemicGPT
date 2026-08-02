# Third-Party Licenses

The GlycemicGPT web frontend redistributes the following third-party assets.
This file exists to credit the upstream authors and document the licenses
under which those assets are bundled with the project.

NPM runtime dependencies are covered by their respective licenses listed in
`package.json` lockfile metadata and are not re-listed here.

## Fonts

### Inter

- Project: https://github.com/rsms/inter
- Upstream release: https://rsms.me/inter/ (v4.1, 2024-11-16)
- License: SIL Open Font License 1.1 (`SIL OFL 1.1`)
- Copyright: Copyright (c) 2016 The Inter Project Authors

The Inter Variable font (`InterVariable.woff2`) is committed at
`apps/web/src/app/fonts/InterVariable.woff2` and is loaded via
`next/font/local` from `apps/web/src/app/layout.tsx`. The font is
redistributed unmodified from the upstream rsms/inter release.

A copy of the SIL OFL 1.1 license text is at
`apps/web/src/app/fonts/LICENSE.txt`.

This font was previously loaded via `next/font/google`, which made a
build-time HTTP request to `fonts.googleapis.com` on every Docker build.
That dependency was eliminated after the v0.8.0 web container release
build failed when Google Fonts was momentarily unreachable from a
GitHub Actions runner. See commit history on
`apps/web/src/app/layout.tsx` for the migration.

## Icons

### Lucide

Selected Lucide icon paths are bundled in
`apps/web/public/static_assets/iconSprite.svg`.

ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as
part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide
Contributors 2026.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

Portions derived from Feather are available under the MIT License.

Copyright (c) 2013-2026 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
