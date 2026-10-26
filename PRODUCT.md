# QuantLab

QuantLab is an experimental Spanish-language quantitative research community built by Emilio Cardona Lopez during the DeepFin research group at Universidad EIA. The current product priority is machine learning tournaments: download a versioned dataset, train externally, submit predictions, validate the file, and evaluate after a fixed deadline. Strategy backtesting remains available as a secondary area.

## Audience and success
Spanish-speaking students and researchers, including academic judges, need to understand and complete the tournament workflow. Functionality, accessibility and truthful scientific communication take priority over decoration. There is no demonstrated external user adoption or financial profitability. Synthetic practice rounds must be identified; real-data provenance belongs to the individual dataset.

## Invariants
- Preserve authentication, private experiment history, downloads, uploads, CSV validation, receipts, pagination and export.
- Practice scores remain hidden until its round has closed and been evaluated. Daily-return scores, asset names and real prices remain hidden until the entire four-round weekly tournament is finished and verified.
- Daily real tournaments use fractional returns and normalized MAE improvement against zero, with four valid submissions required for the general ranking. They are separate from the synthetic Spearman pilot.
- Spearman is a ranking correlation, not a return.
- Do not invent performance, endorsements, user counts or prize promises.
- Preserve existing routes and secondary product functions.

## Visual mandate
The approved landing and dashboard mockups define a light institutional identity: paper and pale blue surfaces, navy typography, blue actions, and restrained green status. Build in the existing Next.js application. The public landing leads with the tournament workflow and verifiable synthetic pilot; the authenticated dashboard prioritizes the next ML action, evidence, private history and honest loading/error states. Secondary product routes must remain usable under the shared light shell.
