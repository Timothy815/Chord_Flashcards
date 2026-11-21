"use strict";

const byId = (id) => document.getElementById(id);
const shapes = ["C", "A", "G", "E", "D"];
const baseRoots = { C: 0, A: 9, G: 7, E: 4, D: 2 };
const tuning = [40, 45, 50, 55, 59, 64];
const strings = ["E", "A", "D", "G", "B", "E"];
const pitchNames = {
  sharp: ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"],
  flat: ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"]
};
const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const templates = {
  C: { full: [null, 3, 2, 0, 1, 0], partial: [null, null, 2, 0, 1, null] },
  A: { full: [null, 0, 2, 2, 2, 0], partial: [null, null, 2, 2, 2, null] },
  G: { full: [3, 2, 0, 0, 0, 3], partial: [null, 2, 0, 0, null, null] },
  E: { full: [0, 2, 2, 1, 0, 0], partial: [null, null, 2, 1, 0, null] },
  D: { full: [null, null, 0, 2, 3, 2], partial: [null, null, null, 2, 3, 2] }
};
const voicingNames = { full: "Full shape", partial: "3-string triad" };
const inversionNames = { 0: "Root position", 4: "First inversion", 7: "Second inversion" };
const questions = {
  all: ["Identify this chord", "Name its root, CAGED shape, voicing, and notes."],
  root: ["What’s the chord root?", "Name the note this major chord is built on."],
  shape: ["Which CAGED shape is this?", "Identify the open-chord shape this fingering comes from."],
  voicing: ["What’s the voicing?", "Name the voicing and identify the inversion from its bass note."],
  notes: ["Which notes are sounding?", "Name the pitch on each played string from low E to high E."]
};
const pitchClass = (number) => ((number % 12) + 12) % 12;
const roots = pitchNames.sharp.map((_, index) => index);

const deck = shapes.flatMap((shape) =>
  roots.flatMap((root) =>
    Object.entries(templates[shape]).map(([voicing, template]) => {
      const offset = pitchClass(root - baseRoots[shape]);
      const frets = template.map((fret) => fret === null ? null : fret + offset);
      const pitches = frets.map((fret, index) => fret === null ? null : tuning[index] + fret);
      const bass = Math.min(...pitches.filter((note) => note !== null));
      return { shape, root, voicing, frets, pitches, bass };
    })
  )
);

function namedTone(pitch, rootName, root) {
  const letters = Object.keys(natural);
  const degree = { 0: 0, 4: 2, 7: 4 }[pitchClass(pitch - root)];
  const letter = letters[(letters.indexOf(rootName[0]) + degree) % 7];
  const difference = ((pitchClass(pitch - natural[letter]) + 6) % 12) - 6;
  return letter + (difference < 0 ? "♭".repeat(-difference) : "♯".repeat(difference));
}

function defaultFilters() {
  return { shapes: [...shapes], roots: [...roots], voicings: ["full", "partial"], focus: "all", spelling: "sharp", mode: "choice" };
}

const storageKey = "fretboard-recall-sets-v1";
let presets = [];
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (Array.isArray(saved)) presets = saved;
} catch {
  // Practice still works when browser storage is unavailable.
}

let active = defaultFilters();
let queue = [];
let index = 0;
let recognized = 0;
let skipped = 0;
let missed = [];
let revealed = false;
let hint = false;
let responses = [];
let steps = [];
let choices = [];
let answered = 0;
let passed = false;

function option(container, value, label) {
  const wrapper = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = value;
  input.checked = true;
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(input, text);
  byId(container).append(wrapper);
}

for (const shape of shapes) option("shape-filters", shape, shape);
for (const root of roots) option("root-filters", root, pitchNames.sharp[root]);
for (const [value, label] of Object.entries(voicingNames)) option("voicing-filters", value, label);

function values(id) {
  return Array.from(byId(id).querySelectorAll("input:checked"), (input) => input.value);
}

