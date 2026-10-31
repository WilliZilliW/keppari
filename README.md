# 🐴 Keppari VR – Esteratsastus ratsastajan silmin

3D-VR-peli, jossa ratsastat keppihevosella esteradan **ensimmäisestä persoonasta** – juuri niin kuin itse olisit radalla.
Toimii Android-puhelimella ja halvoilla puhelin-VR-laseilla (Google Cardboard -tyyppiset), sekä tavallisella näytöllä.

## Pelaa
Avaa GitHub Pages -osoite puhelimen Chromella:
`https://willizilliw.github.io/keppari/`

1. Kirjoita nimesi ja valitse tapa pelata:
   - **🥽 Pelaa VR-laseilla** (WebXR) tai **📱 Puhelin-VR (Cardboard-tila)** – puhelin vaakatasossa VR-laseihin
   - **🤳 Pelaa kännykällä / ruudulla** – ilman laseja, pysty- tai vaaka-asennossa
2. Valitse luokka ja keppihevonen (VR:ssä katsomalla nappia hetken, kännykällä napauttamalla).
3. Kokeile valikon **hyppytestiä**: hyppää (VR) tai heilauta puhelinta (kännykkä) – näet heti, tunnistuiko.
4. Lähtöpaikalla **tervehdi tuomaria** napauttamalla → kello soi → 45 s aikaa ylittää lähtölinja.

| Toiminto | VR-lasit | Kännykkä ilman laseja | Tietokone |
|---|---|---|---|
| Ohjaus | katso minne haluat mennä | vedä sormella | hiiri / A, D |
| **Hyppy** | **hyppää oikeasti itse** | **heilauta puhelinta ylös** | välilyönti / klikkaus |
| Hidasta | katso alas maahan | 🐢 Hidasta-nappi | S |
| Valikko | katso nappia ~1 s | napauta | klikkaa |

Hyppy tunnistetaan puhelimen kiihtyvyysanturilla: VR-laseissa ponnistus ja sitä seuraava hetken vapaa pudotus
(kävely ja pään liikkeet eivät laukaise hyppyä), kännykällä nopea heilautus. Voimakkaampi hyppy nostaa hieman korkeammalle.
Jos anturi ei vastaa, peli siirtyy napautukseen ja kertoo siitä. Napautuksen voi myös valita itse valikosta.

## Säännöt
Pelin säännöt perustuvat **Suomen Keppihevosharrastajat ry:n** dokumenttiin *Esteratsastus – ohjeet & säännöt* (päivitetty 4.1.2023):

- Puomin pudotus, muurin hajottaminen: **4 vp**
- Kielto, ohiratsastus, ylimääräinen voltti: **4 vp** – toinen tottelemattomuus = **hylkäys**
- Kielto sarjaesteellä → koko sarja hypätään uudelleen
- Vesihaudan koskettaminen: **4 vp**
- Huomattava määrä raviaskeleita: **4 vp**
- Enimmäisajan ylitys: **1 vp jokaisesta alkavasta 4 sekunnista** (uusinnassa 1 vp / alkava sekunti)
- Hylkäys: väärä este tai suunta, kaksinkertainen enimmäisaika, lähtö yli 45 s kellosta, esteen hyppääminen ennen lähtöä
- Arvostelu **A.2.0** (virhepisteet, sitten aika); Grand Prix **A.2.1** (puhtaat ratsukot uusintaan)

## Luokat
Ristikot 30 cm → 50 cm → 70 cm (vesihauta) → 90 cm (trippeli) → **110 cm Grand Prix** uusinnalla.
Kuusi keppihevosta: Tuulispää, Salama, Lumikki, Musti, Kaneli ja yksisarvinen Usva.

## Tekniikka
- Three.js (mukana `vendor/`-kansiossa, ei ulkoisia latauksia) + WebXR
- Cardboard-varatila: oma stereorenderöinti + puhelimen asentoanturi (toimii myös ilman WebXR:ää)
- Kaikki grafiikka ja äänet tehdään koodilla (canvas-tekstuurit, Web Audio -synteesi, suomenkielinen kuuluttaja puhesynteesillä)
- Testaus: `index.html?sim&auto&cls=2&runs=3` ajaa automaattiohjaajan radan läpi ilman piirtoa ja tulostaa tulokset konsoliin

## Julkaisu (GitHub Pages)
Repossa on valmis työnkulku `.github/workflows/pages.yml`, joka julkaisee pelin jokaisella pushilla.
Kerran tehtävä asetus: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Paikallisesti: `python3 -m http.server` ja avaa `http://localhost:8000`.
(WebXR vaatii https-yhteyden – GitHub Pages hoitaa sen.)
