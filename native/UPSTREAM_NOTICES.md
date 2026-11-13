# Third-party notices

FACE FORGE's native conversion bridge depends on the following upstream project at an immutable revision:

- Project: Unlimited Tool Works
- Repository: https://github.com/the4chancup/unlimited-tool-works
- Revision: ca4fe4a32500ffc2d932a1a669a42a6f932d571a
- Packages used: model_convert, fmdl, pes_model, pes_version
- License: MIT OR Apache-2.0 (dual licensed; choose either)
- Scope: PES FMDL and PES MODEL semantic codecs, canonical model IR, material translation and version-specific skeleton retargeting.

No upstream source files are copied into this repository. Cargo fetches the pinned revision at build time. The upstream project is in active development; FACE FORGE must retain its own validation, regression tests and conversion release gates.

The corresponding upstream licence texts are included alongside this notice as `LICENSE-MIT` and `LICENSE-APACHE`. All other dependencies retain their own licences.
