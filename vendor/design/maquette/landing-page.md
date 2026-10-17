# Landing page

Pen's landing-page guide (text kept), with Maquette notes at the end. For public pages the house rules
apply too: `guide('regles-maison')`.

## Purpose

**Conversion intent.** Drive one action — sign up, buy, request a demo. Make every element move the visitor toward that action. Remove everything that doesn't.

**Transformation over features.** Show the outcome, not the tool. Visitors buy a better version of themselves — show them who they become.

## Content

**Hero = the entire pitch compressed.** Compress the entire pitch into the first screen. Communicate what this is, why it matters, and what to do next. Use one idea, one headline, one call to action.

**Headline strength.** Lead with the strongest headline form. Transformation ("Finally feel in control") beats outcome ("Ship faster"), which beats benefit ("Write 10x faster"), which beats feature ("AI writing assistant").

**Imagery.** Show scenes from the visitor's future — people in the outcome state, not product screenshots in isolation. Always add a contrast treatment when placing text over images — overlay, shadow, or text in its own container. Never stretch or distort.

**Color for conversion.** Make the CTA the most prominent element on the page. Reserve the accent color for actions — don't dilute it across decorative elements. Ensure sufficient contrast for all text against its background.

## Structure

**Composition.** Pick one alignment axis per section — never mix left-aligned and centered content in the same section. Group related elements tightly, separate groups generously — proximity signals relationship.

**Rhythm.** Alternate between text-heavy and visual sections. Never stack sections with similar density. Use dark sections for credibility and depth, light sections for explanation and detail.

**Typography.** Never set body text below 14px. Choose a typographic scale with clear size jumps between hierarchy levels. Don't center-align more than 2-3 lines of text. Keep body copy line length to 50-75 characters.

**Section flow.** Build a narrative arc — promise, proof, action. Move from what it is, to why it works, to why you should trust it, to what to do next.

**Content before visuals.** Define the narrative and messaging before making visual decisions. Let the words drive the design, not the other way around.

## In Maquette

- The page is one top-level frame 1440 wide, `height:{mode:"hug"}`, `layout:{mode:"auto",direction:"column"}`, `clip:true`, gap 0, filled with the ground colour. Each section is a child frame `width:{mode:"fill"}`, `height:{mode:"hug"}` with its own padding (side margins identical in every section, e.g. 96–120 px) and its own `fills` (a section may change the whole field colour).
- The first screen is 1440×900: the hero (with its navigation bar) should fill it with one dominant thing. Hero headline 64–120 px, body 18–20 px.
- Build in this order, one `appliquer` per section: navigation + hero, then each section of the argument, then the footer. `capture` + `verifier_gout` after each.
- Text over a picture: a picture frame (`image` with `fit:"cover"`) and the text in an absolute overlay or a separate band; check contrast on the capture.
- Real pictures: `images` tool if present; otherwise image elements sized and named for what they will hold ("Photo — la salle le soir"), and say so in your reply.
