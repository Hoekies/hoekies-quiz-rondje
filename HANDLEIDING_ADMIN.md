# Handleiding Admin — Hoekies Quiz Rondje

## Inloggen

Ga naar: **https://hoekies-quiz-rondje.vercel.app/admin**

Log in met je e-mailadres en wachtwoord. Alleen admins hebben toegang tot het beheerpaneel.

---

## Menu-overzicht

| Menu-item | Wat doe je hier? |
|---|---|
| 🎮 Dashboard | Sessies aanmaken, activeren, beheren en live leiden |
| 📝 Vragen beheren | Vragen toevoegen, bewerken, importeren en rondes beheren |
| 🎨 Thema quiz | Logo en achtergrondafbeelding uploaden |
| 📖 Hulp | Deze handleiding online |

---

## 1. Quiz voorbereiden

### Standaard quizzen importeren
Onderaan **Vragen beheren** staat de knop **"Standaard quizzen importeren"**. Klik om vijf kant-en-klare rondes toe te voegen, elk met 5 vragen:

| Ronde | Onderwerp |
|---|---|
| Sport | WK, Tour de France, Formule 1, olympische ringen… |
| Muziek | Queen, ABBA, piano, Despacito… |
| Algemeen | hoofdsteden, planeten, regenboog… |
| Weer | thermometer, wolken, tornado… |
| TV | Breaking Bad, Simpsons, GTST, MasterChef… |

De antwoorden staan in **willekeurige volgorde** — het juiste antwoord staat dus niet altijd op A. De rondes worden *achter* bestaande rondes geplaatst; de import wist niets.

### Eigen vragen aanmaken
Ga naar **Vragen beheren → + Nieuwe vraag**. Er zijn **14 vraagtypen**:

| Type | Uitleg |
|---|---|
| 🖼️ Afbeelding als vraag | Toon een foto. Kies het antwoordtype (zie hieronder) |
| 🎵 Audio / raad het lied | Upload MP3, kies startpunt + duur (5/10s); speelt dat segment |
| 🌫️ Vervagend beeld | Beeld begint wazig en wordt scherper tijdens het aftellen |
| 🔍 Inzoomende afbeelding | Beeld begint sterk ingezoomd en zoomt langzaam uit |
| 🧩 Puzzelafbeelding | Beeld wordt tegel voor tegel zichtbaar |
| 🎬 Video als vraag | YouTube (startpunt + 5/10s) of MP4. Geluid aan/uit instelbaar; speelt op het presentatiescherm |
| 🖼️🖼️ Afbeelding als antwoord | 4 afbeeldingen als antwoordopties (2×2) |
| 🧩 Vier foto's, één antwoord | 4 foto's; speler typt het verbindende woord |
| 🔀 Anagram | Geschudde letters; speler typt het woord |
| ✏️ Gatentekst | Zin met `___`; speler typt het ontbrekende woord |
| 🕵️ Wie ben ik? | Hints verschijnen één voor één; sneller antwoorden = meer punten |
| 🎚️ Schatting (slider) | Getal raden; punten op basis van nabijheid |
| ✅ Meerdere juiste antwoorden | Speler kiest álle juiste opties (hele set goed = punten) |
| 🔗 Koppelen (match) | 3 items links koppelen aan 3 rechts (optioneel met afbeelding) |

### Antwoordtype kiezen (media-vragen)
Bij **afbeelding, audio, vervagend beeld, video, inzoomende afbeelding en puzzelafbeelding** kies je hoe er geantwoord wordt:
- **4 keuzes** — vier tekstopties A/B/C/D
- **Waar / Onjuist** — twee opties (geen snelheidsbonus)
- **Open vraag** — speler typt zelf (hoofdletters/spaties tellen niet mee)

### Juiste antwoord aanvinken
Bij meerkeuze en waar/onjuist markeer je het juiste antwoord met het **groene vinkje** naast de optie. Bij *Meerdere juiste antwoorden* vink je er meerdere aan.

### Afbeeldingen: croppen, inzoomen en URL plakken
Elke afbeelding kun je **uploaden** of als **URL plakken**, en daarna **vierkant bijsnijden / inzoomen** met de ✂️-knop. Plak je een Wikipedia-`File:`-pagina, dan wordt die automatisch omgezet naar de directe afbeelding. Geüploade/bijgesneden beelden worden blijvend opgeslagen (Cloudinary).

