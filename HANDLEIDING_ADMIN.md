# Handleiding Admin — Hoekies Quiz Rondje

## Inloggen

Ga naar: **https://hoekies-quiz-rondje.vercel.app/admin**

Log in met je e-mailadres en wachtwoord. Alleen admins hebben toegang tot het beheerpaneel.

---

## Menu-overzicht

| Menu-item | Wat doe je hier? |
|---|---|
| 🎮 Dashboard | Sessies aanmaken, activeren en beheren |
| 📝 Vragen beheren | Vragen toevoegen, bewerken en importeren |
| 🎨 Thema | Logo en achtergrondafbeelding uploaden |
| ⚙️ Instellingen | WhatsApp-uitnodigingstekst aanpassen |
| 📖 Handleiding | Deze handleiding online |

---

## 1. Quiz voorbereiden

### Standaard quizzen importeren
Op het dashboard staat de knop **"Standaard quizzen importeren"**. Klik eenmalig om drie kant-en-klare quizzen te laden:
- **Sport jaren 90/2000** — 20 vragen
- **Algemene Kennis jaren 90/2000** — 20 vragen
- **Muziek jaren 90/2000** — 20 vragen

### Eigen vragen aanmaken
Ga naar **Vragen beheren → + Nieuwe vraag**.

Beschikbare vraagtypen:

| Type | Uitleg |
|---|---|
| Multiple choice | 4 tekstopties A/B/C/D |
| Waar / Niet waar | 2 opties, geen snelheidsbonus |
| Afbeelding als vraag | Foto getoond, tekstantwoorden |
| Audio als vraag | Audioclip, tekstantwoorden |
| Raad het lied | Auto-play 5 of 10 sec, dan stop |
| Video als vraag | YouTube of MP4, tekstantwoorden |
| Vervagend beeld | Beeld wordt stapsgewijs scherper |
| Afbeelding als antwoord | 4 plaatjes als antwoordopties |
| Schatting (slider) | Getal raden, punten op nabijheid |
| Koppelen (match) | 3 items links koppelen aan 3 rechts |

### CSV importeren
Ga naar **Vragen beheren → Importeren (CSV)**. Gebruik de exportfunctie als sjabloon voor het juiste formaat.

### Thema instellen
Ga naar **Thema** in het menu.
- **Logo**: Upload een vierkant afbeelding (1:1). Gebruik de zoom-slider en de crop om de juiste uitsnede te kiezen.
- **Achtergrond**: Upload een landschapsfoto. Wordt getoond op het leaderboard en de inlogpagina.

---

## 2. Sessie aanmaken en starten

### Sessie aanmaken
1. Klik op **+ Nieuwe sessie** op het dashboard
2. De sessie staat standaard op **Inactief**
3. Zet de toggle op **Actief** als je spelers wilt toelaten

### Spelers uitnodigen
- Klik op **"Uitnodigen via WhatsApp"** in de sessiepagina (groene knop)
- Of deel de code en laat spelers gaan naar: `https://hoekies-quiz-rondje.vercel.app/speel/CODE`
- De WhatsApp-tekst aanpassen doe je via **Instellingen** in het menu

### Quiz starten
1. Ga naar **Beheren →** bij je sessie
2. Wacht tot alle spelers ingelogd zijn (je ziet het aantal live)
3. Klik op **🚀 Start quiz**

---

## 3. Tijdens de quiz

### Stap-voor-stap vloer
Elke ronde volgt dit patroon:

```
Start quiz → Vraag open → Sluit antwoorden → Leaderboard → Volgende vraag → ...
```

| Knop | Actie |
|---|---|
| 🚀 Start quiz | Eerste vraag laden |
| 🔒 Sluit antwoorden | Geen nieuwe antwoorden meer |
| 📊 Leaderboard | Tussenstand tonen |
| ➡ Volgende vraag | Naar de volgende vraag |
| 🍺 Pauzeer | Vraag pauzeren (10 sec aftelling bij hervatten) |

### Laatste vraag markeren
Klik op **"Stop na deze vraag"** (oranje knop). De quiz eindigt na het eerstvolgende leaderboard — ook als er nog vragen over zijn.

Vlak voor de laatste vraag zien spelers automatisch een motivatiescherm met hun huidige positie.

### Presentatiescherm
Open `/presentatie/CODE` op een groot scherm of beamer. Dit scherm toont de vragen, antwoordopties en leaderboard voor het publiek.

---

## 4. Afsluiten

Na de laatste vraag verschijnt automatisch het eindscherm bij alle spelers met:
- De winnaar groot in beeld
- Top 3 met gouden, zilveren en bronzen medaille
- Eigen score en positie

### Sessie resetten
Klik op **"Sessie resetten"** in de sessiepagina. Dit:
- Zet alle scores op 0
- Wist alle antwoorden
- Stuurt alle spelers terug naar het join-scherm

### Meerdere sessies beheren
Op het dashboard kun je meerdere sessies tegelijk hebben. Via de globale actieknop:
- **"Alle sessies inactief"** — zet alle sessies in één keer op inactief
- **"X sessies stoppen"** — sluit alle actieve sessies af

---

## 5. Puntensysteem

| Situatie | Punten |
|---|---|
| Goed antwoord (basis) | 100 punten |
| Snelheidsbonus (maximaal) | +50 punten |
| Dubbele punten (finale vraag) | Alles × 2 |
| Schatting exact goed | 100 punten |
| Schatting ver ernaast | 0 punten |
| Waar/Niet waar (geen snelheidsbonus) | 100 punten |
| Fout antwoord | 0 punten |

De snelheidsbonus neemt lineair af: hoe later je antwoordt binnen de tijdslimiet, hoe minder bonus.

---

## Problemen oplossen

**Speler ziet de sessie als inactief:**
Controleer of de toggle op het dashboard op **Actief** staat.

**Speler kan niet joinen (naam al bezet):**
Elke naam kan maar één keer voorkomen per sessie. De speler moet een andere naam kiezen.

**WhatsApp-knop niet zichtbaar:**
De knop staat in de sessiepagina naast de QR- en presentatielinks.

**Thema wordt niet geladen:**
Controleer of Firebase Storage correct geconfigureerd is en de regels toestaan.

---

*Hoekies Quiz Rondje — Design Hoekies 2026*
