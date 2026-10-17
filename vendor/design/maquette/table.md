# Tables

Pen's table guide, adapted to Maquette.

- Tables follow a strict hierarchy: **Table (frame) → Row (frame) → Cell (frame) → cell content**.
- Wide multi-column table on a phone: use cards instead of a table, unless asked otherwise.
- Tables use auto layout.
- CRITICAL: each cell is a **frame** holding its content (text, label, button…). Never put texts
  directly in a row, skipping the cell frame.

```
Table (frame, column, width fill or fixed, height hug)
├── Header row (frame, row, width fill, height 44–48 fixed, align center)
│   ├── Cell (frame, width fixed or fill, height fill, padding [0,16,0,16], align center)
│   │   └── Text (semi-bold, textSizing auto-height, width fill)
│   └── …
├── Data row (frame, row, width fill, height 52–56 fixed)
│   ├── Cell (frame, width fixed or fill, height fill)
│   │   └── Text (textSizing auto-height, width fill)
│   └── …
└── …
```

Column widths to start from: name / identifier 200–250; email, URL, description `fill`; status or badge
100–120; date 120–150; numbers 80–100 (right-aligned, tabular figures); actions 80–100.

- Rows separated by a 1 px bottom stroke or alternating tone (real tables may have lines).
- Same widths in every row, column by column: build the header row, then data rows with the same cell
  widths in the same order.
- If the user gives no data, write plausible placeholder values for each cell.
- Many rows: several batches (5–10 rows each) so the user sees progress.
- Header + filters/actions above the table; row count and pagination below.