function readFilters() {
  return {
    shapes: values("shape-filters"),
    roots: values("root-filters").map(Number),
    voicings: values("voicing-filters"),
    focus: byId("focus").value,
    spelling: byId("spelling").value,
    mode: byId("mode").value
  };
}

function fillFilters(filters) {
  for (const [id, selected] of [["shape-filters", filters.shapes], ["root-filters", filters.roots], ["voicing-filters", filters.voicings]]) {
    const desired = new Set(selected.map(String));
    for (const input of byId(id).querySelectorAll("input")) input.checked = desired.has(input.value);
  }
  byId("focus").value = filters.focus;
  byId("spelling").value = filters.spelling;
  byId("mode").value = filters.mode ?? "choice";
  updateMatches();
}

function matching(filters) {
  return deck.filter((card) =>
    filters.shapes.includes(card.shape) && filters.roots.includes(card.root) && filters.voicings.includes(card.voicing)
  );
}

function updateMatches() {
  const filters = readFilters();
  const count = matching(filters).length;
  byId("matches").textContent = count === 0 ? "No matching cards" : `${count} matching ${count === 1 ? "card" : "cards"}`;
  byId("start").disabled = count === 0;
  byId("save-form").querySelector("button").disabled = count === 0;
  byId("root-filters").querySelectorAll("span").forEach((span, index) => {
    span.textContent = pitchNames[filters.spelling][index];
  });
}

function shuffled(cards) {
  const result = [...cards];
  for (let position = result.length - 1; position > 0; position--) {
    const swap = Math.floor(Math.random() * (position + 1));
    [result[position], result[swap]] = [result[swap], result[position]];
  }
  return result;
}

function startRound(cards, firstCard = null) {
  queue = firstCard ? [firstCard, ...shuffled(cards.filter((card) => card !== firstCard))] : shuffled(cards);
  index = 0;
  recognized = 0;
  answered = 0;
  skipped = 0;
  missed = [];
  prepareCard();
  renderCard();
}

function diagram(card, labelNotes, markRoots) {
  const hasOpen = card.frets.includes(0);
  const startFret = hasOpen ? 1 : Math.min(...card.frets.filter((fret) => fret !== null));
  const rootName = pitchNames[active.spelling][card.root];
  const x = (string) => 74 + string * 42;
  const top = 44;
  const row = 36;
  const descriptions = [];
  const elements = [];
  for (let fret = 0; fret <= 4; fret++) {
    const y = top + fret * row;
    elements.push(`<line x1="74" x2="284" y1="${y}" y2="${y}" stroke="${hasOpen && fret === 0 ? "#e0bb93" : "#59645a"}" stroke-width="${hasOpen && fret === 0 ? 5 : 1.3}"/>`);
    if (fret < 4) {
      elements.push(`<text x="40" y="${y + row / 2 + 4}" fill="#b6bdb4" text-anchor="middle" font-size="12">${startFret + fret}</text>`);
    }
  }
  card.frets.forEach((fret, string) => {
    const px = x(string);
    const pitch = card.pitches[string];
    elements.push(`<line x1="${px}" x2="${px}" y1="44" y2="188" stroke="#879284" stroke-width="${2.3 - string * .24}"/>`);
    const note = labelNotes && pitch !== null ? namedTone(pitch, rootName, card.root) : "";
    const root = pitch !== null && pitchClass(pitch) === card.root;
    descriptions.push(`${strings[string]} string ${fret === null ? "muted" : fret === 0 ? "open" : "fret " + fret}${note ? ", " + note : ""}${root && markRoots ? ", root" : ""}`);
    if (fret === null) {
      elements.push(`<text x="${px}" y="29" fill="#adb7ad" text-anchor="middle" font-size="20">×</text>`);
    } else {
      const y = fret === 0 ? 23 : top + (fret - startFret + .5) * row;
      const fill = root && markRoots ? "#ffc28a" : "#e5eae1";
      const circleFill = fret === 0 && !labelNotes ? "#141815" : fill;
      elements.push(`<circle cx="${px}" cy="${y}" r="${labelNotes ? 13 : fret === 0 ? 7 : 9}" fill="${circleFill}" stroke="${fill}" stroke-width="2"/>`);
      if (labelNotes) elements.push(`<text x="${px}" y="${y + 4}" fill="#161915" text-anchor="middle" font-size="11" font-weight="800">${note}</text>`);
    }
    elements.push(`<text x="${px}" y="213" fill="#c0c9bf" text-anchor="middle" font-size="13" font-weight="650">${strings[string]}</text>`);
  });
  return `<svg viewBox="0 0 358 226" role="img" aria-label="${descriptions.join("; ")}">${elements.join("")}</svg>`;
}

