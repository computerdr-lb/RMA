# Printing

## Receipt — 80 mm
The page size is set from Items & setup (default 80 mm wide, auto height).
Print dialog: choose the receipt printer, **Margins: None**, **Scale: 100%**,
headers and footers off.

## Label — 40 × 21 mm
Same dialog, choose the label printer. It prints at exactly the size shown in
the sidebar preview.

## Faint or ghosted print
Thermal printers have no grey — they dither it into scattered dots. Everything
on the receipt is therefore pure black and bold. If text still prints thin, the
web font failed to load and it fell back to Courier; bundle the font locally
instead of loading it from Google Fonts.

## Use Chrome or Edge
Firefox ignores some `@page` sizes.

## Barcode
Code 39, encoding the ticket number (CD-00001). Any cheap USB laser scanner
reads it and types the number straight into the search box.
