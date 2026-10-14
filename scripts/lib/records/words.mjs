// The instructor's words (red team R7, C4.10). Every act of the instructor quotes their words, and the check was
// `String(words).trim()` — so words made only of invisible characters (U+200B zero-width space, U+2060 word joiner,
// U+FEFF, a Hangul filler, a braille blank …) passed as words nobody can read. Words count only when at least one
// character a reader can SEE is in them: not white space, not a format or control character, not a combining mark on
// its own, not one of the blank-looking letters.
const BLANK = /[\s\p{Z}\p{Cc}\p{Cf}\p{M}ᅟᅠㅤﾠ⠀᠎឴឵]/gu;
/** Do the words hold at least one visible character? */
export const hasVisibleWords = (words) => words != null && String(words).replace(BLANK, "").length > 0;