function answerMarkup(card) {
  const name = pitchNames[active.spelling][card.root];
  const bass = namedTone(card.bass, name, card.root);
  const inversion = inversionNames[pitchClass(card.bass - card.root)];
  const notes = card.pitches.filter((pitch) => pitch !== null).map((pitch) => namedTone(pitch, name, card.root));
  return `<h3>${name} major · ${card.shape} shape</h3><p><b>${voicingNames[card.voicing]}</b> · ${inversion} · Bass ${bass}</p><p><b>Notes, low to high</b> · ${notes.join(" · ")}</p>`;
}

const quizPrompts = {
  root: ["What is the chord root?", "Enter a note such as C# or Db."],
  shape: ["Which CAGED shape is this?", "Enter one letter from C, A, G, E, or D."],
  voicing: ["Which voicing is shown?", "Enter full shape or triad."],
  inversion: ["What is the inversion?", "Enter root position, first inversion, or second inversion."],
  notes: ["Which notes are sounding, low to high?", "Separate notes with spaces or commas. Include repeated notes and omit muted strings."]
};

const stepNames = { root: "Root", shape: "Shape", voicing: "Voicing", inversion: "Inversion", notes: "Notes" };

function normalizeNote(input) {
  const match = input.toLowerCase().match(/^([a-g])([#♯]{1,2}|[b♭]{1,2}|[x𝄪𝄫])?$/u);
  if (!match) return null;
  const offsets = { "#": 1, "♯": 1, b: -1, "♭": -1, x: 2, "𝄪": 2, "𝄫": -2 };
  return pitchClass(natural[match[1].toUpperCase()] + [...(match[2] ?? "")].reduce((sum, accidental) => sum + offsets[accidental], 0));
}

function answerFor(card, step) {
  const name = pitchNames[active.spelling][card.root];
  if (step === "root") return { key: card.root, label: name };
  if (step === "shape") return { key: card.shape, label: card.shape + " shape" };
  if (step === "voicing") return { key: card.voicing, label: voicingNames[card.voicing] };
  if (step === "inversion") {
    const key = pitchClass(card.bass - card.root);
    return { key, label: inversionNames[key] };
  }
  const pitches = card.pitches.filter((pitch) => pitch !== null);
  return { key: pitches.map(pitchClass).join(","), label: pitches.map((pitch) => namedTone(pitch, name, card.root)).join(" · ") };
}

function typedKey(step, raw) {
  const value = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (step === "root") return normalizeNote(value.replace(/\s*(major|maj)$/, ""));
  if (step === "shape") return value.replace(/[- ]*shape$/, "").toUpperCase();
  if (step === "voicing") {
    if (/^(full( shape| chord)?|complete shape)$/.test(value)) return "full";
    if (/^(triad|partial( shape)?|(3|three)[ -]string( triad)?)$/.test(value)) return "partial";
    return null;
  }
  if (step === "inversion") {
    if (/^(0|root( position)?|root inversion)$/.test(value)) return 0;
    if (/^(1|first|1st)( inversion)?$/.test(value)) return 4;
    if (/^(2|second|2nd)( inversion)?$/.test(value)) return 7;
    return null;
  }
  const notes = value.split(/[\s,;·–—-]+/).filter(Boolean).map(normalizeNote);
  return notes.includes(null) ? null : notes.join(",");
}

function prepareCard() {
  revealed = false;
  hint = false;
  passed = false;
  responses = [];
  const focus = active.focus;
  steps = focus === "all" ? ["root", "shape", "voicing", "inversion", "notes"]
    : focus === "voicing" ? ["voicing", "inversion"] : [focus];
  prepareChoices();
}

function prepareChoices() {
  const card = queue[index];
  const step = steps[responses.length];
  if (!card || !step || active.mode !== "choice") return;
  const correct = answerFor(card, step);
  const candidates = new Map();
  for (const other of shuffled(deck)) {
    if (step === "notes" && other.voicing !== card.voicing) continue;
    const answer = answerFor(other, step);
    if (step === "notes" && answer.key.split(",").length !== correct.key.split(",").length) continue;
    if (answer.key !== correct.key) candidates.set(answer.key, answer);
  }
  choices = shuffled([correct, ...[...candidates.values()].slice(0, 3)]);
}

function renderQuiz() {
  const step = steps[responses.length];
  const show = active.mode !== "flip" && !revealed;
  byId("quiz").hidden = !show;
  if (!show) return;
  const [prompt, format] = quizPrompts[step];
  byId("quiz-question").textContent = steps.length > 1 ? `${responses.length + 1} of ${steps.length} · ${prompt}` : prompt;
  byId("answer-format").textContent = format;
  byId("answer-format").hidden = active.mode !== "typed";
  byId("typed-form").hidden = active.mode !== "typed";
  byId("choices").hidden = active.mode !== "choice";
  byId("choices").replaceChildren();
  for (const choice of active.mode === "choice" ? choices : []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = choice.label;
    button.onclick = () => submitAnswer(choice.key, choice.label);
    byId("choices").append(button);
  }
  byId("response-list").replaceChildren();
  byId("response-list").hidden = responses.length === 0;
  for (const response of responses) {
    const item = document.createElement("li");
    item.textContent = response.label;
    byId("response-list").append(item);
  }
}

function renderCard() {
  const card = queue[index];
  const flip = active.mode === "flip";
  byId("known").textContent = `${recognized} / ${answered}`;
  byId("review-count").textContent = missed.length;
  byId("score-label").textContent = flip ? "Self-score" : "Correct";
  byId("controls").hidden = !card;
  byId("summary-actions").hidden = Boolean(card);
  byId("hint").hidden = !card || revealed;
  byId("progress").textContent = card ? `Card ${index + 1} of ${queue.length}` : "Round complete";
  byId("answer").hidden = !card || !revealed;
  byId("diagram").hidden = !card;
  byId("feedback").textContent = card && revealed && !flip
    ? passed ? "Correct!" : "Review this card. Check your answers below."
    : "";

  if (!card) {
    byId("quiz").hidden = true;
    byId("prompt").textContent = "Practice complete";
    byId("instructions").textContent = `${recognized} of ${answered} correct · ${missed.length} to review · ${skipped} skipped`;
    byId("retry").hidden = missed.length === 0;
    return;
  }
  const [title, instructions] = questions[active.focus];
  byId("prompt").textContent = title;
  byId("instructions").textContent = flip ? instructions : "";
  byId("hint").textContent = hint ? "Hide root dots" : "Show root dots";
  byId("hint").setAttribute("aria-pressed", String(hint));
  byId("diagram").innerHTML = diagram(card, revealed, revealed || hint);
  byId("answer").innerHTML = revealed ? answerMarkup(card) : "";
  if (revealed && responses.length) {
    const list = document.createElement("ul");
    list.className = "graded-answers";
    for (const response of responses) {
      const item = document.createElement("li");
      item.textContent = response.correct
        ? `${stepNames[response.step]} · ${response.label} ✓`
        : `${stepNames[response.step]} · You entered ${response.label}. Correct answer: ${response.expected}.`;
      list.append(item);
    }
    byId("answer").append(list);
  }
  renderQuiz();
  byId("reveal").hidden = revealed || !flip;
  byId("skip").hidden = revealed;
  byId("again").hidden = !revealed || !flip;
  byId("correct").hidden = !revealed || !flip;
  byId("next-card").hidden = !revealed || flip;
  byId("next-card").textContent = index + 1 === queue.length ? "Finish round" : "Next card";
}

function focusQuestion() {
  const target = active.mode === "flip" ? "reveal" : active.mode === "typed" ? "typed-answer" : "quiz-question";
  byId(target).focus();
}

function submitAnswer(key, label) {
  if (revealed || !queue[index]) return;
  const step = steps[responses.length];
  const expected = answerFor(queue[index], step);
  responses.push({ step, label, expected: expected.label, correct: key === expected.key });
  byId("typed-form").reset();
  if (responses.length === steps.length) {
    revealed = true;
    passed = responses.every((response) => response.correct);
    record(passed ? "correct" : "review");
  } else {
    prepareChoices();
  }
  renderCard();
  if (revealed) byId("next-card").focus();
  else focusQuestion();
}

function record(result) {
  if (result === "skip") {
    skipped++;
    return;
  }
  answered++;
  if (result === "correct") recognized++;
  else missed.push(queue[index]);
}

function advance(result) {
  if (!queue[index]) return;
  if (result) record(result);
  index++;
  byId("typed-form").reset();
  prepareCard();
  renderCard();
  if (queue[index]) focusQuestion();
  else byId(missed.length ? "retry" : "restart").focus();
}

function launch(filters) {
  active = { ...defaultFilters(), ...filters };
  byId("typed-form").reset();
  startRound(matching(active));
  focusQuestion();
}

function savePresets(next) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
    presets = next;
    renderPresets();
    return true;
  } catch {
    byId("save-status").textContent = "This browser couldn’t save practice sets.";
    return false;
  }
}

function renderPresets() {
  byId("presets").replaceChildren();
  for (const { name, filters } of presets) {
    const row = document.createElement("li");
    const load = document.createElement("button");
    const remove = document.createElement("button");
    load.className = remove.className = "small-button";
    load.type = remove.type = "button";
    load.textContent = name;
    load.setAttribute("aria-label", `Practice ${name}`);
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${name}`);
    load.onclick = () => {
      fillFilters(filters);
      launch(filters);
    };
    remove.onclick = () => {
      if (savePresets(presets.filter((preset) => preset.name !== name))) byId("save-status").textContent = "Practice set removed.";
    };
    row.append(load, remove);
    byId("presets").append(row);
  }
}

byId("save-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = byId("preset-name").value.trim();
  const filters = readFilters();
  if (!name || !matching(filters).length) return;
  const existing = presets.some((preset) => preset.name === name);
  if (savePresets([...presets.filter((preset) => preset.name !== name), { name, filters }])) {
    byId("preset-name").value = "";
    byId("save-status").textContent = existing ? "Practice set updated." : "Practice set saved.";
  }
});
document.querySelector(".filter-body").addEventListener("change", updateMatches);
byId("reset").onclick = () => fillFilters(defaultFilters());
byId("start").onclick = () => launch(readFilters());
byId("hint").onclick = () => { hint = !hint; renderCard(); };
byId("reveal").onclick = () => { revealed = true; renderCard(); byId("correct").focus(); };
byId("typed-form").onsubmit = (event) => {
  event.preventDefault();
  const value = byId("typed-answer").value.trim();
  if (value) submitAnswer(typedKey(steps[responses.length], value), value);
};
byId("next-card").onclick = () => advance();
byId("correct").onclick = () => advance("correct");
byId("again").onclick = () => advance("review");
byId("skip").onclick = () => advance("skip");
byId("retry").onclick = () => { startRound(missed); focusQuestion(); };
byId("restart").onclick = () => launch(active);
document.addEventListener("keydown", (event) => {
  if (active.mode !== "flip" || event.code !== "Space" || event.repeat || revealed || !queue[index] || event.target.closest?.("input, select, button, textarea")) return;
  event.preventDefault();
  byId("reveal").click();
});
updateMatches();
renderPresets();
startRound(deck, deck[0]);
