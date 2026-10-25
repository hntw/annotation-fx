# Annotation FX v2: real hands

The first versions of Annotation FX were built on feel. I picked a font that seemed right for Darwin, invented an
effect that seemed fun for Anning, and moved on. Some of it was good. Some of it was made up. Mary Anning never
drew ammonites in her margins.

So we started over. v2 rebuilds every style from a real page that person wrote.

## How we did it

For each person we went looking for their actual handwriting: letters, notebooks, diaries, manuscripts, minutes,
signatures. Most of it came from archives and libraries (Cambridge University Library, the Wellcome Collection, the
Royal Society, the British Library, the Library of Congress, Houghton Library, Yale, the USDA National Agricultural
Library and many more). Some came from auction listings (Bonhams, Heritage, RR Auction, dealers), which turned out to
be a great source for letters and signed pages that never made it into a museum.

Then we looked at each page and asked two questions:

1. What does the hand look like? Slant, size, pen, ink color, joined or printed, cramped or loose.
2. How did this person mark things up? Did they underline, cross out, box a word, draw an arrow, doodle in the margin?

The font comes from question 1. The effects come from question 2. If a person never did it on paper, the style
doesn't do it either.

Every style now carries a `source` field that says which page it was built from and where that page lives. The demo
shows it under every card, with a link so you can go see the real thing.

A few examples of what changed:

- **Darwin** now writes in a fast, cramped brown hand, and his arrows branch into the tree from Notebook B (the "I
  think" page).
- **Anning** lost the ammonites. Her lines climb the page and she scribbles words out in place, like her 1823
  plesiosaur letter.
- **Tagore** blacks out a struck word and threads it to the next one with a flowing line. That's what he actually
  did. His poem drafts turned crossings-out into creatures, and that habit is where his painting started.
- **Churchill** answers in red ink and pins on the red ACTION THIS DAY label he used from 1941.
- **Kusama** writes in her signature hand: quick, joined, leaning right, tall K.

## Who's in, who's out

If we couldn't find a real sample to build from, the style went. We dropped six:

- **Lascaux**: no handwriting, by definition.
- **Hildegard of Bingen**: her manuscripts were written out by scribes, not by her.
- **Jackson Pollock**: we found his signature and a signed check, but no notes or marked-up pages to build on.
- **Katherine Johnson**: we couldn't find a page in her hand that we could look at and cite.
- **Ibn al-Haytham**: his works survive in later scribes' copies. One copy in his own hand may exist in Istanbul,
  but we couldn't see it, and it's a fair copy of another author's book, not his notes.
- **Ernst Haeckel**: no good font match for his German script, and his charts ranking human "races" are not
  something we want to put a name on.

Two styles were renamed after a specific person with a documented page: "Apollo" became **Kranz** (Gene Kranz's
Apollo 16 countdown sheet), and "Seals" became **Qianlong** (the emperor's colophon and seals on a Buddhist scroll).

And we added people. Some because their hands are famous, like Lincoln, Jefferson, Douglass, Gandhi, Mandela,
Churchill, Napoleon and Elizabeth I. Some because their pages are wonderful, like Emily Dickinson, Beethoven, Zora
Neale Hurston, Paul Klee and Georgia O'Keeffe. And Bob Ross, because why not. (His style is built from his red
signature sweep, a palette-knife scrape and one small tree.)

That brings the library to 65 styles.

## On who gets picked

A list like this is a choice. The first version leaned hard toward white European men, because that's who the usual
"famous handwriting" lists are full of. We tried to do better on purpose.

When we dropped a style, we looked for a replacement who kept or improved the balance and who had a real page we
could build from. Mary Seacole replaced Katherine Johnson (which was hard, because Johnson belongs here and we hope to
add her back if a citable page turns up). George Washington Carver replaced Haeckel. C. V. Raman replaced
al-Haytham. Christine de Pizan, who copied out her own books, replaced Hildegard. Georgia O'Keeffe replaced Pollock.
Gertrude Bell replaced Lascaux.

Where we stand now: 19 of the 61 named people are women (up from 14 of 51), and about 18 are people of color. That's
still not even. The archive record itself isn't even: whose letters got kept, cataloged and photographed follows the
same lines of power as everything else. But it's better, and we'll keep working on it.

The bios got the same honesty pass. Jefferson's says he enslaved more than 600 people. Churchill's mentions the
Bengal famine. Napoleon's says he brought back slavery in the French colonies in 1802. These are short profiles, not
verdicts, but leaving those facts out would be its own choice.

## Breaking changes

- Removed styles: `lascaux`, `hildegard`, `pollock`, `johnson`, `alhaytham`, `haeckel`.
- Renamed: `apollo` is now `kranz`, `seals` is now `qianlong`.
- Every style looks different. If you pinned a look, check it.
- New: `AnnotationFX.loadFonts(ids)` loads the Google Fonts for the styles you use and resolves when they're ready.
- New: each entry in `AnnotationFX.styles` has `source` (`text`, `where`, `url`) and `fonts`.

The archive images we studied stay private (many are under copyright). The styles are homages to how these people
wrote, not copies of their pages.
