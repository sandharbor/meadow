/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const ADJECTIVES = [
  "bold", "calm", "cool", "dark", "deep", "fair", "fast", "free",
  "glad", "gold", "good", "keen", "kind", "late", "lean", "live",
  "long", "loud", "mild", "neat", "nice", "pale", "pink", "pure",
  "rare", "real", "rich", "ripe", "safe", "slim", "soft", "sure",
  "tall", "tame", "tidy", "tiny", "trim", "true", "vast", "warm",
  "wide", "wild", "wise", "able", "aged", "arid", "avid", "bare",
  "blue", "busy", "cozy", "dear", "dual", "dull", "each", "east",
  "easy", "even", "epic", "evil", "firm", "flat", "fond", "full",
];

const NOUNS = [
  "ash", "bay", "bee", "bud", "cap", "cub", "dew", "dot",
  "elm", "fig", "fin", "fox", "gem", "hay", "hen", "hub",
  "ice", "ivy", "jam", "jar", "jay", "jet", "key", "kit",
  "lark", "leaf", "lily", "lynx", "mint", "moth", "muse", "nest",
  "oak", "orb", "owl", "paw", "peak", "pine", "plum", "pond",
  "quill", "rain", "reed", "ridge", "rock", "root", "rose", "sage",
  "seal", "snow", "star", "tide", "vale", "vine", "wren", "yew",
  "acorn", "birch", "brook", "cedar", "cliff", "cloud", "coral", "crane",
  "creek", "daisy", "delta", "dune", "ember", "fable", "finch", "flame",
  "fleet", "forge", "frost", "glade", "grove", "haven", "heron", "jewel",
  "lemon", "lotus", "maple", "marsh", "pearl", "river", "shore", "spark",
  "stone", "storm", "swift", "trail", "trout", "tulip", "whale", "willow",
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateName(): string {
  return `${randomItem(ADJECTIVES)}-${randomItem(NOUNS)}`;
}
