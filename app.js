// n8n-Adresse ermitteln: aus dem Link (?api=...) oder localhost beim Entwickeln
const WEBHOOK_PFAD = "/webhook-test/rechner";

function ermittleWebhookUrl() {
  const api = new URLSearchParams(window.location.search).get("api");

  // Kein ?api= im Link: am eigenen PC localhost, sonst keine Adresse
  if (!api) {
    const istLokal = location.hostname === "127.0.0.1" || location.hostname === "localhost";
    return istLokal ? "http://localhost:5678" + WEBHOOK_PFAD : null;
  }

  // Nur Tunnel-Adressen erlauben (Schutz vor fremden Seiten)
  try {
    const url = new URL(api);
    const erlaubt = url.protocol === "https:" && url.hostname.endsWith(".trycloudflare.com");
    return erlaubt ? url.origin + WEBHOOK_PFAD : null;
  } catch (e) {
    return null;
  }
}

const WEBHOOK_URL = ermittleWebhookUrl();
console.log("n8n-Adresse:", WEBHOOK_URL ?? "keine (KI-Ideen offline)");

// Annahmen (Schätzwerte): Anteil der Zeit, der sich automatisieren lässt
const AUTOMATISIERUNGSGRAD = {
  vertrieb: 0.4,
  marketing: 0.5,
  kundenservice: 0.5,
  buchhaltung: 0.6,
  sonstiges: 0.3,
};
const ARBEITSWOCHEN_PRO_JAHR = 46;

// Pure Function: rechnet nur, liest und ändert nichts auf der Seite
function berechnePotenzial({ stunden, personen, stundensatz, bereich }) {
  const grad = AUTOMATISIERUNGSGRAD[bereich] ?? 0.3;
  const stundenProJahr = stunden * personen * ARBEITSWOCHEN_PRO_JAHR;
  const gesparteStunden = Math.round(stundenProJahr * grad);
  const gesparteEuro = Math.round(gesparteStunden * stundensatz);

  return {
    stundenProJahr,
    grad,
    gesparteStunden,
    gesparteEuro,
  };
}

// Anzeige: schreibt das Ergebnis auf die Seite (keine Pure Function)
function zeigeErgebnis(ergebnis) {
  const box = document.getElementById("ergebnis");
  const prozent = Math.round(ergebnis.grad * 100);
  const stundenJahr = ergebnis.stundenProJahr.toLocaleString("de-DE");
  const stunden = ergebnis.gesparteStunden.toLocaleString("de-DE");
  const euro = ergebnis.gesparteEuro.toLocaleString("de-DE");

  box.innerHTML = `
    <h2>Dein Automatisierungspotenzial</h2>
    <p>Heute fallen für diese Aufgaben rund <strong>${stundenJahr} Stunden pro Jahr</strong> an.</p>
    <p>Davon lassen sich etwa <strong>${prozent} %</strong> automatisieren. Deine mögliche Ersparnis:</p>
    <p class="gross">${stunden} Stunden und ${euro} € pro Jahr</p>
    <p class="hinweis">Das ist die Arbeitszeit und die Personalkosten, die du pro Jahr einsparen kannst. Die Kosten für die Automatisierung selbst sind darin noch nicht abgezogen. Schätzung auf Basis typischer Werte für deinen Bereich – kein Versprechen, sondern ein Startpunkt.</p>
  `;

  box.scrollIntoView({ behavior: "smooth" });
}
// Anzeige der KI-Ideen – nur mit textContent, weil die Texte von der KI kommen
function zeigeIdeen(box, antwort) {
  box.textContent = "";

  if (!antwort.ideenOk || !Array.isArray(antwort.ideen)) {
    box.textContent = "Die KI-Ideen konnten gerade nicht erstellt werden. Dein Ergebnis oben ist trotzdem vollständig.";
    return;
  }

  const ueberschrift = document.createElement("h2");
  ueberschrift.textContent = "3 Ideen für deine Automatisierung";
  box.append(ueberschrift);

  for (const idee of antwort.ideen) {
    const karte = document.createElement("div");
    karte.className = "idee";

    const titel = document.createElement("h3");
    titel.textContent = idee.titel;

    const beschreibung = document.createElement("p");
    beschreibung.textContent = idee.beschreibung;

    const details = document.createElement("p");
    details.className = "hinweis";
    details.textContent = `Werkzeuge: ${idee.werkzeuge} · Aufwand: ${idee.aufwand}`;

    karte.append(titel, beschreibung, details);
    box.append(karte);
  }
}
// Schickt die Formulardaten an n8n und gibt die Antwort zurück
// Schickt die Formulardaten an n8n und gibt die Antwort zurück
async function sendeAnN8n(daten) {
  if (!WEBHOOK_URL) {
    throw new Error("Keine erlaubte n8n-Adresse im Link");
  }
  const antwort = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(daten),
    signal: AbortSignal.timeout(45000),
  });

  const json = await antwort.json().catch(() => ({}));

  if (!antwort.ok) {
    const fehler = new Error(`n8n antwortet mit Status ${antwort.status}`);
    fehler.probleme = json.probleme ?? [];
    throw fehler;
  }

  return json;
}

const form = document.getElementById("rechner-form");
const button = form.querySelector("button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const daten = Object.fromEntries(new FormData(form));

  const eingaben = {
    stunden: Number(daten.stunden),
    personen: Number(daten.personen),
    stundensatz: Number(daten.stundensatz),
    bereich: daten.bereich,
  };

  // 1. Sofort-Ergebnis (funktioniert immer, auch ohne n8n)
  const ergebnis = berechnePotenzial(eingaben);
  zeigeErgebnis(ergebnis);

  // 2. Antwort von n8n holen
  const kiBox = document.getElementById("ki-ideen");
  kiBox.textContent = "KI-Ideen werden geladen …";
  button.disabled = true;
  button.textContent = "Wird berechnet …";

  try {
    const antwortN8n = await sendeAnN8n(daten);
    console.log("Antwort von n8n:", antwortN8n);
    zeigeIdeen(kiBox, antwortN8n);
  } catch (fehler) {
    console.error("Fehler:", fehler);
    if (fehler.probleme?.length > 0) {
      kiBox.textContent = `Bitte prüfe deine Eingaben: ${fehler.probleme.join(", ")}`;
    } else {
      kiBox.textContent = "Die KI-Ideen sind gerade offline. Dein Ergebnis oben ist trotzdem vollständig. Versuch es später noch einmal.";
    }
  } finally {
    button.disabled = false;
    button.textContent = "Potenzial berechnen";
  }
});