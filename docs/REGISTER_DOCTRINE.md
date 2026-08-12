# REGISTER DOCTRINE

Everything may register. Registration appends a canonical `logline.receipt.v0` receipt into `logline_acts`; it does not imply execution.

Implemented paths:

- `lab act` and `lab register` mint direct receipts.
- `lab send` writes an addressed receipt using canonical `if_ok`.
- `lab infer` registers an inference request as candidate memory; no model is called directly.

Activation happens later through `lab evaluate`, selector queueing, and executor dispatch.