### Test deze vraag
Onderaan het vraagformulier staat **🧪 Test deze vraag**. Hiermee speel je de vraag interactief na — antwoorden, en meteen goed/fout + punten zien — zonder een sessie te starten.

### CSV importeren
Ga naar **Vragen beheren → ⬆️ Importeren**. Gebruik de export (⬇️) als sjabloon voor het juiste formaat.

### Rondes beheren
In **Vragen beheren** kies je een ronde-tab. Daar kun je de ronde **hernoemen** (Opslaan) of de hele **ronde verwijderen** (🗑️ Ronde verwijderen — wist alle vragen van die ronde).

### Thema instellen
Ga naar **Thema quiz** in het menu.
- **Logo**: upload een vierkant logo (1:1) met zoom + crop.
- **Achtergrond**: upload een achtergrondfoto voor het leaderboard en de inlogpagina.

---

## 2. Sessie aanmaken en starten

1. Klik op **+ Nieuwe sessie** op het dashboard.
2. Zet de toggle op **Actief** zodra je spelers wilt toelaten.
3. Bij de sessie staan de links **QR ↗**, **Presentatie ↗** en een **WhatsApp**-deelknop.
   - Spelers joinen via de QR-code of `https://hoekies-quiz-rondje.vercel.app/speel/CODE`.
   - Open **Presentatie ↗** op een beamer/groot scherm voor het publiek.
4. Wacht tot de spelers ingelogd zijn (je ziet het aantal live) en klik op **🚀 Start quiz**.

---

## 3. Tijdens de quiz

Elke vraag volgt dit patroon, met één knop die meebeweegt:

```
🚀 Start quiz → 🔒 Sluit antwoorden → 📊 Leaderboard → ➡ Volgende vraag → ...
```

| Knop | Actie |
|---|---|
| 🚀 Start quiz / Start volgende ronde | Volgende vraag of ronde laden |
| 🔒 Sluit antwoorden | Antwoorden sluiten en het juiste antwoord tonen |
| 📊 Leaderboard | Tussenstand tonen |
| ➡ Volgende vraag | Naar de volgende vraag |
| 🍺 Pauzeer | Pauzeren (10 sec aftelling bij hervatten) |
| ⏸ Stop na deze vraag | Quiz eindigt na het eerstvolgende leaderboard |
| 🏁 Beëindig spel | Toont direct de eindstand (sluit de sessie niet) |

De vraag sluit ook **automatisch** als de tijd om is of als iedereen geantwoord heeft. Bij het tonen van het antwoord zien speler en presentatie het **juiste antwoord** en de **antwoordverdeling**.

---

## 4. Afsluiten

Na de laatste vraag (of na **Beëindig spel**) verschijnt het eindscherm bij alle spelers: de winnaar groot in beeld, top 3 met medailles, en ieders eigen score. De sessie blijft open — je sluit hem zelf via de toggle (inactief) of verwijdert hem.

### Sessie resetten
**🗑 Resetten** zet alle scores op 0, wist alle antwoorden en **logt alle spelers uit** (ze moeten opnieuw joinen).

---

## 5. Puntensysteem

| Situatie | Punten |
|---|---|
| Goed antwoord (basis) | 100 |
| Snelheidsbonus (maximaal) | +50 |
| Bonus (2×) | Alles × 2 |
| Schatting | Naar nabijheid van het juiste getal |
| Waar / Onjuist | Geen snelheidsbonus |
| Meerdere juiste antwoorden | Hele juiste set = punten, anders 0 |
| Fout antwoord | 0 |

De snelheidsbonus neemt lineair af: hoe later je antwoordt binnen de tijdslimiet, hoe minder bonus. Zet **Bonus (2×)** aan voor een dubbele-puntenvraag.

---

## Problemen oplossen

**Speler ziet de sessie als inactief** — controleer of de toggle op **Actief** staat.

**Speler kan niet joinen (naam al bezet)** — elke naam kan maar één keer per sessie. Kies een andere naam.

**Afbeelding-preview blijft leeg** — de URL is geen directe afbeelding (bv. een webpagina), of de bron staat geen weergave toe. Upload het bestand, of gebruik een directe afbeeldingslink.

**Croppen van een externe URL lukt niet** — sommige bronnen staan bewerking niet toe. Upload het bestand dan gewoon.

**Video speelt geen geluid op de telefoon** — dat klopt: video speelt op het **presentatiescherm**; op de telefoon zie je "kijk naar het grote scherm".

---

*Hoekies Quiz Rondje — Design Hoekies 2026*
