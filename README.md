<div align="center">
  <img src="public/logo-vierkant.png" alt="Hoekies Quiz Rondje" width="160" />

  # Hoekies Quiz Rondje

  De nostalgische borrelquiz voor vrienden — een real-time, multiplayer quizspel in Kahoot-stijl.

  [![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
  [![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?logo=firebase)](https://firebase.google.com)
  [![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?logo=vercel)](https://hoekies-quiz-rondje.vercel.app)
</div>

---

## Over het project

Hoekies Quiz Rondje is een zelf-gehoste quizapp waarmee een host (admin) live quizzen leidt en spelers via hun telefoon meedoen. Spelers scannen een QR-code of openen een link, kiezen een avatar en naam, en beantwoorden vragen in real-time. Hoe sneller je antwoordt, hoe meer punten — met een live leaderboard, antwoordverdeling en een feestelijk winnaarsscherm.

**Live:** [hoekies-quiz-rondje.vercel.app](https://hoekies-quiz-rondje.vercel.app)

## Functies

- **Real-time synchronisatie** — vragen verschijnen direct op alle telefoons via Firestore listeners
- **14 vraagtypen** — afbeelding, audio (raad het lied), vervagend beeld, inzoomende afbeelding, puzzelafbeelding, video, afbeelding-als-antwoord, vier-foto's-één-antwoord, anagram, gatentekst, "wie ben ik?" (hints), schatting (slider), meerdere juiste antwoorden en koppelen (match)
- **Flexibel antwoordtype** — bij elke media-vraag (afbeelding, audio, beeld, video, inzoom, puzzel) kies je: 4 keuzes, waar/niet-waar of open vraag (vrij typen)
- **Juiste antwoord aanvinken** — markeer het correcte antwoord met een groen vinkje (meerdere bij "meerdere juiste antwoorden")
- **Croppen & inzoomen** — elke afbeelding (upload óf geplakte URL) is vierkant bij te snijden en in te zoomen; Wikipedia `File:`-pagina's worden automatisch omgezet
- **Test deze vraag** — speel een vraag interactief na in het formulier (antwoorden + scoring) zonder sessie
- **Video met of zonder geluid** — per videovraag instelbaar; de video speelt op het presentatiescherm
- **Afteltimer & geluidseffecten** — synchrone countdown plus WebAudio-effecten (tik, goed/fout, fanfare)
- **Antwoordverdeling & juiste antwoord** — bij het tonen van het antwoord per optie het percentage stemmen, met het juiste antwoord groen
- **Rondes** — vragen in rondes, met hernoemen en per-ronde verwijderen
- **Speler-avatars** — kies een emoji bij het meedoen
- **Snelheidsgebaseerde punten** — sneller antwoorden levert meer punten op, met bonusvragen voor dubbele punten
- **Sessiebeheer** — meerdere sessies in concept, activeren/deactiveren via toggle, live leiden vanaf het dashboard
- **QR-code, presentatiescherm & WhatsApp** — spelers uitnodigen en het spel op een beamer tonen
- **Thema** — eigen vierkant logo (met crop) en achtergrondafbeelding
- **Standaard quizzen** — 5 kant-en-klare rondes (Sport, Muziek, Algemeen, Weer, TV — 5 vragen elk, antwoorden in willekeurige volgorde)
- **CSV import/export** — vragen in bulk beheren via Excel
- **Winnaarsscherm** met confetti

## Tech stack

| Onderdeel | Technologie |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, CSS (glass-morphism) |
| Database | Firebase Firestore (regio `eur3`) |
| Auth | Firebase Authentication |
| Media-opslag | Cloudinary (unsigned upload — logo, achtergrond, afbeeldingen, audio, video) |
| Hosting | Vercel |
| Beeldbewerking | react-image-crop |
| Geluid | WebAudio API (synth, geen bestanden) |
| QR-codes | qrcode |

## Aan de slag

### Vereisten

- Node.js 20+
- Een Firebase-project met Firestore en Authentication ingeschakeld
- Een Cloudinary-account met een unsigned upload-preset (voor media; Firebase Storage is niet nodig)

### Installatie

```bash
git clone https://github.com/Hoekies/hoekies-quiz-rondje.git
cd hoekies-quiz-rondje
npm install
```

### Omgevingsvariabelen

Kopieer `.env.local.example` naar `.env.local` en vul de Firebase-gegevens in:

```bash
cp .env.local.example .env.local
```

```env
# Firebase client (publiek)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (server-side, geheim)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

> De `FIREBASE_PRIVATE_KEY` haal je uit een Firebase service-account JSON. Houd deze geheim. De Cloudinary cloud-naam en upload-preset staan in `lib/media.ts`.

### Firebase rules deployen

```bash
firebase deploy --only firestore:rules --project <jouw-project-id>
```

### Admin-rol toekennen

Admins worden herkend aan de custom claim `rol: "admin"`. Ken deze toe via de Firebase Admin SDK:

```js
await admin.auth().setCustomUserClaims(uid, { rol: "admin" });
```

### Ontwikkelserver

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Routes

| Route | Beschrijving |
|---|---|
| `/admin` | Dashboard — sessies beheren en live leiden, leaderboard |
| `/admin/login` | Inloggen voor de host |
| `/admin/quiz` | Vragen beheren (CRUD, CSV, rondes) |
| `/admin/quiz/vraag` | Vraag aanmaken/bewerken (met crop + test) |
| `/admin/thema` | Logo + achtergrond uploaden |
| `/admin/handleiding` | Online handleiding ("Hulp") |
| `/admin/sessie/[code]` | Live sessiebesturing |
| `/speel/[code]` | Spelerscherm |
| `/presentatie/[code]` | Presentatiescherm (beamer) |
| `/qr/[code]` | QR-code op volledig scherm |
| `/instructies` | Speler-instructies |

## Documentatie

- [Handleiding voor admins](HANDLEIDING_ADMIN.md)
- [Instructies voor spelers](INSTRUCTIES_SPELER.md)

## Puntensysteem

| Situatie | Punten |
|---|---|
| Goed antwoord (basis) | 100 |
| Snelheidsbonus (max) | +50 |
| Bonusvraag (2×) | × 2 |
| Schatting | naar nabijheid van het juiste getal |
| Waar / Onjuist | geen snelheidsbonus |
| Meerdere juiste antwoorden | hele juiste set = punten, anders 0 |
| Fout antwoord | 0 |

## Projectstructuur

```
src/app/
├── admin/              # Beheerpaneel (host)
│   ├── quiz/           # Vraagbeheer
│   │   └── vraag/      # Vraagformulier + interactief voorbeeld
│   ├── thema/          # Logo + achtergrond
│   ├── handleiding/    # Online hulp
│   └── sessie/[code]/  # Live sessiebesturing
├── speel/[code]/       # Spelerscherm
├── presentatie/[code]/ # Beamerscherm
├── qr/[code]/          # QR fullscreen
├── instructies/        # Speler-uitleg
└── api/                # Server-side routes (host + speler)
lib/                    # Firebase config, Cloudinary-upload, geluid, tekst-helpers
types/                  # TypeScript types
```

---

<div align="center">
  <sub>Design Hoekies 2026</sub>
</div>
